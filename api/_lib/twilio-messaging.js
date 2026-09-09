const OPT_OUT_KEYWORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
]);
const OPT_IN_KEYWORDS = new Set(["START", "UNSTOP", "YES"]);

export function classifySmsKeyword(value) {
  const keyword = String(value || "").trim().toUpperCase();
  if (OPT_OUT_KEYWORDS.has(keyword)) return "opt_out";
  if (OPT_IN_KEYWORDS.has(keyword)) return "opt_in";
  if (keyword === "HELP" || keyword === "INFO") return "help";
  return "other";
}

export function twilioWebhookUrl(appUrl) {
  return `${String(appUrl || "").replace(/\/$/, "")}/api/webhooks/twilio`;
}

export function keywordReply(kind) {
  if (kind === "help") {
    return "TechSavvy LLC: For help with service notifications, email support@techsavvytechs.com. Reply STOP to opt out. Message and data rates may apply.";
  }
  if (kind === "opt_in") {
    return "TechSavvy LLC: You are subscribed to transactional service texts for scheduling and job updates. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out.";
  }
  return "";
}

export function twimlResponse(message) {
  if (!message) return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  const escaped = String(message).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[
        character
      ],
  );
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}
