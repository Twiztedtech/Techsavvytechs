import { adminDb, requireStaffRole } from './firebase-admin.js';
import { rateLimited } from './client-portal.js';
import { cacheKey, drivingRoute, geocode, normalizeAddress, summarizeRoute, validateAddress } from './route-estimate.js';

// POST /api/portal/time-clock?portalOperation=routeEstimate
// body: { destination, origin? }  ->  { roundTripMiles, oneWayMiles, oneWayMinutes, from, to, cached }
// Staff with money access only (Admin, Assistant Admin, Office/Billing). Every answer is
// cached in the server-only `route_cache` collection, so each address is looked up once
// and the free public services are barely touched.

const DEFAULT_ORIGIN = 'Fairfield, CA 94533';
const NOMINATIM_PAUSE_MS = 1100; // Nominatim asks for at most one request per second

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cacheRef = (id) => adminDb.collection('route_cache').doc(id);

async function locate(address, { throttle }) {
  const ref = cacheRef(cacheKey('geo', address));
  const cached = await ref.get();
  if (cached.exists) return { ...cached.data(), cached: true };
  if (throttle) await sleep(NOMINATIM_PAUSE_MS);
  const found = await geocode(address, fetch, { pauseMs: NOMINATIM_PAUSE_MS });
  if (!found) return null;
  const record = { lat: found.lat, lon: found.lon, label: found.label, matched: found.matched, createdAt: new Date().toISOString() };
  await ref.set(record);
  return { ...record, cached: false };
}

export default async function routeEstimateHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  let user;
  try { user = await requireStaffRole(req, ['assistant_admin', 'office_billing']); }
  catch (error) { return res.status(/Authentication/.test(error.message) ? 401 : 403).json({ error: error.message }); }
  if (rateLimited(req, `route-estimate:${user.uid}`, 30, 10 * 60 * 1000)) return res.status(429).json({ error: 'Too many lookups. Please wait a few minutes.' });

  const destination = normalizeAddress(req.body?.destination);
  const problem = validateAddress(destination);
  if (problem) return res.status(422).json({ error: problem });
  let origin = normalizeAddress(req.body?.origin);
  if (!origin) {
    const settings = await adminDb.collection('costing_settings').doc('default').get().catch(() => null);
    origin = normalizeAddress(settings?.exists ? settings.data().homeBaseAddress : '') || DEFAULT_ORIGIN;
  }
  if (validateAddress(origin)) return res.status(422).json({ error: 'The home base address is not valid. Update it in Costing settings.' });

  try {
    const routeRef = cacheRef(cacheKey('route', origin, destination));
    const cachedRoute = await routeRef.get();
    if (cachedRoute.exists) return res.status(200).json({ ...cachedRoute.data(), cached: true });

    const from = await locate(origin, { throttle: false });
    if (!from) return res.status(422).json({ error: `We could not find the home base address "${origin}" on the map.` });
    const to = await locate(destination, { throttle: !from.cached });
    if (!to) return res.status(422).json({ error: 'We could not find that address on the map. Type the miles by hand.' });

    const route = await drivingRoute(from, to);
    if (!route) return res.status(422).json({ error: 'No driving route was found between those addresses. Type the miles by hand.' });
    const result = { ...summarizeRoute(route), from: from.label, to: to.label, origin, destination, createdAt: new Date().toISOString() };
    await routeRef.set(result);
    return res.status(200).json({ ...result, cached: false });
  } catch (error) {
    console.error('Route estimate failed:', error);
    return res.status(502).json({ error: 'The distance service is not responding right now. Type the miles by hand.' });
  }
}
