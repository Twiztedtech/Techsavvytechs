import { randomUUID } from 'node:crypto';
import { adminAuth, adminDb, adminStorage } from './_lib/firebase-admin.js';
import { writeAudit } from './_lib/audit.js';
import { SURVEY_MODULES, snapshotModule } from './_lib/survey-definitions.js';

const MANAGER_ROLES = new Set(['assistant_admin', 'dispatcher']);
const REVIEWER_ROLES = new Set(['assistant_admin']);
const ESTIMATOR_ROLES = new Set(['assistant_admin', 'office_billing']);
const EDITABLE = new Set(['draft', 'assigned', 'in_progress', 'needs_revision']);
const STATUSES = new Set(['draft', 'assigned', 'in_progress', 'submitted', 'needs_revision', 'approved', 'shared_with_customer', 'converted_to_estimate', 'archived']);
// Keep the encoded request comfortably below serverless request-body limits.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function send(res, status, body) {
  res.status(status).json(body);
}

function jsonValue(value) {
  if (!value) return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, jsonValue(child)]));
  return value;
}

async function actorFor(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required.');
  const decoded = await adminAuth.verifyIdToken(token);
  const contractorSnapshot = decoded.contractor === true
    ? await adminDb.collection('contractors').where('authUid', '==', decoded.uid).limit(1).get()
    : null;
  return {
    ...decoded,
    contractorId: contractorSnapshot?.docs[0]?.id || null,
    isManager: decoded.admin === true || MANAGER_ROLES.has(decoded.staffRole),
    isReviewer: decoded.admin === true || REVIEWER_ROLES.has(decoded.staffRole),
    canEstimate: decoded.admin === true || ESTIMATOR_ROLES.has(decoded.staffRole),
  };
}

function isAssigned(survey, actor) {
  const ids = survey.assignedContractorIds || [];
  const uids = survey.assignedContractorUids || [];
  return Boolean(actor.contractor === true && (ids.includes(actor.contractorId) || uids.includes(actor.uid)));
}

function canRead(survey, actor) {
  return actor.isManager || actor.isReviewer || actor.staffRole === 'office_billing' || isAssigned(survey, actor);
}

function canEdit(survey, actor) {
  return EDITABLE.has(survey.status) && (actor.isManager || isAssigned(survey, actor));
}

async function loadSurvey(id, actor) {
  const ref = adminDb.collection('site_surveys').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Survey not found.');
  const survey = { id: snap.id, ...snap.data() };
  if (!canRead(survey, actor)) throw new Error('You do not have access to this survey.');
  return { ref, survey };
}

async function nextSurveyNumber() {
  const counterRef = adminDb.collection('settings').doc('survey_counter');
  return adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(counterRef);
    const next = Number(snap.data()?.next || 1001);
    transaction.set(counterRef, { next: next + 1, updatedAt: new Date() }, { merge: true });
    return `SS-${String(next).padStart(5, '0')}`;
  });
}

async function listSurveys(actor) {
  let snap;
  if (actor.isManager || actor.isReviewer || actor.staffRole === 'office_billing') {
    snap = await adminDb.collection('site_surveys').orderBy('updatedAt', 'desc').limit(100).get();
  } else if (actor.contractor === true) {
    const byUid = await adminDb.collection('site_surveys').where('assignedContractorUids', 'array-contains', actor.uid).limit(100).get();
    const byId = actor.contractorId
      ? await adminDb.collection('site_surveys').where('assignedContractorIds', 'array-contains', actor.contractorId).limit(100).get()
      : { docs: [] };
    const unique = new Map([...byUid.docs, ...byId.docs].map((doc) => [doc.id, doc]));
    snap = { docs: [...unique.values()] };
  } else {
    throw new Error('Survey access is not enabled for this account.');
  }
  return snap.docs.map((doc) => jsonValue({ id: doc.id, ...doc.data() }));
}

