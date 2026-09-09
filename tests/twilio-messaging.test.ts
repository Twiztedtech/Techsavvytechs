import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifySmsKeyword,
  keywordReply,
  twilioWebhookUrl,
  twimlResponse,
} from "../api/_lib/twilio-messaging.js";

test("classifies Twilio opt-in, opt-out, help, and ordinary replies", () => {
  assert.equal(classifySmsKeyword(" stop "), "opt_out");
  assert.equal(classifySmsKeyword("UNSTOP"), "opt_in");
  assert.equal(classifySmsKeyword("help"), "help");
  assert.equal(classifySmsKeyword("On my way"), "other");
});

test("uses the public webhook URL that Twilio signs before the Vercel rewrite", () => {
  assert.equal(
    twilioWebhookUrl("https://techsavvytechs.com/"),
    "https://techsavvytechs.com/api/webhooks/twilio",
  );
});

test("returns compliant HELP and START replies without replying to ordinary messages", () => {
  assert.match(keywordReply("help"), /support@techsavvytechs\.com/);
  assert.match(keywordReply("opt_in"), /Reply HELP.*STOP/);
  assert.equal(keywordReply("other"), "");
  assert.match(twimlResponse(keywordReply("help")), /<Response><Message>/);
  assert.equal(
    twimlResponse(""),
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
  );
});
