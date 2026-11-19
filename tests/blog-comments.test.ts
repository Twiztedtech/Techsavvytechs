import assert from 'node:assert/strict';
import test from 'node:test';
import { commentRateLimited, isBotSubmission, validateCommentInput } from '../api/_lib/blog-comments.js';

const good = { postId: 'abc123', name: 'Jane Tech', email: 'Jane@Example.com', comment: 'Great write-up on Cat6A.' };

test('validateCommentInput: accepts a normal comment and normalizes email', () => {
  const result = validateCommentInput(good);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.email, 'jane@example.com');
});

test('validateCommentInput: rejects bad post ids, including drafts', () => {
  assert.equal(validateCommentInput({ ...good, postId: '' }).ok, false);
  assert.equal(validateCommentInput({ ...good, postId: 'drafts.abc123' }).ok, false);
  assert.equal(validateCommentInput({ ...good, postId: '*[_type=="x"]' }).ok, false);
});

test('validateCommentInput: enforces name, email and length limits', () => {
  assert.equal(validateCommentInput({ ...good, name: 'J' }).ok, false);
  assert.equal(validateCommentInput({ ...good, name: 'x'.repeat(81) }).ok, false);
  assert.equal(validateCommentInput({ ...good, email: 'not-an-email' }).ok, false);
  assert.equal(validateCommentInput({ ...good, comment: 'hi' }).ok, false);
  assert.equal(validateCommentInput({ ...good, comment: 'x'.repeat(1501) }).ok, false);
  assert.equal(validateCommentInput(null).ok, false);
});

test('validateCommentInput: limits links and strips control characters but keeps line breaks', () => {
  assert.equal(validateCommentInput({ ...good, comment: 'see http://a.com http://b.com http://c.com' }).ok, false);
  const result = validateCommentInput({ ...good, comment: 'Line one\u0007\r\nLine two\n\n\n\nLine three' });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.comment, 'Line one\nLine two\n\nLine three');
});

test('isBotSubmission: only when the hidden website field is filled', () => {
  assert.equal(isBotSubmission(good), false);
  assert.equal(isBotSubmission({ ...good, website: 'http://spam' }), true);
});

test('commentRateLimited: three per IP per 15 minutes', () => {
  const store = new Map();
  const now = 1_000_000;
  assert.equal(commentRateLimited('1.1.1.1', now, store), false);
  assert.equal(commentRateLimited('1.1.1.1', now + 1, store), false);
  assert.equal(commentRateLimited('1.1.1.1', now + 2, store), false);
  assert.equal(commentRateLimited('1.1.1.1', now + 3, store), true);
  assert.equal(commentRateLimited('2.2.2.2', now + 3, store), false);
  assert.equal(commentRateLimited('1.1.1.1', now + 15 * 60 * 1000 + 1, store), false);
});
