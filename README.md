# TechSavvy LLC Website & Contractor Portal

Production source for [techsavvytechs.com](https://techsavvytechs.com): the public TechSavvy services website and its Firebase-backed contractor portal.

## Current production status

As of September 8, 2026:

- The public website, contractor portal, CRM, client booking form, client login, admin dispatch queue, and client-safe progress experience are live on Vercel at `techsavvytechs.com`.
- The client entry points are **Book a Job** for a first request and **Client Login** for returning users; **CRM Login** is available to administrators from the primary navigation.
- Client companies have a role-based personnel directory (`ClientCompanyEditor`, inside CRM's client-portal admin tab) with multi-recipient billing selection, wired to `POST /api/admin/client-portal?action=organization`.
- Twilio production SMS/MMS is connected through the verified toll-free number `+1 833-709-8324`; credentials are encrypted in Vercel and the signed inbound webhook is live at `/api/webhooks/twilio`.
- Client accounts use branded Resend email verification and can optionally enable Firebase Identity Platform TOTP multi-factor authentication for future sign-ins.
- The production deployment stays within the Vercel Hobby limit by consolidating portal operations into 11 server functions (see [`docs/PROJECT_CHECKPOINT.md`](docs/PROJECT_CHECKPOINT.md) for the current count and the 12-function ceiling).
- Hourly appointment, closeout, and calendar automation is live through the Cloudflare Worker in [`cloudflare/portal-scheduler`](cloudflare/portal-scheduler). Its `0 * * * *` trigger is managed in source control, uses an encrypted shared secret, and replaces the former Vercel daily cron.
- Resend Receiving and Google Calendar synchronization still require their production provider credentials and webhook/OAuth registration before those features are fully operational.
- A security review closed two account-takeover paths (administrator bootstrap and contractor invitations both required a verified email before granting a custom claim), a contractor pay-rate bypass, and two QuickBooks double-billing races; QuickBooks OAuth tokens are now encrypted at rest instead of stored in plaintext. See the security-hardening notes under [Operational notes](#operational-notes).
- `main` and `codex/client-booking-portal` are reconciled and both pushed to `origin` (GitHub and the self-hosted Forgejo remote). Deploy exclusively via `git push origin main` — an earlier gap where changes were deployed straight from the CLI without ever being committed has been closed; don't reopen it.

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

- **Security hardening (September 2026):** Granting the `admin` or `contractor` custom claim to an existing Firebase account (`/api/admin/bootstrap` and `/api/admin/contractors/invite`) now requires that account's email to be verified first. Public self-signup is open on the client portal, so without this check an attacker could register an unverified account using a target email address before its real owner does, then claim that role. Apply the same `email_verified` requirement to any future code path that grants a privileged claim to an *existing* account by email match. QuickBooks OAuth access/refresh tokens are stored AES-256-GCM encrypted (`encryptedAccessToken`/`encryptedRefreshToken` on `settings/quickbooks`, see `api/_lib/qbo-helper.js`); older connections with legacy plaintext fields are read as a fallback and upgraded automatically on their next token refresh.
- **Contractor invitations:** Admins choose **Send Branded Invite** in Contractor Sync. The server creates the Firebase account when needed, sends a secure password-setup link, stores Resend's delivery ID, and marks the invite sent only after Resend accepts it. Admins can check the current provider delivery event from the dashboard.
- **Contractor onboarding:** After first sign-in, a technician uploads a W-9 PDF and accepts the portal terms. The file is stored in a contractor-specific private Storage path. Contractor Sync shows the submission state; administrators can open, approve, or request an update. W-9s are never exposed through a public URL or regular Firestore reads.
- **Work-order signatures:** Administrators can require a customer signature before final completion. Technicians distinguish daily progress entries from the final entry; progress time never requires sign-off. Final entries display a signature reminder, enforce an administrator-required signed PDF on the server, or—when signatures are only recommended—require a documented technician exception that is retained on the job and emailed to the administrator.
- **QuickBooks sync:** Fully approving a contractor timecard places it in a persistent **Ready for QBO Sync** queue and sends the administrator a reminder; approval does not create a QuickBooks record automatically. An administrator must review the approved entry and select **Sync to QuickBooks**. Voided entries are read-only and cannot be synced. The vendor sync removes only stale auto-created `qbo-*` documents that are no longer returned by QuickBooks; manually created contractor records are never auto-deleted.
- **Contact form:** Submissions are saved in Firestore and emailed to `SUPPORT_EMAIL` through Resend. It includes a honeypot and per-instance request throttling to reduce automated abuse. If email delivery fails after the submission is saved, the visitor still receives a successful confirmation and the Firestore record is marked with its delivery status to prevent duplicate submissions. No Firebase email extension is required.
- **Client booking:** `/book-a-job` creates a server-owned request and alerts the configured internal team. `/client` provides verified, organization-scoped access. Client collections remain inaccessible through direct Firestore rules.
- **Scheduling automation:** [`cloudflare/portal-scheduler`](cloudflare/portal-scheduler) invokes `/api/cron/client-portal` at the top of every hour (UTC) with a shared `CRON_SECRET`. Cloudflare and Vercel store the value as encrypted secrets. The former Vercel Hobby daily cron has been removed to prevent duplicate runs.
- **Provider webhooks:** Register `/api/webhooks/twilio`, `/api/webhooks/resend`, and `/api/webhooks/google-calendar` with the respective providers. Configure Resend receiving on an isolated subdomain so existing company email MX records are unaffected.
- **Portal performance:** The public website already defers the contractor portal route. Within the portal, document-signing and technician-preview modules now load only when their workflow opens, keeping the initial dashboard download smaller.
- **Security headers:** Vercel applies `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict referrer policy, and a restrictive permissions policy. Review the policy whenever adding a new third-party service, font, media host, or browser connection.
- **Rules:** Source-controlled Firestore and Storage rules are in [`firestore.rules`](firestore.rules) and [`storage.rules`](storage.rules). Deploy them with the Firebase CLI or publish them in Firebase Console after reviewing the diff.

## Deployment

Pushing `main` to GitHub triggers the Vercel production deployment. The same push is mirrored to the self-hosted Forgejo remote (`git push origin main` pushes both, since `origin` has two push URLs configured). The production deployment was verified after the latest hardening and performance updates.

Deploy only by pushing `main` — never `vercel --prod` directly from a local working tree. A prior gap where production was deployed straight from the CLI let the live site diverge from every branch's git history (uncommitted fixes went live, and `main` itself fell behind); that gap was closed in September 2026 by committing and merging the drifted work back into `main`, but the discipline of git-push-only deploys is what keeps it closed.

Before a live deployment, run lint, build, and `npm audit --omit=dev --audit-level=high`. After changing any Vercel environment value, redeploy the production deployment so it receives the new configuration.

### Cloudflare migration preview

The repository includes a Wrangler configuration for deploying the Vite build as a Cloudflare Worker with Static Assets. This is the target Cloudflare product because it supports the SPA today and can host migrated API handlers later.

```sh
npm run build
npm run cf:check
npm run cf:dev
```

Do not attach `techsavvytechs.com` or replace the Vercel production deployment yet. The existing `api/` handlers use Vercel's request/response interface and continue to run on Vercel until they are adapted to the Workers runtime, their secrets are configured in Cloudflare, and the Firebase Admin, OAuth, webhook, upload, and scheduled-job paths have been tested. After authenticating Wrangler with `npx wrangler login`, `npm run cf:deploy` publishes only the current static frontend.
