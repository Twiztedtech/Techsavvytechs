# TechSavvy Platform Checkpoint

Last updated: 2026-09-08

## Completed (2026-09-08 session)

- **Security review and fixes**, live in production:
  - `/api/admin/bootstrap` and `/api/admin/contractors/invite` now require `email_verified === true` before granting the `admin`/`contractor` custom claim to an existing Firebase account. Without this, an attacker could self-register (client-portal signup is public) using a target email — the initial admin's or a soon-to-be-invited contractor's — before its real owner signed up, then have that role silently granted to their own account. Apply the same check to any future code path that grants a privileged claim by email match.
  - `submit_manual_log` in `api/portal/time-clock.js` now uses the assigned job's administrator-set `hourlyRate` for labor pay whenever a real job is matched; a contractor's self-reported rate is only used for true ad-hoc entries with no job link.
  - QuickBooks bill/invoice sync (`retry_qbo_sync` in `time-clock.js`, `sync-invoice` in `api/admin/quickbooks/status.js`) and shift clock-in (`start` in `time-clock.js`) now use a Firestore transaction to close the check-then-act window that let a double-click or concurrent retry create duplicate QuickBooks records or duplicate active shifts.
  - `api/portal/jobs/complete-work-order.js` validates that a submitted "signed work order" URL resolves to a real PDF object under that job's own `signed-work-orders/{jobId}/` path in Storage, instead of trusting an arbitrary client-supplied string that gets shown to clients as a trusted download link.
  - `api/contact.js`'s `run-reminders` operation now checks `CRON_SECRET` before running any health-check side effects (Firestore write, ops alert email), not after — it was previously callable, unauthenticated, to trigger those side effects.
  - QuickBooks OAuth access/refresh tokens are now AES-256-GCM encrypted at rest (`api/_lib/qbo-helper.js`: `encryptedQboTokenFields`/`encryptedQboTokenUpdateFields`/`readQboTokens`), matching the existing Google Calendar refresh-token pattern, across the connect (`api/auth/quickbooks/callback.js`), refresh, and vendor-sync (`api/sync-vendors.js`) code paths. Legacy plaintext fields are read as a fallback and cleared on the next refresh.
  - Removed debug `console.log` calls that dumped full timecard/vendor payloads (name, email, rates, costs) to production logs.
  - Reviewed and deliberately left as-is: `api/auth/quickbooks/callback.js` has no `requireAdmin` call, unlike other admin-sensitive handlers, but it's a browser redirect from Intuit with no way to attach an auth header — the existing signed, HttpOnly, short-lived `qbo_oauth_state` cookie already provides real CSRF protection tied to the admin session that started the flow.
- **`ClientCompanyEditor` wired into the admin dashboard.** It shipped as a real, tested component (personnel directory, multi-recipient billing selection, edit-existing-company support) but nothing rendered it and the backend silently dropped the `personnel`/`billingRecipientEmails` fields it sent. `ClientRequestsAdmin.tsx` now renders it in place of the old create-only company form; `api/_lib/admin-client-portal-handler.js`'s `saveOrganization` now sanitizes and persists both fields (role allowlist, cleaned emails, billing recipients restricted to emails actually in the personnel list). Verified in an isolated browser harness against mock data (render, edit-populate, add/remove personnel, validation, save payload shape) — **not yet verified end-to-end against real Firestore data by an authenticated admin.**
- **Git/deployment drift resolved.** Production had been deployed for some time directly via `vercel --prod` from a local working tree rather than via `git push`, so the live site had diverged from every branch (uncommitted fixes were live; `main` itself was behind). Reconciled by: committing the accumulated working-tree state, merging the 49-commit-ahead `codex/client-booking-portal` remote branch into it, merging that into `main` (which had 1 unique commit of its own — the Sanity blog feature), and pushing both branches to `origin` (mirrors to GitHub and the internal Forgejo server). `main` and `codex/client-booking-portal` are now the source of truth again. Deploy only via `git push origin main` going forward — see the README's Deployment section.
- Repository cleanup: deleted 6 fully-merged-or-superseded branches (local and remote) and 2 fully-merged worktrees (`codex/integrate-client-portal`, `codex/merge-crm-current-prod`) after confirming no unique unmerged content in either; removed two one-off local debug scripts (`retry_sync.cjs`, `scratch_query.cjs`) and gitignored `.codex-work/` and `outputs/` (unrelated scratch content that had been accumulating in the repo root, including a file set from an unrelated non-TechSavvy task).
- Fixed a deprecated `@sanity/image-url` default-export import (`src/sanity/image.ts`) that was spamming a console warning on every Sanity-backed page load.

