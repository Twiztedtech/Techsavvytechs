import { adminDb } from "./firebase-admin.js";
import { clean, escapeHtml, normalizeEmail, nowIso, optionalUser, rateLimited, sendEmail } from "./client-portal.js";

const allowed = (value, choices) => choices.includes(value) ? value : "";
const list = (value, choices) => Array.isArray(value) ? [...new Set(value.filter((item) => choices.includes(item)))].slice(0, choices.length) : [];

export async function submitClientFeedback(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (rateLimited(req, "client-feedback", 3, 60 * 60 * 1000)) return res.status(429).json({ error: "Thank you. Please wait before submitting another response." });
  if (clean(req.body?.website, 200)) return res.status(202).json({ success: true });

  try {
    const user = await optionalUser(req).catch(() => null);
    const stages = ["onboarding", "booking", "active_job", "completed_job", "general"];
    const scale = ["very_positive", "positive", "neutral", "negative", "very_negative", "not_used"];
    const emailIssues = ["none", "not_received", "invalid_expired", "other"];
    const timing = ["shorter", "right", "longer"];
    const amounts = ["too_many", "right", "too_few", "not_sure"];
    const features = ["job_request", "job_status", "appointments", "technician", "progress", "messages", "rescheduling", "closeout", "company_users", "other"];
    const channels = ["email", "sms", "portal", "urgent_call"];
    const required = ["stage", "accountEase", "instructionsClear", "navigationEase", "satisfaction", "improvement"];
    if (required.some((field) => !clean(req.body?.[field], 3000))) return res.status(422).json({ error: "Please complete the required questions." });
    const nps = Number(req.body?.nps);
    if (!Number.isInteger(nps) || nps < 0 || nps > 10) return res.status(422).json({ error: "Choose a recommendation score from 0 to 10." });

    const response = {
      stage: allowed(req.body.stage, stages),
      respondent: {
        name: clean(req.body?.name, 120),
        company: clean(req.body?.company, 160),
        email: normalizeEmail(req.body?.email || user?.email || ""),
        firebaseUid: user?.uid || "",
      },
      answers: {
        accountEase: allowed(req.body.accountEase, scale),
        emailIssue: allowed(req.body.emailIssue, emailIssues),
        emailIssueDetail: clean(req.body.emailIssueDetail, 1000),
        instructionsClear: allowed(req.body.instructionsClear, scale),
        expectationsClear: allowed(req.body.expectationsClear, scale),
        onboardingLength: allowed(req.body.onboardingLength, timing),
        navigationEase: allowed(req.body.navigationEase, scale),
        foundFeatures: allowed(req.body.foundFeatures, scale),
        missingInformation: clean(req.body.missingInformation, 1500),
        valuableFeatures: list(req.body.valuableFeatures, features),
        jobFormEase: allowed(req.body.jobFormEase, scale),
        notificationHelpfulness: allowed(req.body.notificationHelpfulness, scale),
        preferredChannels: list(req.body.preferredChannels, channels),
        notificationAmount: allowed(req.body.notificationAmount, amounts),
        satisfaction: allowed(req.body.satisfaction, scale),
        nps,
        frustration: clean(req.body.frustration, 2000),
        workedWell: clean(req.body.workedWell, 2000),
        improvement: clean(req.body.improvement, 2000),
        followUp: req.body.followUp === true,
        additionalComments: clean(req.body.additionalComments, 2000),
      },
      status: "new",
      source: "client_feedback_form",
      submittedAt: nowIso(),
    };
    if (!response.stage || !response.answers.accountEase || !response.answers.instructionsClear || !response.answers.navigationEase || !response.answers.satisfaction) return res.status(422).json({ error: "One or more selections were not recognized." });
    const saved = await adminDb.collection("client_feedback").add(response);
    const recipient = process.env.SUPPORT_EMAIL || "support@techsavvytechs.com";
    const identity = response.respondent.name || response.respondent.company || response.respondent.email || "Anonymous client";
    await sendEmail({
      to: recipient,
      replyTo: response.respondent.email || undefined,
      subject: `New client portal feedback — ${response.answers.nps}/10`,
      text: `${identity} submitted client portal feedback.\n\nStage: ${response.stage}\nSatisfaction: ${response.answers.satisfaction}\nRecommendation: ${response.answers.nps}/10\nMost important improvement: ${response.answers.improvement}\nFrustration: ${response.answers.frustration || "None provided"}\nWorked well: ${response.answers.workedWell || "Not provided"}\n\nResponse ID: ${saved.id}`,
      html: `<h1>New client portal feedback</h1><p><strong>From:</strong> ${escapeHtml(identity)}</p><p><strong>Stage:</strong> ${escapeHtml(response.stage.replaceAll("_", " "))}<br><strong>Satisfaction:</strong> ${escapeHtml(response.answers.satisfaction.replaceAll("_", " "))}<br><strong>Recommendation:</strong> ${response.answers.nps}/10</p><h2>Most important improvement</h2><p>${escapeHtml(response.answers.improvement)}</p><h2>Frustration</h2><p>${escapeHtml(response.answers.frustration || "None provided")}</p><h2>What worked well</h2><p>${escapeHtml(response.answers.workedWell || "Not provided")}</p><p><small>Response ID: ${escapeHtml(saved.id)}</small></p>`,
      type: "client_feedback_received",
    }).catch((error) => console.error("Client feedback notification failed:", error));
    return res.status(201).json({ success: true, responseId: saved.id });
  } catch (error) {
    console.error("Client feedback submission failed:", error);
    return res.status(500).json({ error: "Your feedback could not be saved. Please try again." });
  }
}

