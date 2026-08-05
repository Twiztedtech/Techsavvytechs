# Contractor Portal Checkpoint

Last updated: 2026-08-04

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
- Production QuickBooks is connected and vendor sync reads the production company. Sync removes only stale auto-created `qbo-*` vendor documents; manual contractor profiles are preserved.
- Administrators can assign one job to multiple technicians, attach work-order documents, and preview the assigned technician experience.
- Technicians can access assigned work orders, submitted documents, signed PDFs, per-day time entries, photos, and their agreed rate.
- Contractor invitations use Firebase password-reset links generated server-side and a branded Resend email from `support@techsavvytechs.com`; Firebase's generic email template is no longer used.
- Invitation records store the Resend message ID and latest provider event, so an administrator can distinguish accepted, delivered, bounced, and failed delivery instead of assuming a portal confirmation means inbox delivery.
- The TechSavvy sending domain is verified in Resend. `support@techsavvytechs.com` is a Google Workspace alias that routes to the support inbox without a separate mailbox license.
- Contact-form submissions are stored in Firestore and sent directly to the support inbox through Resend. The previous uninstalled Firebase email-extension dependency was removed.
- Public navigation, client/contractor portal paths, phone number, support email, page-level metadata, robots file, and sitemap are current.
- Contractor onboarding is implemented: technicians submit a PDF W-9 and terms acknowledgement through a protected endpoint; administrators review the submission in Contractor Sync. Storage rules are published and restrict each W-9 to its uploader and administrators; administrator review uses a five-minute signed link rather than a permanent download token.

## Confirm on the next session

1. Send one branded contractor invitation to a controlled test account, then confirm password setup, first login, assigned work-order access, and the time clock.
2. Submit a contact-form test and confirm it arrives at `support@techsavvytechs.com` from the TechSavvy Resend sender.
3. Keep Vercel `QBO_ENVIRONMENT=production`, `APP_URL=https://techsavvytechs.com`, and the Resend variables restricted to production.
4. Test onboarding with a controlled contractor account: upload a sample PDF W-9, confirm the administrator can review it, request an update, and approve the replacement.

## Next development milestone

Continue operational hardening:

- account activation and offboarding controls for inactive contractors;
- administrator audit trail for edits, approvals, and invitation delivery;
- final mobile field test with a real work order and customer signature;
- periodic review of QuickBooks vendor status versus portal access.
