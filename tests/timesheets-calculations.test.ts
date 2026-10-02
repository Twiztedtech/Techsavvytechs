import assert from 'node:assert/strict';
import test from 'node:test';
import { getDirectionsUrl } from '../src/features/contractor/timesheets/calculations.ts';

test('getDirectionsUrl: without an origin, Google Maps is left to use the device location', () => {
  const url = getDirectionsUrl('123 Main St, Fairfield, CA');
  assert.equal(url, 'https://www.google.com/maps/dir/?api=1&destination=123+Main+St%2C+Fairfield%2C+CA&travelmode=driving');
});

test('getDirectionsUrl: with an origin, it is included as lat,lng', () => {
  const url = getDirectionsUrl('123 Main St, Fairfield, CA', { lat: 38.2494, lng: -122.0399 });
  assert.equal(url, 'https://www.google.com/maps/dir/?api=1&destination=123+Main+St%2C+Fairfield%2C+CA&travelmode=driving&origin=38.2494%2C-122.0399');
});

test('getDirectionsUrl: round-trips special characters in the address (suite numbers, #)', () => {
  const address = '555 Main St, Suite #400, Chico, CA 95928';
  const url = getDirectionsUrl(address);
  assert.equal(new URL(url).searchParams.get('destination'), address);
});

test('getDirectionsUrl: always requests driving directions, not a bare pin search', () => {
  const url = getDirectionsUrl('1 Test Way');
  assert.ok(url.startsWith('https://www.google.com/maps/dir/?'));
  assert.equal(new URL(url).searchParams.get('travelmode'), 'driving');
});
