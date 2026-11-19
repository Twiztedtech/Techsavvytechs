import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReviewRequestEmail, hashRef, isBotSubmission, isValidRef, validateTestimonialInput } from '../api/_lib/testimonials.js';
import { slidingWindowLimiter } from '../api/_lib/sanity-write.js';

const good = { name: 'Dana Ruiz', email: 'Dana@Example.com', company: 'Ruiz Dental', role: 'Office manager', rating: 5, quote: 'Clean install, every cable labeled, and the Wi-Fi finally reaches the back rooms.', service: 'cabling', consent: true };

test('validateTestimonialInput: accepts a complete review and normalizes email', () => {
  const result = validateTestimonialInput(good);
  assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.value.email, 'dana@example.com'); assert.equal(result.value.rating, 5); }
});

test('validateTestimonialInput: company, role and service are optional; unknown service is dropped', () => {
  const result = validateTestimonialInput({ ...good, company: '', role: '', service: 'hacking' });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.service, '');
});

test('validateTestimonialInput: requires consent, a 1-5 integer rating and a real review', () => {
  assert.equal(validateTestimonialInput({ ...good, consent: false }).ok, false);
  assert.equal(validateTestimonialInput({ ...good, consent: 'true' }).ok, false);
  for (const rating of [0, 6, 4.5, '5', null]) assert.equal(validateTestimonialInput({ ...good, rating }).ok, false);
  assert.equal(validateTestimonialInput({ ...good, quote: 'Great job!' }).ok, false);
  assert.equal(validateTestimonialInput({ ...good, quote: 'x'.repeat(1201) }).ok, false);
  assert.equal(validateTestimonialInput({ ...good, quote: 'Great service, see https://spam.example for more info' }).ok, false);
  assert.equal(validateTestimonialInput({ ...good, email: 'nope' }).ok, false);
  assert.equal(validateTestimonialInput({ ...good, name: 'D' }).ok, false);
  assert.equal(validateTestimonialInput(null).ok, false);
});

test('validateTestimonialInput: ignores malformed review refs', () => {
  const ok = validateTestimonialInput({ ...good, ref: 'abcdefghijklmnopqrstuvwxyz012345' });
  const bad = validateTestimonialInput({ ...good, ref: '../../etc' });
  assert.equal(ok.ok && ok.value.ref, 'abcdefghijklmnopqrstuvwxyz012345');
  assert.equal(bad.ok && bad.value.ref, '');
});

test('isValidRef and hashRef', () => {
  assert.equal(isValidRef('short'), false);
  assert.equal(isValidRef('a'.repeat(32)), true);
  assert.equal(hashRef('x').length, 64);
  assert.notEqual(hashRef('x'), hashRef('y'));
});

test('isBotSubmission: hidden website field', () => {
  assert.equal(isBotSubmission(good), false);
  assert.equal(isBotSubmission({ ...good, website: 'spam' }), true);
});

test('slidingWindowLimiter: limits per key within the window', () => {
  const limited = slidingWindowLimiter(1000, 2);
  const store = new Map();
  assert.equal(limited('a', 0, store), false);
  assert.equal(limited('a', 1, store), false);
  assert.equal(limited('a', 2, store), true);
  assert.equal(limited('b', 2, store), false);
  assert.equal(limited('a', 1002, store), false);
});

test('buildReviewRequestEmail: greets by first name, escapes html, includes the link', () => {
  const email = buildReviewRequestEmail({ contactName: 'Evelyn <b>Park</b>', jobName: 'Fiber run & rack', link: 'https://techsavvytechs.com/reviews?ref=abc#write' });
  assert.match(email.text, /^Hi Evelyn,/);
  assert.match(email.html, /Fiber run &amp; rack/);
  assert.doesNotMatch(email.html, /<b>Park/);
  assert.match(email.html, /href="https:\/\/techsavvytechs.com\/reviews\?ref=abc#write"/);
  assert.match(buildReviewRequestEmail({ contactName: '', jobName: '', link: 'x' }).text, /^Hello,/);
});
