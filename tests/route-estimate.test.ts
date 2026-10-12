import assert from 'node:assert/strict';
import test from 'node:test';
import { addressVariants, cacheKey, drivingRoute, geocode, parseGeocode, parseRoute, summarizeRoute, validateAddress } from '../api/_lib/route-estimate.js';

test('validateAddress: blank, tiny, huge and the placeholder are rejected', () => {
  assert.equal(validateAddress('47700 Kato Rd, Fremont, CA 94538'), '');
  assert.match(validateAddress(''), /required/);
  assert.match(validateAddress('abc'), /too short/);
  assert.match(validateAddress('x'.repeat(250)), /too long/);
  assert.match(validateAddress('Address on file'), /no street address/);
});

test('cacheKey: stable for the same pair regardless of spacing or case, different otherwise', () => {
  assert.equal(cacheKey('route', 'A  St, Town', 'b st'), cacheKey('route', 'a st, town ', 'B ST'));
  assert.notEqual(cacheKey('route', 'a', 'b'), cacheKey('route', 'b', 'a'));
  assert.match(cacheKey('geo', 'x'), /^geo_[0-9a-f]{24}$/);
});

test('addressVariants: full address first, then without suite, without a business name, and street-city-state only', () => {
  assert.deepEqual(addressVariants('MAI Capital, 555 Main St, Suite 400, Chico, CA 95928'), [
    'MAI Capital, 555 Main St, Suite 400, Chico, CA 95928',
    'MAI Capital, 555 Main St, Chico, CA 95928',
    '555 Main St, Chico, CA 95928',
  ]);
  assert.deepEqual(addressVariants('47700 Kato Rd, Fremont, CA 94538'), ['47700 Kato Rd, Fremont, CA 94538']);
  assert.deepEqual(addressVariants('1287 Fulton Rd #5, Santa Rosa, CA 95401'), ['1287 Fulton Rd #5, Santa Rosa, CA 95401']);
});

test('parseGeocode and parseRoute: accept good answers and reject empty or malformed ones', () => {
  assert.deepEqual(parseGeocode([{ lat: '37.5', lon: '-121.9', display_name: 'Somewhere' }]), { lat: 37.5, lon: -121.9, label: 'Somewhere' });
  assert.equal(parseGeocode([]), null);
  assert.equal(parseGeocode([{ lat: 'x', lon: '1' }]), null);
  assert.deepEqual(parseRoute({ code: 'Ok', routes: [{ distance: 80467.2, duration: 3000 }] }), { meters: 80467.2, seconds: 3000 });
  assert.equal(parseRoute({ code: 'NoRoute', routes: [] }), null);
  assert.equal(parseRoute({ code: 'Ok', routes: [{ distance: 0, duration: 0 }] }), null);
});

test('summarizeRoute: converts meters to miles and doubles it for the round trip', () => {
  assert.deepEqual(summarizeRoute({ meters: 80467.2, seconds: 3000 }), { oneWayMiles: 50, roundTripMiles: 100, oneWayMinutes: 50 });
  assert.equal(summarizeRoute({ meters: 1609.344 * 3.04, seconds: 60 }).roundTripMiles, 6.1);
});

const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

test('geocode: falls back to a plainer address when the full one is not found', async () => {
  const seen: string[] = [];
  const fetchImpl = (async (url: string) => {
    seen.push(decodeURIComponent(url.split('q=')[1]));
    const found = seen.length >= 2;
    return { ok: true, status: 200, json: async () => (found ? [{ lat: '39.7', lon: '-121.8', display_name: 'Chico' }] : []) };
  }) as unknown as typeof fetch;
  const result = await geocode('MAI Capital, 555 Main St, Suite 400, Chico, CA 95928', fetchImpl);
  assert.equal(result?.label, 'Chico');
  assert.equal(seen.length, 2);
  assert.equal(result?.matched, 'MAI Capital, 555 Main St, Chico, CA 95928');
});

test('geocode: returns null when nothing matches, and surfaces an upstream failure', async () => {
  assert.equal(await geocode('Nowhere Rd, Atlantis, CA', ok([]) as unknown as typeof fetch), null);
  const down = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
  await assert.rejects(() => geocode('47700 Kato Rd, Fremont, CA', down), (error: { upstream?: boolean }) => error.upstream === true);
});

test('drivingRoute: asks OSRM for lon,lat pairs and parses the distance', async () => {
  let requested = '';
  const fetchImpl = (async (url: string) => { requested = url; return { ok: true, status: 200, json: async () => ({ code: 'Ok', routes: [{ distance: 48280.32, duration: 2400 }] }) }; }) as unknown as typeof fetch;
  const route = await drivingRoute({ lat: 38.25, lon: -122.04 }, { lat: 37.49, lon: -121.93 }, fetchImpl);
  assert.match(requested, /driving\/-122\.04,38\.25;-121\.93,37\.49\?overview=false/);
  assert.equal(summarizeRoute(route!).oneWayMiles, 30);
});
