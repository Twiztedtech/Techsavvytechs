// Pure helpers for the request triage agent: no database, no network. The model is never trusted
// to find the obvious problems; these checks run every time and their flags are merged with its own.

const SEVERITIES = new Set(['info', 'warning', 'problem']);
const INJECTION = /(ignore|disregard|forget)\s+(all\s+|any\s+|your\s+|the\s+|previous\s+|prior\s+)+(instructions|rules|prompt)|system prompt|you are now|act as (an?\s+)?(admin|assistant|system)|reveal (your|the) (prompt|instructions|key)/i;

const text = (value, max = 2000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const day = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '');

/** "10 AM", "10:30pm" -> minutes since midnight, for every clock time mentioned in free text. */
export function timesMentioned(source) {
  const found = [];
  const pattern = /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/gi;
  let match;
  while ((match = pattern.exec(String(source || '')))) {
    const hour = Number(match[1]) % 12 + (/^p/i.test(match[3]) ? 12 : 0);
    found.push(hour * 60 + Number(match[2] || 0));
  }
  return found;
}

const minutes = (clock) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(clock || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Facts that need no judgement: dates in the past, times that disagree, missing details, odd text. */
export function deterministicFlags(request, today) {
  const flags = [];
  const add = (severity, message) => flags.push({ severity, text: message });
  const windows = Array.isArray(request?.requestedWindows) ? request.requestedWindows : [];
  if (!windows.length) add('warning', 'No requested date or time window.');
  const dated = windows.map((w) => day(w?.date)).filter(Boolean);
  if (windows.length && dated.length && dated.every((d) => d < today)) add('problem', `Every requested date has already passed (${dated.join(', ')}).`);
  const first = windows[0];
  const start = minutes(first?.start);
  if (start !== null) {
    const mentioned = timesMentioned(`${request?.scopeSummary || ''} ${request?.accessInstructions || ''}`);
    if (mentioned.length && !mentioned.some((m) => Math.abs(m - start) < 30)) {
      const label = (m) => `${Math.floor(m / 60) % 12 || 12}${m % 60 ? `:${String(m % 60).padStart(2, '0')}` : ''} ${m >= 720 ? 'PM' : 'AM'}`;
      add('warning', `The form says ${label(start)} but the description mentions ${[...new Set(mentioned)].map(label).join(', ')}. Confirm the arrival time.`);
    }
  }
  if (!text(request?.address)) add('problem', 'No site address.');
  else if (!/\b\d{5}\b/.test(String(request.address))) add('info', 'The address has no ZIP code.');
  if (!text(request?.requesterEmail)) add('warning', 'No requester email, so a reply cannot be sent.');
  if (!text(request?.requesterPhone)) add('info', 'No requester phone number.');
  if (!text(request?.scopeSummary)) add('problem', 'No scope of work.');
  if (INJECTION.test(`${request?.scopeSummary || ''} ${request?.accessInstructions || ''} ${request?.companyName || ''}`)) {
    add('warning', 'The request text contains wording aimed at an AI assistant. It was treated as plain text and not followed.');
  }
  return flags;
}

/** Keeps only the shape we expect from the model; anything else is dropped or clipped. */
export function sanitizeTriage(raw) {
  const out = raw && typeof raw === 'object' ? raw : {};
  const number = (value, max) => { const n = Number(value); return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null; };
  const match = out.customerMatch && typeof out.customerMatch === 'object' ? out.customerMatch : {};
  const job = out.suggestedJob && typeof out.suggestedJob === 'object' ? out.suggestedJob : {};
  const reply = out.draftReply && typeof out.draftReply === 'object' ? out.draftReply : {};
  const ids = (list) => (Array.isArray(list) ? list.map((v) => text(v, 120)).filter(Boolean).slice(0, 10) : []);
  const confidence = ['high', 'medium', 'low', 'none'].includes(match.confidence) ? match.confidence : 'none';
  return {
    summary: text(out.summary, 600),
    recommendation: ['create_job', 'ask_customer', 'decline', 'needs_review'].includes(out.recommendation) ? out.recommendation : 'needs_review',
    customerMatch: { customerId: text(match.customerId, 120), name: text(match.name, 160), confidence, reason: text(match.reason, 300) },
    flags: (Array.isArray(out.flags) ? out.flags : []).slice(0, 12).map((f) => ({ severity: SEVERITIES.has(f?.severity) ? f.severity : 'info', text: text(f?.text, 300) })).filter((f) => f.text),
    suggestedJob: {
      name: text(job.name, 160),
      date: day(job.date),
      start: /^\d{1,2}:\d{2}$/.test(String(job.start || '')) ? String(job.start) : '',
      end: /^\d{1,2}:\d{2}$/.test(String(job.end || '')) ? String(job.end) : '',
      technicianIds: ids(job.technicianIds),
      payRate: number(job.payRate, 500),
      billRate: number(job.billRate, 1000),
      estimatedHours: number(job.estimatedHours, 200),
    },
    draftReply: { subject: text(reply.subject, 200), body: String(reply.body ?? '').slice(0, 4000).trim() },
  };
}

/** Merges the checks that always run with what the model found, without repeating the same warning. */
export function mergeFlags(fixed, fromModel) {
  const seen = new Set();
  return [...fixed, ...fromModel].filter((flag) => {
    const key = flag.text.toLowerCase().slice(0, 20).trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The request as plain data for the prompt, with long free text clipped. Nothing here is an instruction. */
export function requestForPrompt(request) {
  return {
    requestNumber: text(request.requestNumber, 40),
    companyName: text(request.companyName, 160),
    requesterName: text(request.requesterName, 120),
    requesterEmail: text(request.requesterEmail, 160),
    requesterPhone: text(request.requesterPhone, 40),
    siteName: text(request.siteName, 160),
    address: text(request.address, 240),
    serviceType: text(request.serviceType, 60),
    urgent: request.urgent === true,
    requestedWindows: (Array.isArray(request.requestedWindows) ? request.requestedWindows : []).slice(0, 5),
    scopeSummary: String(request.scopeSummary || '').slice(0, 4000),
    accessInstructions: String(request.accessInstructions || '').slice(0, 1000),
    siteContact: text(request.siteContact, 200),
  };
}