async function getSurvey(id, actor) {
  const { survey } = await loadSurvey(id, actor);
  const moduleSnap = await adminDb.collection('site_surveys').doc(id).collection('module_responses').get();
  const modules = await Promise.all(moduleSnap.docs.map(async (moduleDoc) => {
    const records = await moduleDoc.ref.collection('records').orderBy('createdAt', 'asc').get();
    return jsonValue({ id: moduleDoc.id, ...moduleDoc.data(), records: records.docs.map((record) => ({ id: record.id, ...record.data() })) });
  }));
  const attachmentSnap = await adminDb.collection('site_surveys').doc(id).collection('attachments').orderBy('createdAt', 'asc').get();
  const attachments = await Promise.all(attachmentSnap.docs.map(async (doc) => {
    const data = doc.data();
    const [url] = await adminStorage.file(data.path).getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60 * 1000 });
    return { id: doc.id, ...data, url };
  }));
  return jsonValue({ ...survey, modules, attachments });
}

function addBomItem(map, sku, quantity, source, description = '') {
  const key = safeText(sku, 100).toUpperCase();
  if (!key || !Number.isFinite(quantity) || quantity <= 0) return;
  const current = map.get(key) || { sku: key, quantity: 0, sources: [], description };
  current.quantity += quantity;
  current.sources.push(source);
  if (!current.description && description) current.description = description;
  map.set(key, current);
}

async function estimatePlan(id, actor) {
  if (!actor.canEstimate) throw new Error('Estimator access is required.');
  const survey = await getSurvey(id, actor);
  const bom = new Map();
  const cableRecords = survey.modules.find((module) => module.id === 'structured_cabling')?.records || [];
  let totalDrops = 0;
  let openPathwayFeet = 0;
  for (const record of cableRecords) {
    const feet = Number(record.estimatedFeet || 0);
    totalDrops += Number(record.dropCount || 0);
    if (!record.conduitRequired) openPathwayFeet += feet;
    if (record.cableType && feet > 0) {
      const quantity = /CAT\d.*BOX|CABLE.*BOX|1000/i.test(record.cableType) ? Math.ceil((feet * 1.15) / 1000) : Math.ceil(feet * 1.15);
      addBomItem(bom, record.cableType, quantity, record.id, `${record.cableType} — ${Math.ceil(feet * 1.15)} ft including 15% waste`);
    }
    addBomItem(bom, record.partType, Number(record.quantity || 1), record.id, record.targetDevice || record.partType);
  }
  addBomItem(bom, 'RJ45-JACK-C6', totalDrops * 2, 'derived-terminations', 'Cat6 terminations (device and patch-panel ends)');
  addBomItem(bom, 'C6-PATCH-7FT', totalDrops, 'derived-patch-cords', '7 ft Cat6 patch cords');
  addBomItem(bom, 'JHOOK-2IN-PLEN', Math.ceil(openPathwayFeet / 5), 'derived-pathway', '2 in plenum J-hooks at 5 ft intervals');
  for (const module of survey.modules) {
    if (['common_site', 'structured_cabling', 'rf_signal', 'floor_plan'].includes(module.id)) continue;
    for (const record of module.records || []) addBomItem(bom, record.partType, Number(record.quantity || 1), record.id, record.label || record.partType);
  }
  const donorAzimuths = new Set((survey.modules.find((module) => module.id === 'rf_signal')?.records || []).filter((record) => record.donorCandidate).map((record) => String(record.azimuth || 'unspecified')));
  addBomItem(bom, 'ANT-YAGI-DIR-700', donorAzimuths.size, 'derived-rf-donors', 'Directional exterior donor antenna');
  const catalogSnap = await adminDb.collection('catalog_items').limit(1000).get();
  const catalogBySku = new Map(catalogSnap.docs.map((doc) => [String(doc.data().sku || '').trim().toUpperCase(), { id: doc.id, ...doc.data() }]));
  const items = [...bom.values()].map((item) => {
    const catalog = catalogBySku.get(item.sku);
    return {
      ...item,
      quantity: Math.max(1, Math.ceil(item.quantity * 100) / 100),
      catalogItemId: catalog?.id || null,
      catalogMatched: Boolean(catalog),
      description: catalog?.name || item.description || item.sku,
      unitPrice: Number(catalog?.unitPrice || 0),
      category: catalog?.category || '',
    };
  });
  return { surveyId: id, surveyNumber: survey.surveyNumber, status: survey.status, quoteId: survey.quoteId || null, wastePercent: 15, items };
}