## Completed (through 2026-08-31)

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
- Client companies now retain a role-based personnel directory. Administrators can select multiple default billing recipients, choose the salesperson/requester/payroll contacts for each work order, and carry those recipients into conversion, scheduling, client-visible progress, and reminder emails.
- QuickBooks-synced invoices enable hosted card/ACH payment when QuickBooks Payments returns an invoice link. Payment details remain on Intuit's hosted page; TechSavvy stores only the link and accounting status. Re-syncing an existing invoice refreshes its link without creating a duplicate.
- Live operational reporting is available in CRM Reports. It derives job pipeline, unassigned work, average margin, quote conversion, technician workload, billed/collected totals, receivables aging, overdue invoices, and the 30-day recurring-maintenance forecast directly from Firestore. Administrators can download a timestamped CSV snapshot.
- The CRM Audit Trail stores immutable administrator, customer-document, customer-portal, billing, scheduling, asset-maintenance, email-delivery, and QuickBooks activity. Audit records can be created and read by administrators but cannot be edited or deleted from the client.
- QuickBooks disconnect was consolidated into the existing QuickBooks administration handler, reducing the deployment footprint to 11 API functions while preserving administrator authentication and audit logging.
- Customer portal access management now shows active, expired, revoked, and not-invited status on customer cards. Administrators can choose 30–180 day access, renew by resending, revoke immediately, and open a separate 15-minute read-only preview that cannot submit service requests or expose live payment links.
- Automated reminders run daily through the existing contact handler and cover next-day appointments, quotes awaiting a decision, overdue invoices, and maintenance due within 14 days. Deterministic delivery records and Resend idempotency keys prevent scheduled duplicates; administrators can send manually, review delivery results, and set per-customer reminder preferences from CRM Reminders. Every successful reminder is recorded in the Audit Trail.
- QuickBooks payment reconciliation treats QuickBooks as the balance source for invoices already synced there. A manual **Reconcile QuickBooks** action and the protected daily cycle refresh invoice total, balance, amount paid, status, sync token, hosted payment link, and reconciliation timestamps without creating CRM payment entries. Every changed balance and reconciliation summary is recorded in the Audit Trail.
- Technician lifecycle management is implemented in Contractor Sync. New technicians begin Pending; invitation activates access; administrators can activate, suspend, reactivate, or offboard a technician with a required reason. Suspension and offboarding disable Firebase sign-in, revoke existing sessions, require open work orders to be reassigned or explicitly returned to dispatch, remove inactive technicians from new scheduling choices, send a branded notice, and add an audit record. Completed work, timecards, billing history, and QuickBooks vendor links are preserved.
- Approved contractor timecards now require an explicit administrator **Sync to QuickBooks** action. The dashboard keeps a persistent ready-to-sync reminder and approval sends a reminder to the administrator. Voided submissions remain visible for history but are read-only, show a voided amount instead of a payable amount, and cannot be approved, edited, bonused, or synced.
- Work-order completion separates ordinary progress time from the final entry. Administrators can require a signed customer PDF; required signatures are enforced by the protected time-clock API. Recommended-signature jobs may be completed only through a documented technician exception, which is stored on the job, shown to administrators, and emailed to support. Signature-policy changes retain the administrator UID and timestamp history.
- Technician portal APIs enforce the lifecycle status server-side, so a suspended or offboarded account cannot continue working through a stale browser session.
- Production monitoring now combines Vercel project-scoped 5xx and usage anomaly alerts, Web Analytics, Speed Insights, structured health logs, a public dependency health probe, daily emailed dependency alerts with suppression, and a GitHub synthetic check every 15 minutes. The health operations remain consolidated in `/api/contact`, preserving the 11-function deployment footprint.
- The live contractor workflow was verified at a 390×844 mobile viewport. Job selection, directions, work-order/SOW viewing, documents, time entry fields, photo capture input, signing entry point, and history all render without horizontal overflow. Mobile portal actions now enforce a 44px minimum touch target.

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

## Dependency maintenance deadline

Complete the Firebase dependency and lockfile cleanup **by September 30, 2026**. Do it sooner if any work changes Firebase Authentication, Firestore, Storage, Firebase Admin initialization, or the Vercel Node.js runtime.

The maintenance phase must:

