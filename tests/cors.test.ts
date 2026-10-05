import assert from 'node:assert/strict';
import test from 'node:test';
import { handleAppCors } from '../api/_lib/cors.js';

const fakeRes = () => {
  const res: any = { headers: {} as Record<string, string>, ended: false, statusCode: 0 };
  res.setHeader = (key: string, value: string) => { res.headers[key] = value; };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.end = () => { res.ended = true; };
  return res;
};

test('app origins: preflight is answered with 204 and the right CORS headers', () => {
  for (const origin of ['https://localhost', 'capacitor://localhost']) {
    const res = fakeRes();
    assert.equal(handleAppCors({ method: 'OPTIONS', headers: { origin } }, res), true);
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['Access-Control-Allow-Origin'], origin);
    assert.match(res.headers['Access-Control-Allow-Headers'], /Authorization/);
  }
});

test('app origins: a normal request gets CORS headers but is left for the handler to answer', () => {
  const res = fakeRes();
  assert.equal(handleAppCors({ method: 'POST', headers: { origin: 'https://localhost' } }, res), false);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://localhost');
  assert.equal(res.ended, false);
});

test('any other origin, or none, gets no CORS headers at all', () => {
  for (const headers of [{ origin: 'https://evil.example' }, { origin: 'http://localhost' }, {}]) {
    const res = fakeRes();
    assert.equal(handleAppCors({ method: 'OPTIONS', headers }, res), false);
    assert.deepEqual(res.headers, {});
  }
});
