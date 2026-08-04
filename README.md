# TechSavvy LLC Website & Contractor Portal

Production source for [techsavvytechs.com](https://techsavvytechs.com): the public TechSavvy services website and its Firebase-backed contractor portal.

## What this project includes

- Public service pages, contact form, local-service SEO, sitemap, and responsive navigation.
- Contractor portal for work-order assignments, documents, signed work orders, on-site time entries, photos, and technician previews.
- Administrator dashboard for job sites, contractor assignments, approvals, and QuickBooks Online vendor sync.
- Firebase Authentication, Firestore, and Storage security rules.
- Server-side QuickBooks OAuth and vendor synchronization; browser code never receives QuickBooks tokens.
- Branded contractor invitations and contact notifications delivered through Resend from `support@techsavvytechs.com`.

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
| `INITIAL_ADMIN_EMAIL` | Initial Firebase administrator email. |
| `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REALM_ID` | QuickBooks production credentials and company ID. |
| `QBO_ENVIRONMENT` | Must be `production` in Vercel. |
| `RESEND_API_KEY` | Server-side API key for contractor invitations and contact notifications. |
| `EMAIL_FROM` | Branded sender, for example `TechSavvy Contractor Portal <support@techsavvytechs.com>`. |
| `SUPPORT_EMAIL` | Inbox for replies and website-contact notifications. |

## Operational notes

- **Contractor invitations:** Admins choose **Send Branded Invite** in Contractor Sync. The server creates the Firebase account when needed, sends a secure password-setup link, and marks the invite sent only after Resend accepts it.
- **QuickBooks sync:** The sync writes the current production vendor list and removes only stale auto-created `qbo-*` documents that are no longer returned by QuickBooks. Manually created contractor records are never auto-deleted.
- **Contact form:** Submissions are saved in Firestore and emailed to `SUPPORT_EMAIL` through Resend. No Firebase email extension is required.
- **Rules:** Source-controlled Firestore and Storage rules are in [`firestore.rules`](firestore.rules) and [`storage.rules`](storage.rules). Deploy them with the Firebase CLI or publish them in Firebase Console after reviewing the diff.

## Deployment

Pushing `main` to GitHub triggers the Vercel production deployment. The same push is mirrored to the self-hosted Forgejo remote.

Before a live deployment, run lint and build. After changing any Vercel environment value, redeploy the production deployment so it receives the new configuration.
