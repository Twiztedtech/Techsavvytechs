# TechSavvy Platform Checkpoint

Last updated: 2026-08-30

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
- The administrator-only CRM is live at `/crm` with Firestore-backed customers, sites, quotes, jobs, technician scheduling, job costing, invoices, payments, and PDF invoice generation.
- CRM jobs and technician assignments use the same `jobs` and `contractors` collections as the contractor portal, preventing duplicate operational records.
- QuickBooks customer-invoice export uses the existing server-side OAuth connection. It creates or resolves the customer and Product/Service item, stores the QuickBooks ID and sync token, reports sync errors, and prevents duplicate exports on retry.
- Production deployment `c87cf5b` was verified READY on Vercel. The public `/crm` route returns HTTP 200 and the consolidated QuickBooks administration endpoint is deployed behind administrator authentication.
- Customer portal access is delivered by branded secure email links. Customers can view their own jobs, quotes, invoices, managed assets, recurring-maintenance dates, and submit service requests without a shared password.
- QuickBooks-synced invoices enable hosted card/ACH payment when QuickBooks Payments returns an invoice link. Payment details remain on Intuit's hosted page; TechSavvy stores only the link and accounting status. Re-syncing an existing invoice refreshes its link without creating a duplicate.
- Live operational reporting is available in CRM Reports. It derives job pipeline, unassigned work, average margin, quote conversion, technician workload, billed/collected totals, receivables aging, overdue invoices, and the 30-day recurring-maintenance forecast directly from Firestore. Administrators can download a timestamped CSV snapshot.
- The CRM Audit Trail stores immutable administrator, customer-document, customer-portal, billing, scheduling, asset-maintenance, email-delivery, and QuickBooks activity. Audit records can be created and read by administrators but cannot be edited or deleted from the client.
- QuickBooks disconnect was consolidated into the existing QuickBooks administration handler, reducing the deployment footprint to 11 API functions while preserving administrator authentication and audit logging.

## Vercel API-function allowance

**Important pre-deployment constraint:** this project currently uses **11 of 12 deployable Vercel API functions** allowed by the active project plan. Only one slot remains; continue consolidating related operations instead of treating that slot as normal expansion capacity.

Before adding any new API operation:

1. Count deployable handlers, excluding shared modules under `api/_lib/`:

   ```powershell
   ((rg --files api -g '*.js' | Where-Object { $_ -notmatch '\\_lib\\' }) | Measure-Object).Count
   ```

2. Keep the result at **12 or fewer**.
3. Prefer consolidating related operations into an existing authenticated handler using a query or body operation value. For example, customer-invoice synchronization is handled by `POST /api/admin/quickbooks/status?operation=sync-invoice` instead of a separate invoice function.
4. Preserve method validation, administrator authentication, and operation-specific input validation when consolidating handlers.
5. After pushing, confirm the deployment reaches **READY** with `vercel ls` or `vercel inspect`; a successful local or Vercel build alone does not prove the deployment was accepted.

If the application outgrows safe handler consolidation, upgrade the Vercel plan or move grouped operations behind a single router before adding more standalone functions.

## Confirm on the next session

1. Send one branded contractor invitation to a controlled test account, then confirm password setup, first login, assigned work-order access, and the time clock.
2. Submit a contact-form test and confirm it arrives at `support@techsavvytechs.com` from the TechSavvy Resend sender.
3. Keep Vercel `QBO_ENVIRONMENT=production`, `APP_URL=https://techsavvytechs.com`, and the Resend variables restricted to production.
4. Test onboarding with a controlled contractor account: upload a sample PDF W-9, confirm the administrator can review it, request an update, and approve the replacement.
5. Create a controlled CRM invoice and use **Sync QB** to verify the first production customer/invoice export, Product/Service mapping, stored QuickBooks ID, and duplicate protection. Do not use a real customer invoice for the first test.
6. Before every deployment that changes `api/`, confirm the Vercel API-function count remains at 12 or fewer and consolidate related handlers when necessary.
7. Send a portal invite to a controlled customer, confirm customer-only data visibility, submit a service request, and test the QuickBooks hosted payment link with a sandbox or zero-risk test invoice before using it with a real customer.

## Next development milestone

Continue operational hardening:

- account activation and offboarding controls for inactive contractors;
- administrator audit trail for edits, approvals, and invitation delivery;
- final mobile field test with a real work order and customer signature;
- periodic review of QuickBooks vendor status versus portal access.