1. Upgrade `firebase-admin` from `12.7.0` to a supported current release in a dedicated branch. `npm audit` currently reports a high-severity transitive `uuid` bounds-check advisory (GHSA-w5hq-g745-h8pq) reachable only through `firebase-admin`'s Google Cloud dependencies (`@google-cloud/firestore`, `@google-cloud/storage`, `google-gax`); `npm audit fix --force` resolves it by jumping to `firebase-admin@14`, confirming this upgrade is the fix.
2. Confirm whether the Node `DEP0169` `url.parse()` warning disappears; if it remains, trace it to the exact transitive package or Vercel runtime layer.
3. Re-test administrator login, contractor invitations, activation/suspension, session revocation, W-9 storage, Firestore reads/writes, customer links, scheduled reminders, and QuickBooks operations.
4. Run TypeScript, production build, mobile workflow, health endpoint, and post-deployment runtime-log checks before promotion.
5. Remove the obsolete uncommitted `package-lock.json` only after confirming `pnpm-lock.yaml` remains the single deployment lockfile.

## Known issues (not fixed yet, low priority)

- **Footer service links are broken on every page except Home.** `src/components/layout/Footer.tsx`'s "Low-Voltage / Infrastructure / MSP Solutions / Consulting" links point to `#services`, an anchor that only exists in `src/components/sections/Services.tsx`, which is rendered only on the Home page. Clicking them from About, Contact, Blog, or anywhere else does nothing visible.
- **Unknown routes return HTTP 200 instead of a real 404.** `src/App.tsx`'s catch-all route (`path="*"`) renders `<Home />` rather than a distinct not-found page/status, which is a minor SEO soft-404 concern common to SPAs.
- See the `uuid`/`firebase-admin` advisory under [Dependency maintenance deadline](#dependency-maintenance-deadline) above.

## Confirm on the next session

1. **`ClientCompanyEditor` (new this session):** log in as a real administrator and exercise it against production Firestore — create a company with personnel, edit an existing one, toggle billing recipients, and confirm the record round-trips through `POST /api/admin/client-portal?action=organization` correctly. Only verified so far against mock data in an isolated, unauthenticated browser harness.
2. **QuickBooks token encryption (new this session):** after the next natural access-token refresh (or a manual reconnect), confirm `settings/quickbooks` has `encryptedAccessToken`/`encryptedRefreshToken` and the legacy plaintext `accessToken`/`refreshToken` fields are gone.
3. Send one branded contractor invitation to a controlled test account, then confirm password setup, first login, assigned work-order access, and the time clock. Suspend that test account while signed in, confirm the session loses API access, reactivate it, and verify sign-in returns.
4. Submit a contact-form test and confirm it arrives at `support@techsavvytechs.com` from the TechSavvy Resend sender.
5. Keep Vercel `QBO_ENVIRONMENT=production`, `APP_URL=https://techsavvytechs.com`, and the Resend variables restricted to production.
6. Test onboarding with a controlled contractor account: upload a sample PDF W-9, confirm the administrator can review it, request an update, and approve the replacement.
7. Create a controlled CRM invoice and use **Sync QB** to verify the first production customer/invoice export, Product/Service mapping, stored QuickBooks ID, and duplicate protection. Do not use a real customer invoice for the first test.
8. Before every deployment that changes `api/`, confirm the Vercel API-function count remains at 12 or fewer and consolidate related handlers when necessary.
9. Send a portal invite to a controlled customer, confirm customer-only data visibility, submit a service request, and test the QuickBooks hosted payment link with a sandbox or zero-risk test invoice before using it with a real customer.
10. Before relying on automated reminders, use controlled customer records to test each reminder type and confirm delivery, secure document links, preference opt-outs, and duplicate suppression. The schedule endpoint is protected by Vercel `CRON_SECRET`.
11. Run the first manual QuickBooks reconciliation against controlled invoices and compare CRM totals, balances, status, and Audit Trail entries with QuickBooks before treating reconciliation as the production receivables source of truth.
12. Confirm repository owners receive the first Vercel anomaly notification test and enable GitHub Actions failure notifications for the **Production health monitor** workflow if they are not already enabled at the account level.

## Next development milestone

Continue operational hardening:

1. Controlled end-to-end production acceptance test using dedicated technician and customer test accounts.
2. Complete administrator audit coverage for record edits, approvals, and invitation-delivery changes.
3. Add periodic QuickBooks vendor-status versus portal-access review.
4. Review Web Analytics and Speed Insights after enough real production traffic has accumulated.
5. Complete the dependency maintenance phase by September 30, 2026.
