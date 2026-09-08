import { randomUUID, timingSafeEqual } from "node:crypto";
import { adminStorage } from "./firebase-admin.js";
import { verificationHash } from "./client-portal.js";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
]);
const invalid = (message) =>
  Object.assign(new Error(message), { statusCode: 422 });

export async function prepareUpload(session, file, owner) {
  if (!/^[a-f0-9-]{30,40}$/i.test(session))
    throw invalid("The upload session is invalid.");
  if (
    !Number.isSafeInteger(file?.size) ||
    file.size < 1 ||
    file.size > MAX_UPLOAD_BYTES
  )
    throw invalid("Each document must be between 1 byte and 50 MB.");
  if (!allowedTypes.has(file.contentType))
    throw invalid("Choose a PDF, JPG, PNG, or text file.");
  const name = String(file.name || "document")
    .slice(0, 150)
    .replace(/[^a-zA-Z0-9._-]/g, "-");
  const storagePath = `client-request-documents/${session}/${randomUUID()}-${name}`;
  const expires = Date.now() + 30 * 60 * 1000;
  const [policy] = await adminStorage
    .file(storagePath)
    .generateSignedPostPolicyV4({
      expires,
      fields: {
        "Content-Type": file.contentType,
        success_action_status: "201",
      },
      conditions: [["content-length-range", file.size, file.size]],
    });
  const payload = Buffer.from(
    JSON.stringify({
      name,
      storagePath,
      contentType: file.contentType,
      size: file.size,
      owner,
      session,
      expires,
    }),
  ).toString("base64url");
  return {
    policy,
    receipt: `${payload}.${verificationHash("booking-upload", payload)}`,
  };
}

export async function verifyUpload(receipt, session, owner) {
  const [payload, signature] = String(receipt || "").split(".");
  const expected = verificationHash("booking-upload", payload || "");
  if (
    !signature ||
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    throw invalid(
      "An attachment permission is invalid. Please upload the file again.",
    );
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    throw invalid("Invalid attachment.");
  }
  if (
    data.owner !== owner ||
    data.session !== session ||
    data.expires < Date.now()
  )
    throw invalid(
      "An attachment permission expired. Please submit again to upload your files.",
    );
  const [metadata] = await adminStorage.file(data.storagePath).getMetadata();
  if (
    Number(metadata.size) !== data.size ||
    metadata.contentType !== data.contentType
  )
    throw invalid(`The uploaded file ${data.name} could not be verified.`);
  return {
    name: data.name,
    storagePath: data.storagePath,
    contentType: data.contentType,
    size: data.size,
  };
}