async function bootstrap(actor) {
  const surveys = await listSurveys(actor);
  const [templateSnap, customModuleSnap] = await Promise.all([
    adminDb.collection('survey_templates').limit(100).get(),
    adminDb.collection('survey_module_definitions').where('active', '==', true).limit(100).get(),
  ]);
  const moduleDefinitions = [
    ...Object.values(SURVEY_MODULES),
    ...customModuleSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  ];
  const templates = templateSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  if (!actor.isManager) return jsonValue({ surveys, customers: [], jobs: [], contractors: [], templates, moduleDefinitions });
  const [customers, jobs, contractors] = await Promise.all([
    adminDb.collection('customers').limit(250).get(),
    adminDb.collection('jobs').limit(150).get(),
    adminDb.collection('contractors').limit(100).get(),
  ]);
  return jsonValue({
    surveys,
    customers: customers.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    jobs: jobs.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    contractors: contractors.docs.map((doc) => ({ id: doc.id, ...doc.data() })), templates, moduleDefinitions,
  });
}

function safeText(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanRecord(moduleKey, input) {
  const common = {
    label: safeText(input.label, 200),
    notes: safeText(input.notes, 3000),
    partType: safeText(input.partType, 100),
    quantity: Number(input.quantity || 0),
    unit: safeText(input.unit, 30),
  };
  if (moduleKey === 'structured_cabling') return {
    ...common,
    targetDevice: safeText(input.targetDevice, 100), cableType: safeText(input.cableType, 100),
    dropCount: Number(input.dropCount || 0), estimatedFeet: Number(input.estimatedFeet || 0),
    origin: safeText(input.origin, 300), destination: safeText(input.destination, 300),
    conduitRequired: Boolean(input.conduitRequired), poeRequired: Boolean(input.poeRequired),
    pathwayNotes: safeText(input.pathwayNotes, 3000),
  };
  if (moduleKey === 'rf_signal') return {
    ...common,
    carrier: safeText(input.carrier, 100), technology: safeText(input.technology, 60), band: safeText(input.band, 60),
    rsrp: Number(input.rsrp || 0), rsrq: Number(input.rsrq || 0), sinr: Number(input.sinr || 0),
    measurementPoint: safeText(input.measurementPoint, 300), floor: safeText(input.floor, 50),
    donorCandidate: Boolean(input.donorCandidate), azimuth: Number(input.azimuth || 0),
  };
  if (moduleKey === 'camera_security' || moduleKey === 'pos_register' || moduleKey === 'floor_plan' || moduleKey.startsWith('custom_')) {
    return Object.fromEntries(Object.entries(input).slice(0, 100).map(([key, value]) => [safeText(key, 80), typeof value === 'boolean' ? value : typeof value === 'number' ? value : safeText(value, 3000)]));
  }
  throw new Error('Unknown module.');
}

async function resolveModule(key) {
  if (SURVEY_MODULES[key]) return snapshotModule(key);
  const snap = await adminDb.collection('survey_module_definitions').doc(key).get();
  if (!snap.exists || snap.data().active === false) throw new Error(`Unknown survey module: ${key}`);
  return jsonValue({ key: snap.id, ...snap.data() });
}

async function createSurvey(body, actor) {
  if (!actor.isManager) throw new Error('Manager access is required to create surveys.');
  const requestedKeys = [...new Set(['common_site', ...(Array.isArray(body.moduleKeys) ? body.moduleKeys : [])])].slice(0, 20);
  const definitions = await Promise.all(requestedKeys.map(resolveModule));
  const moduleKeys = definitions.map((definition) => definition.key);
  const surveyNumber = await nextSurveyNumber();
  const ref = adminDb.collection('site_surveys').doc();
  const now = new Date();
  const contractors = Array.isArray(body.contractors) ? body.contractors.slice(0, 20) : [];
  const data = {
    surveyNumber, status: contractors.length ? 'assigned' : 'draft',
    customerId: safeText(body.customerId, 200), customerName: safeText(body.customerName, 300),
    workOrderId: safeText(body.workOrderId, 200), siteName: safeText(body.siteName, 300),
    siteAddress: safeText(body.siteAddress, 500), scheduledAt: safeText(body.scheduledAt, 100),
    contactName: safeText(body.contactName, 200), contactPhone: safeText(body.contactPhone, 100),
    assignedContractorIds: contractors.map((item) => item.id).filter(Boolean),
    assignedContractorUids: contractors.map((item) => item.authUid).filter(Boolean),
    moduleKeys, createdBy: actor.uid, createdAt: now, updatedAt: now,
  };
  const batch = adminDb.batch();
  batch.set(ref, data);
  for (const definition of definitions) {
    const key = definition.key;
    batch.set(ref.collection('module_responses').doc(key), {
      moduleKey: key, definition, answers: {}, updatedAt: now,
    });
  }
  await batch.commit();
  await writeAudit({ actor, action: 'survey.created', entityType: 'site_survey', entityId: ref.id, summary: `Created ${surveyNumber}` });
  return getSurvey(ref.id, actor);
}

async function saveModuleDefinition(body, actor) {
  if (actor.admin !== true) throw new Error('Administrator access is required to manage modules.');
  const title = safeText(body.title, 200);
  if (!title) throw new Error('Module title is required.');
  const id = body.id && String(body.id).startsWith('custom_') ? safeText(body.id, 100) : `custom_${randomUUID().slice(0, 12)}`;
  const fields = (Array.isArray(body.fields) ? body.fields : []).slice(0, 50).map((field, index) => ({
    key: safeText(field.key, 80) || `field_${index + 1}`,
    label: safeText(field.label, 200) || `Field ${index + 1}`,
    type: ['text', 'textarea', 'number', 'checkbox', 'select', 'photo'].includes(field.type) ? field.type : 'text',
    options: Array.isArray(field.options) ? field.options.map((value) => safeText(value, 100)).filter(Boolean).slice(0, 30) : [],
    required: Boolean(field.required),
  }));
  if (!fields.length) throw new Error('Add at least one field.');
  await adminDb.collection('survey_module_definitions').doc(id).set({ key: id, title, version: Number(body.version || 1), recordType: 'custom_record', fields, active: true, updatedAt: new Date(), updatedBy: actor.uid }, { merge: true });
  await writeAudit({ actor, action: 'survey_module.saved', entityType: 'survey_module_definition', entityId: id, summary: `Saved survey module ${title}` });
  return { id, key: id, title, version: Number(body.version || 1), recordType: 'custom_record', fields, active: true };
}

async function saveTemplate(body, actor) {
  if (!actor.isManager) throw new Error('Manager access is required to manage templates.');
  const name = safeText(body.name, 200);
  if (!name) throw new Error('Template name is required.');
  const moduleKeys = [...new Set(Array.isArray(body.moduleKeys) ? body.moduleKeys.map((value) => safeText(value, 100)) : [])].slice(0, 20);
  await Promise.all(moduleKeys.map(resolveModule));
  const ref = body.id ? adminDb.collection('survey_templates').doc(safeText(body.id, 200)) : adminDb.collection('survey_templates').doc();
  await ref.set({ name, description: safeText(body.description, 500), moduleKeys, active: true, updatedAt: new Date(), updatedBy: actor.uid }, { merge: true });
  return { id: ref.id, name, moduleKeys };
}

async function cloneSurvey(body, actor) {
  if (!actor.isManager) throw new Error('Manager access is required to clone surveys.');
  const source = await getSurvey(body.id, actor);
  const cloned = await createSurvey({
    customerId: source.customerId, customerName: source.customerName, siteName: source.siteName,
    siteAddress: source.siteAddress, contactName: source.contactName, contactPhone: source.contactPhone,
    scheduledAt: safeText(body.scheduledAt, 100), moduleKeys: source.moduleKeys.filter((key) => key !== 'common_site'), contractors: [],
  }, actor);
  const batch = adminDb.batch();
  for (const module of source.modules || []) {
    if (module.id === 'common_site') batch.set(adminDb.collection('site_surveys').doc(cloned.id).collection('module_responses').doc(module.id), { answers: module.answers || {}, clonedFromSurveyId: source.id, updatedAt: new Date() }, { merge: true });
  }
  await batch.commit();
  return getSurvey(cloned.id, actor);
}

async function updateHeader(body, actor) {
  const { ref, survey } = await loadSurvey(body.id, actor);
  if (!canEdit(survey, actor) || !actor.isManager) throw new Error('This survey header cannot be edited.');
  const contractors = Array.isArray(body.contractors) ? body.contractors.slice(0, 20) : null;
  const update = {
    customerId: safeText(body.customerId, 200), customerName: safeText(body.customerName, 300),
    workOrderId: safeText(body.workOrderId, 200), siteName: safeText(body.siteName, 300),
    siteAddress: safeText(body.siteAddress, 500), scheduledAt: safeText(body.scheduledAt, 100),
    contactName: safeText(body.contactName, 200), contactPhone: safeText(body.contactPhone, 100), updatedAt: new Date(),
  };
  if (contractors) {
    update.assignedContractorIds = contractors.map((item) => item.id).filter(Boolean);
    update.assignedContractorUids = contractors.map((item) => item.authUid).filter(Boolean);
    if (survey.status === 'draft' && contractors.length) update.status = 'assigned';
  }
  await ref.update(update);
  return getSurvey(body.id, actor);
}

async function saveModule(body, actor) {
  const { ref, survey } = await loadSurvey(body.id, actor);
  if (!canEdit(survey, actor)) throw new Error('This survey is not editable.');
  if (!survey.moduleKeys.includes(body.moduleKey)) throw new Error('Module is not enabled for this survey.');
  const answers = Object.fromEntries(Object.entries(body.answers || {}).slice(0, 100).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 5000) : value]));
  await ref.collection('module_responses').doc(body.moduleKey).set({ answers, updatedAt: new Date(), updatedBy: actor.uid }, { merge: true });
  await ref.update({ status: survey.status === 'assigned' ? 'in_progress' : survey.status, updatedAt: new Date() });
  return { ok: true };
}

