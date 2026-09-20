# Deployment

## Project boundary

This is a standalone Next.js application in `D:/Git/Techsavvytechs/shop`. Do not deploy it into the existing `willjacksons` or `techsavvytechs` Vercel projects. Use a separate `techsavvy-gear` project.

## Current phase

Marketing and collection preview. No payment, database, or fulfillment secrets are required. The local server uses port 3100. All commerce integrations are deferred by request.

Live marketing preview: https://techsavvy-gear.vercel.app

Vercel scope/project: `techsavvy-projects/techsavvy-gear`. The shop.techsavvytechs.com domain is assigned to this project. Cloudflare must point shop to 3d2e0a84876f9c91.vercel-dns-017.com with DNS-only proxy status.

## Vercel

The existing Vercel project is connected to GitHub repository `Twiztedtech/Techsavvytechs`, production branch `main`, Root Directory `shop`. Pushing to GitHub triggers Vercel deployment. Framework: Next.js. Install: `npm ci`. Build: `npm run build`. Output: default. Use Node.js 24.x.

Validate with `npm run lint`, `npm run typecheck`, and `npm run build` before publishing. Check product selection, cart persistence, mobile navigation, inquiry drafts, and unavailable checkout in a browser.

## Domain

Intended production origin: `https://shop.techsavvytechs.com`, configured in `lib/catalog.ts`. The apex company site remains independent. Custom-domain assignment is complete; Cloudflare DNS is managed separately. Use the Vercel URL until DNS and HTTPS verification complete. Set canonical origin to the final approved domain before search indexing. Never change apex DNS as part of adding the shop subdomain.

## Connecting services later

Add server-only environment variables through Vercel only when implementing the corresponding services. Future examples: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, database URL/service credentials, and fulfillment provider tokens. Do not commit real values. Never expose service-role credentials with a NEXT_PUBLIC prefix.

Replace the mailto draft workflow with a validated, rate-limited server endpoint only when an email/lead service has been chosen. Update privacy disclosures when persistent inquiries, analytics, or payments are added.

## Repository location

The canonical source is the shop/ directory in Twiztedtech/Techsavvytechs. Existing history was imported with git subtree. Git integration was connected on September 20, 2026. Prefer Git-triggered deployments; the project now expects the full repository with Root Directory `shop`. Do not upload the shop folder alone as though the project root were still `.`. The main website keeps its current root configuration and its own Vercel project.

