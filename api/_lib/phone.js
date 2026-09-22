export function normalizePhone(value) {
  const raw = typeof value === "string" ? value.trim().slice(0, 40) : "";
  const digits = raw.replace(/\D/g, "");

  // The portal serves US customers by default, so familiar ten-digit input is
  // stored in the E.164 format required by Twilio.
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  // Preserve explicitly international E.164 numbers.
  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15)
    return `+${digits}`;

  return "";
}