async function upsertRecord(body, actor) {
  const { ref, survey } = await loadSurvey(body.id, actor);
  if (!canEdit(survey, actor)) throw new Error('This survey is not editable.');
  if (!survey.moduleKeys.includes(body.moduleKey)) throw new Error('Module is not enabled for this survey.');
  const moduleRef = ref.collection('module_responses').doc(body.moduleKey);
  const recordRef = body.recordId ? moduleRef.collection('records').doc(body.recordId) : moduleRef.collection('records').doc();
  const existing = await recordRef.get();
  await recordRef.set({ ...cleanRecord(body.moduleKey, body.record || {}), updatedAt: new Date(), updatedBy: actor.uid, ...(!existing.exists ? { createdAt: new Date() } : {}) }, { merge: true });
  await ref.update({ status: survey.status === 'assigned' ? 'in_progress' : survey.status, updatedAt: new Date() });
  return { id: recordRef.id };
}

async function deleteRecord(body, actor) {
  const { ref, survey } = await loadSurvey(body.id, actor);
  if (!canEdit(survey, actor)) throw new Error('This survey is not editable.');
  await ref.collection('module_responses').doc(body.moduleKey).collection('records').doc(body.recordId).delete();
  await ref.update({ updatedAt: new Date() });
  return { ok: true };
}

