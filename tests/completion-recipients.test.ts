import assert from "node:assert/strict";
import { test } from "node:test";
import {
  technicianNotifiable,
  customerNotifiable,
} from "../api/_lib/notification-eligibility.js";

test("technician SMS requires verified mobile, opt-in consent, and sms preference on", () => {
  const base = { mobileVerified: true, smsConsent: { optedIn: true } };
  assert.equal(technicianNotifiable(base).canSms, true);
  assert.equal(technicianNotifiable({ ...base, mobileVerified: false }).canSms, false);
  assert.equal(technicianNotifiable({ ...base, smsConsent: { optedIn: false } }).canSms, false);
  assert.equal(technicianNotifiable({ ...base, notificationPreferences: { sms: false } }).canSms, false);
});

test("technician email defaults to enabled unless explicitly turned off", () => {
  assert.equal(technicianNotifiable({}).canEmail, true);
  assert.equal(technicianNotifiable({ notificationPreferences: { email: false } }).canEmail, false);
  assert.equal(technicianNotifiable({ notificationPreferences: { email: true } }).canEmail, true);
});

test("customer SMS requires explicit opt-in; email is not gated by consent here", () => {
  assert.equal(customerNotifiable({ smsConsent: { optedIn: true } }).canSms, true);
  assert.equal(customerNotifiable({ smsConsent: { optedIn: false } }).canSms, false);
  assert.equal(customerNotifiable({}).canSms, false);
});

test("missing/undefined profile fields never throw", () => {
  assert.doesNotThrow(() => technicianNotifiable(undefined));
  assert.doesNotThrow(() => customerNotifiable(undefined));
  assert.equal(technicianNotifiable(undefined).canSms, false);
  assert.equal(customerNotifiable(undefined).canSms, false);
});
