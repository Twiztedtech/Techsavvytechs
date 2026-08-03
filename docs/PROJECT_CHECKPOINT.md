# Contractor Portal Checkpoint

Last updated: 2026-08-03

## Completed

- Firebase email/password authentication is the portal login mechanism.
- `will.jackson@techsavvytechs.com` is bootstrapped as the initial administrator through a Firebase custom claim.
- The old simulated six-digit login screen was removed.
- QuickBooks credentials are handled by server-side Firebase Admin code. The dashboard retrieves only connection status and never receives OAuth tokens.
- QuickBooks vendor sync now requires an authenticated administrator token.
- Contact submissions go through `/api/contact`; the browser no longer writes directly to `contacts` or `mail`.
- Firestore rules were prepared, validated, and published manually in the Firebase Console for database `ai-studio-83a5034b-71ea-4903-9fe1-2934593887b1`.
- The security work is published to both GitHub and the local Forgejo remote:
  - `1463854` — Secure Firebase and QuickBooks operations
  - `f5da7a1` — Configure Firestore rules deployment
  - `5f8a5f1` — Keep QuickBooks tokens server-side
  - `4b1cf49` — Fix stylesheet import ordering

## Confirm on the next session

1. Confirm Vercel has `APP_URL` set to the production website URL. QuickBooks authorization uses it for its callback URL.
2. Sign out and back into the portal, then confirm the administrator dashboard and QuickBooks vendor sync work.
3. Submit a contact-form test and confirm delivery to `will.jackson@techsavvytechs.com` (or the configured `CONTACT_RECIPIENT_EMAIL`).
4. Publish the latest `firestore.rules` revision, which denies all browser access to `settings` and keeps QuickBooks OAuth tokens server-only.

## Next development milestone

Move portal data from browser-local storage to secure, user-owned Firestore records:

- contractor profiles mapped to Firebase user IDs;
- timesheets and job assignments tied to the logged-in contractor;
- server-authorized photo uploads;
- administrator approval and payroll/QuickBooks workflows.

The current rules deliberately keep operational collections administrator-only until those per-user data models are implemented.
