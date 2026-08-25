# TechSavvy LLC Website & Contractor Portal

Production source for [techsavvytechs.com](https://techsavvytechs.com): the public TechSavvy services website and its Firebase-backed contractor portal.

## What this project includes

- Public service pages, protected contact form, local-service SEO, sitemap, and responsive navigation.
- Contractor portal for work-order assignments, documents, signed work orders, on-site time entries, photos, and technician previews.
- Administrator dashboard for job sites, contractor assignments, approvals, and QuickBooks Online vendor sync.
- Firebase Authentication, Firestore, and Storage security rules.
- Server-side QuickBooks OAuth and vendor synchronization; browser code never receives QuickBooks tokens.
- Branded contractor invitations and contact notifications delivered through Resend from `support@techsavvytechs.com`.
- Client booking and dispatch portal with organization access, multi-visit scheduling, client-safe technician profiles, progress timelines, rescheduling, and closeout acceptance.
- Security headers on every Vercel response, including a content security policy, clickjacking protection, and referrer controls.

## Local development

Prerequisites: Node.js 20+ and the environment values shown in [`.env.example`](.env.example).

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run lint
npm run build
```

## Production configuration

Configure these as **Production** environment variables in Vercel. Keep secrets out of Git.

| Variable | Purpose |
| --- | --- |
| `APP_URL` | `https://techsavvytechs.com`; used for OAuth and setup links. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin service account JSON. |
| `FIRESTORE_DATABASE_ID` | Firestore database ID. |
| `FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket used to validate contractor W-9 uploads. |
| `INITIAL_ADMIN_EMAIL` | Initial Firebase administrator email. |
| `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REALM_ID` | QuickBooks production credentials and company ID. |
| `QBO_ENVIRONMENT` | Must be `production` in Vercel. |
| `RESEND_API_KEY` | Server-side API key for contractor invitations and contact notifications. |
| `EMAIL_FROM` | Branded sender, for example `TechSavvy Contractor Portal <support@techsavvytechs.com>`. |
| `SUPPORT_EMAIL` | Inbox for replies and website-contact notifications. |
| `CLIENT_PORTAL_SECRET`, `CRON_SECRET` | Signing/encryption and scheduled automation secrets. |
| `CLIENT_REQUEST_ALERT_EMAILS`, `CLIENT_REQUEST_ALERT_PHONES` | Configurable internal booking alert recipients. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` | Transactional SMS, verification, opt-out, and delivery tracking. |
| `RESEND_RECEIVING_DOMAIN`, `RESEND_WEBHOOK_SECRET` | Job-specific inbound email replies and verified webhooks. |
| `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_ID`, `GOOGLE_CALENDAR_WEBHOOK_TOKEN` | Portal-to-Google Calendar synchronization. |

## Operational notes

- **Contractor invitations:** Admins choose **Send Branded Invite** in Contractor Sync. The server creates the Firebase account when needed, sends a secure password-setup link, stores Resend's delivery ID, and marks the invite sent only after Resend accepts it. Admins can check the current provider delivery event from the dashboard.
- **Contractor onboarding:** After first sign-in, a technician uploads a W-9 PDF and accepts the portal terms. The file is stored in a contractor-specific private Storage path. Contractor Sync shows the submission state; administrators can open, approve, or request an update. W-9s are never exposed through a public URL or regular Firestore reads.
- **Work-order signatures:** Administrators can require a customer signature before final completion. Technicians distinguish daily progress entries from the final entry; progress time never requires sign-off. Final entries display a signature reminder, enforce an administrator-required signed PDF on the server, or—when signatures are only recommended—require a documented technician exception that is retained on the job and emailed to the administrator.
- **QuickBooks sync:** Fully approving a contractor timecard places it in a persistent **Ready for QBO Sync** queue and sends the administrator a reminder; approval does not create a QuickBooks record automatically. An administrator must review the approved entry and select **Sync to QuickBooks**. Voided entries are read-only and cannot be synced. The vendor sync removes only stale auto-created `qbo-*` documents that are no longer returned by QuickBooks; manually created contractor records are never auto-deleted.
- **Contact form:** Submissions are saved in Firestore and emailed to `SUPPORT_EMAIL` through Resend. It includes a honeypot and per-instance request throttling to reduce automated abuse. If email delivery fails after the submission is saved, the visitor still receives a successful confirmation and the Firestore record is marked with its delivery status to prevent duplicate submissions. No Firebase email extension is required.
- **Client booking:** `/book-a-job` creates a server-owned request and alerts the configured internal team. `/client` provides verified, organization-scoped access. Client collections remain inaccessible through direct Firestore rules.
- **Scheduling automation:** The Hobby deployment invokes `/api/cron/client-portal` once daily. Upgrade to an hourly scheduler before launch to deliver precise 24-hour/2-hour reminders. Configure `CRON_SECRET` for either schedule.
- **Provider webhooks:** Register `/api/webhooks/twilio`, `/api/webhooks/resend`, and `/api/webhooks/google-calendar` with the respective providers. Configure Resend receiving on an isolated subdomain so existing company email MX records are unaffected.
- **Portal performance:** The public website already defers the contractor portal route. Within the portal, document-signing and technician-preview modules now load only when their workflow opens, keeping the initial dashboard download smaller.
- **Security headers:** Vercel applies `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict referrer policy, and a restrictive permissions policy. Review the policy whenever adding a new third-party service, font, media host, or browser connection.
- **Rules:** Source-controlled Firestore and Storage rules are in [`firestore.rules`](firestore.rules) and [`storage.rules`](storage.rules). Deploy them with the Firebase CLI or publish them in Firebase Console after reviewing the diff.

## Deployment

Pushing `main` to GitHub triggers the Vercel production deployment. The same push is mirrored to the self-hosted Forgejo remote. The production deployment was verified after the latest hardening and performance updates.

Before a live deployment, run lint, build, and `npm audit --omit=dev --audit-level=high`. After changing any Vercel environment value, redeploy the production deployment so it receives the new configuration.
