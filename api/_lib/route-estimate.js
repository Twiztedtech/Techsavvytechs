// Driving distance between two addresses, for mileage estimates. Uses two free,
// key-less public services: Nominatim (OpenStreetMap) to find the address on the
// map, and OSRM to drive between the two points. No Google account or billing is
// involved. Both are shared community services, so callers cache every answer and
// the handler spaces out lookups (Nominatim asks for at most one request a second).
// Everything here takes an injectable `fetchImpl` so it is unit tested without the network.
import { createHash } from 'node:crypto';

export const USER_AGENT = 'TechSavvy-CRM/1.0 (support@techsavvytechs.com)';
const METERS_PER_MILE = 1609.344;

export const normalizeAddress = (value) => String(value || '').replace(/\s+/g, ' ').trim();

/** Stable cache id for an address or an origin/destination pair. */
export function cacheKey(kind, ...parts) {
  const text = parts.map((part) => normalizeAddress(part).toLowerCase()).join('|');
  return `${kind}_${createHash('sha1').update(text).digest('hex').slice(0, 24)}`;
}

/** An error message when the address is not worth looking up, otherwise an empty string. */
export function validateAddress(value) {
  const address = normalizeAddress(value);
  if (!address) return 'An address is required.';
  if (address.length < 6) return 'That address is too short to look up.';
  if (address.length > 200) return 'That address is too long.';
  if (/^address on file$/i.test(address)) return 'This job has no street address yet.';
  return '';
}

// Suites, units and a leading business name make geocoders fail, so try the
// full address first, then progressively plainer versions of it.
export function addressVariants(value) {
  const full = normalizeAddress(value);
  const parts = full.split(',').map((part) => part.trim()).filter(Boolean);
  const isUnit = (part) => /^(suite|ste\.?|unit|apt\.?|apartment|floor|fl\.?|room|rm\.?|bldg\.?|building)\b|^#/i.test(part);
  const withoutUnits = parts.filter((part) => !isUnit(part));
  const variants = [full];
  if (withoutUnits.length !== parts.length) variants.push(withoutUnits.join(', '));
  // A leading segment with no digits is usually a business or site name ("MAI Capital").
  const streetStart = withoutUnits.findIndex((part) => /\d/.test(part));
  if (streetStart > 0) variants.push(withoutUnits.slice(streetStart).join(', '));
  // Street, city, state and zip only.
  if (withoutUnits.length > 3) variants.push(withoutUnits.slice(-3).join(', '));
  return [...new Set(variants.filter((variant) => variant.length >= 6))];
}

export function parseGeocode(json) {
  const hit = Array.isArray(json) ? json[0] : null;
  const lat = Number(hit?.lat);
  const lon = Number(hit?.lon);
  if (!hit || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, label: String(hit.display_name || '').slice(0, 200) };
}

export function parseRoute(json) {
  const route = json?.code === 'Ok' ? json.routes?.[0] : null;
  const meters = Number(route?.distance);
  const seconds = Number(route?.duration);
  if (!route || !Number.isFinite(meters) || !Number.isFinite(seconds) || meters <= 0) return null;
  return { meters, seconds };
}

const round1 = (value) => Math.round(value * 10) / 10;

/** Miles and minutes from a route result. Round trip is twice one way. */
export function summarizeRoute({ meters, seconds }) {
  const oneWayMiles = round1(meters / METERS_PER_MILE);
  return { oneWayMiles, roundTripMiles: round1((meters * 2) / METERS_PER_MILE), oneWayMinutes: Math.round(seconds / 60) };
}

async function fetchJson(url, fetchImpl, label) {
  const response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!response.ok) throw Object.assign(new Error(`${label} responded ${response.status}`), { upstream: true });
  return response.json();
}

/** Finds an address on the map, trying plainer versions if the full one is not found. Returns null when none match. */
export async function geocode(address, fetchImpl = fetch, { pauseMs = 0, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const variants = addressVariants(address);
  for (let index = 0; index < variants.length; index += 1) {
    if (index > 0 && pauseMs) await sleep(pauseMs);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(variants[index])}`;
    const found = parseGeocode(await fetchJson(url, fetchImpl, 'Address lookup'));
    if (found) return { ...found, matched: variants[index] };
  }
  return null;
}

export async function drivingRoute(from, to, fetchImpl = fetch) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  return parseRoute(await fetchJson(url, fetchImpl, 'Routing'));
}
