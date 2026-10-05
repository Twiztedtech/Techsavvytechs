// The installed Android/iOS app serves its pages from the phone itself (origin
// https://localhost on Android, capacitor://localhost on iOS), so its calls to
// this API are cross-origin. Only those two exact origins are allowed; every
// other origin gets no CORS headers at all. Requests carry a bearer token in
// the Authorization header (never cookies), so no credentials are exposed.
const APP_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);

// Returns true when the request was a preflight and has already been answered.
export function handleAppCors(req, res) {
  const origin = req.headers?.origin;
  if (!origin || !APP_ORIGINS.has(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
