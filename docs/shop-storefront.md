# TechSavvy Gear shop

The shop source is now part of this repository at `shop/`, imported with its original history from the standalone TechSavvy Gear repository.

- Intended domain: https://shop.techsavvytechs.com
- Review URL: https://techsavvy-gear.vercel.app
- Hosting project: `techsavvy-projects/techsavvy-gear` (separate from the company website)
- Local: `cd shop`, `npm ci`, `npm run dev` (port 3100)
- Verify: from `shop/`, run `npm run lint`, `npm run typecheck`, and `npm run build`.
- Deploy: push to GitHub `main`. The existing `techsavvy-gear` Vercel project is connected to `Twiztedtech/Techsavvytechs`, with Root Directory `shop` and production branch `main`.

The company site's TypeScript configuration excludes `shop/`; each application owns its dependencies, build, and deployment. No company-site routes or apex-domain records are replaced.

The custom domain is assigned in Vercel. The recommended Cloudflare record, verified September 20, is CNAME `shop` → `3d2e0a84876f9c91.vercel-dns-017.com`, DNS only, TTL Auto. This is a hostname, not an IP address. The existing `gear` A record is a different hostname.

This is a marketing/collection preview. Payments, order storage, fulfillment, and automatic inquiry submission are deferred. See `shop/README.md`, `shop/PRODUCTS.md`, and `shop/DEPLOYMENT.md` for full handoff information.
