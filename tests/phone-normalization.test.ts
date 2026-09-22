import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePhone } from "../api/_lib/phone.js";

test("normalizes common US mobile formats to E.164 for Twilio", () => {
  assert.equal(normalizePhone("(916) 555-0123"), "+19165550123");
  assert.equal(normalizePhone("916-555-0123"), "+19165550123");
  assert.equal(normalizePhone("1 916 555 0123"), "+19165550123");
});

test("preserves explicit international numbers and rejects malformed input", () => {
  assert.equal(normalizePhone("+44 20 7946 0958"), "+442079460958");
  assert.equal(normalizePhone("555-0123"), "");
  assert.equal(normalizePhone(""), "");
});
