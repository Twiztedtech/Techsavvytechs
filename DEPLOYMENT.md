# Deployment

## Project boundary

This is a standalone Next.js application in `D:/Git/techsavvy-gear`. Do not deploy it into the existing `willjacksons` or `techsavvytechs` Vercel projects. Use a separate `techsavvy-gear` project.

## Current phase

Marketing and collection preview. No payment, database, or fulfillment secrets are required. The local server uses port 3100. All commerce integrations are deferred by request.

Live marketing preview: https://techsavvy-gear.vercel.app

Vercel scope/project: `techsavvy-projects/techsavvy-gear`. Custom shop domain is not connected yet.

## Vercel

Connect the standalone repository or deploy this directory with Vercel CLI. Framework: Next.js. Install: `npm ci`. Build: `npm run build`. Output: default. Use Node.js 24.x.

Validate with `npm run lint`, `npm run typecheck`, and `npm run build` before publishing. Check product selection, cart persistence, mobile navigation, inquiry drafts, and unavailable checkout in a browser.

## Domain

Intended production origin: `https://shop.techsavvytechs.com`, configured in `lib/catalog.ts`. The apex company site remains independent. Custom-domain assignment and DNS changes are deferred; use the Vercel deployment URL for review first. Set canonical origin to the final approved domain before search indexing. Never change apex DNS as part of adding the shop subdomain.

## Connecting services later

Add server-only environment variables through Vercel only when implementing the corresponding services. Future examples: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, database URL/service credentials, and fulfillment provider tokens. Do not commit real values. Never expose service-role credentials with a NEXT_PUBLIC prefix.

Replace the mailto draft workflow with a validated, rate-limited server endpoint only when an email/lead service has been chosen. Update privacy disclosures when persistent inquiries, analytics, or payments are added.