async function changeStatus(body, actor) {
  const { ref, survey } = await loadSurvey(body.id, actor);
  const target = body.status;
  if (!STATUSES.has(target)) throw new Error('Invalid survey status.');
  const allowed = target === 'submitted'
    ? canEdit(survey, actor)
    : actor.isReviewer && ['needs_revision', 'approved', 'shared_with_customer', 'converted_to_estimate', 'archived'].includes(target);
  if (!allowed) throw new Error('You cannot make this status change.');
  const update = { status: target, updatedAt: new Date() };
  if (target === 'submitted') update.submittedAt = new Date();
  if (target === 'approved') update.approvedAt = new Date();
  await ref.update(update);
  if (target === 'approved' || target === 'shared_with_customer') {
    const current = await getSurvey(body.id, actor);
    const customerRecord = (moduleId, record) => {
      if (moduleId === 'structured_cabling') return { id: record.id, label: record.label, targetDevice: record.targetDevice, cableType: record.cableType, dropCount: record.dropCount, origin: record.origin, destination: record.destination, conduitRequired: record.conduitRequired, poeRequired: record.poeRequired };
      if (moduleId === 'rf_signal') return { id: record.id, carrier: record.carrier, technology: record.technology, band: record.band, rsrp: record.rsrp, rsrq: record.rsrq, sinr: record.sinr, measurementPoint: record.measurementPoint, floor: record.floor, donorCandidate: record.donorCandidate, azimuth: record.azimuth };
      return Object.fromEntries(Object.entries(record).filter(([key]) => !['notes', 'partType', 'quantity', 'unit', 'updatedBy', 'createdAt', 'updatedAt'].includes(key)));
    };
    const publicModules = current.modules.map((module) => ({
      id: module.id,
      answers: Object.fromEntries(Object.entries(module.answers || {}).filter(([key]) => !key.toLowerCase().includes('internal'))),
      records: module.records.map((record) => customerRecord(module.id, record)),
    }));
    await adminDb.collection('survey_reports').doc(body.id).set({
      surveyId: body.id, surveyNumber: current.surveyNumber, customerName: current.customerName,
      siteName: current.siteName, siteAddress: current.siteAddress, modules: publicModules,
      status: target, generatedAt: new Date(),
    });
  }
  await writeAudit({ actor, action: `survey.${target}`, entityType: 'site_survey', entityId: body.id, summary: `${survey.surveyNumber} moved to ${target}` });
  return getSurvey(body.id, actor);
}

async function saveSignature(body, actor) {
  const { ref, survey } = await loadSurvey(body.id, actor);
  if (!canEdit(survey, actor)) throw new Error('This survey is not editable.');
  const kind = body.kind === 'customer' ? 'customer' : 'technician';
  const signedBy = safeText(body.signedBy, 200);
  if (!signedBy) throw new Error('Signer name is required.');
  await ref.set({ signatures: { [kind]: { signedBy, timestamp: new Date(), capturedBy: actor.uid } }, updatedAt: new Date() }, { merge: true });
  await writeAudit({ actor, action: `survey.signature.${kind}`, entityType: 'site_survey', entityId: body.id, summary: `${kind} sign-off captured for ${survey.surveyNumber}` });
  return getSurvey(body.id, actor);
}

async function createEstimate(body, actor) {
  if (!actor.canEstimate) throw new Error('Estimator access is required.');
  const { ref, survey } = await loadSurvey(body.id, actor);
  if (!['approved', 'shared_with_customer'].includes(survey.status)) throw new Error('Approve the survey before converting it to an estimate.');
  if (survey.quoteId) throw new Error('This survey already has an estimate.');
  const submitted = Array.isArray(body.lineItems) ? body.lineItems.slice(0, 250) : [];
  const lineItems = submitted.map((item) => ({
    description: safeText(item.description, 500),
    quantity: Math.max(0, Number(item.quantity || 0)),
    unitPrice: Math.max(0, Number(item.unitPrice || 0)),
    sku: safeText(item.sku, 100).toUpperCase(),
    catalogItemId: safeText(item.catalogItemId, 200) || null,
    sourceRecordIds: Array.isArray(item.sources) ? item.sources.map((value) => safeText(value, 200)).filter(Boolean).slice(0, 100) : [],
  })).filter((item) => item.description && item.quantity > 0);
  if (!lineItems.length) throw new Error('Add at least one estimate line item.');
  const total = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const quoteRef = adminDb.collection('quotes').doc();
  const quoteNumber = `QT-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
  const reportSnap = await adminDb.collection('survey_reports').doc(body.id).get();
  const now = new Date();
  const batch = adminDb.batch();
  batch.set(quoteRef, {
    quoteNumber, customerId: survey.customerId || null, customer: survey.customerName,
    site: survey.siteAddress || survey.siteName, title: safeText(body.title, 300) || `Installation at ${survey.siteName}`,
    status: 'Draft', lineItems, total, sourceSurveyId: body.id, sourceSurveyNumber: survey.surveyNumber,
    surveySnapshot: reportSnap.exists ? reportSnap.data() : { surveyNumber: survey.surveyNumber, siteName: survey.siteName },
    stipulations: Array.isArray(body.stipulations) ? body.stipulations.map((value) => safeText(value, 1000)).filter(Boolean).slice(0, 30) : [],
    createdAt: now, updatedAt: now,
  });
  batch.update(ref, { status: 'converted_to_estimate', quoteId: quoteRef.id, quoteNumber, convertedAt: now, updatedAt: now });
  await batch.commit();
  await writeAudit({ actor, action: 'survey.converted_to_estimate', entityType: 'site_survey', entityId: body.id, summary: `Converted ${survey.surveyNumber} to ${quoteNumber}`, details: { quoteId: quoteRef.id, total } });
  return { quoteId: quoteRef.id, quoteNumber, total };
}

async function uploadAttachment(body, actor) {
  const { ref, survey } = await loadSurvey(body.id, actor);
  if (!canEdit(survey, actor)) throw new Error('This survey is not editable.');
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(body.dataUrl || '');
  if (!match) throw new Error('Only JPEG, PNG, or WebP photos are supported.');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Photo is larger than 3 MB after compression.');
  const id = randomUUID();
  const extension = match[1].split('/')[1].replace('jpeg', 'jpg');
  const path = `site-surveys/${body.id}/${id}.${extension}`;
  await adminStorage.file(path).save(buffer, { resumable: false, contentType: match[1], metadata: { metadata: { surveyId: body.id, uploadedBy: actor.uid } } });
  await ref.collection('attachments').doc(id).set({ id, path, moduleKey: safeText(body.moduleKey, 100), recordId: safeText(body.recordId, 200), caption: safeText(body.caption, 500), contentType: match[1], size: buffer.length, createdAt: new Date(), createdBy: actor.uid });
  await ref.update({ updatedAt: new Date() });
  return { id, path };
}

async function attachmentUrl(id, attachmentId, actor) {
  const { ref } = await loadSurvey(id, actor);
  const snap = await ref.collection('attachments').doc(attachmentId).get();
  if (!snap.exists) throw new Error('Attachment not found.');
  const [url] = await adminStorage.file(snap.data().path).getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000 });
  return url;
}

export default async function handler(req, res) {
  try {
    const actor = await actorFor(req);
    if (req.method === 'GET') {
      const action = String(req.query.action || 'bootstrap');
      if (action === 'bootstrap') return send(res, 200, await bootstrap(actor));
      if (action === 'get') return send(res, 200, await getSurvey(String(req.query.id || ''), actor));
      if (action === 'estimatePlan') return send(res, 200, await estimatePlan(String(req.query.id || ''), actor));
      if (action === 'attachment') return res.redirect(302, await attachmentUrl(String(req.query.id || ''), String(req.query.attachmentId || ''), actor));
      return send(res, 400, { error: 'Unknown action.' });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
    const body = req.body || {};
    const handlers = { create: createSurvey, updateHeader, saveModule, upsertRecord, deleteRecord, changeStatus, uploadAttachment, createEstimate, saveModuleDefinition, saveTemplate, cloneSurvey, saveSignature };
    if (!handlers[body.action]) return send(res, 400, { error: 'Unknown action.' });
    return send(res, 200, await handlers[body.action](body, actor));
  } catch (error) {
    console.error('Survey API error:', error);
    const message = error instanceof Error ? error.message : 'Survey request failed.';
    return send(res, /required|access|cannot|not enabled|not editable/i.test(message) ? 403 : 400, { error: message });
  }
}
