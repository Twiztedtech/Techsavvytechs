# TechSavvy Gear

Partner-facing marketing site and interactive collection preview for **shop.techsavvytechs.com**. Built separately from the existing company and personal websites.

## Run locally

Requires Node.js 22 or newer. From this directory:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3100. Run `npm run lint`, `npm run typecheck`, and `npm run build` before deployment. `npm start` serves the production build on port 3100.

## Included

- Responsive home, collection, category, product, story, partnership, contact, and informational pages.
- Product filters, search, sorting, color previews, size selection, and quantities.
- Device-local preview bag with a native accessible dialog and full bag page. Saved data is validated on load.
- Partnership and contact forms that prepare a mailto message; nothing is submitted until the visitor sends it through their email client. Copy fallback included.
- Page metadata, canonical URLs, sitemap, robots, loading/error/404 states.

## Deliberately deferred

Payments, customer accounts, order database, inventory reservations, admin interface, analytics, fulfillment integrations, and automated email. No credentials or database are required for this version. Checkout is an informational page, not an order endpoint. Do not enable commerce simply by toggling a flag.

## Editing

`lib/catalog.ts` owns product data, proposed prices (integer USD cents), colors, sizes, and store settings. Product imagery is displayed as non-destructive viewports into the supplied concept image, using `components/artwork.tsx`. These are temporary design previews, not production photography. Replace them with approved per-product assets before commerce launch. The original supplied logo and monogram are preserved in `public/brand/`.

Content lives in `app/`; interactive components in `components/`; theme and responsive rules in `app/globals.css`. Contact email was verified against the existing TechSavvy company website source. Inquiry forms do not send automatically.

See `DESIGN.md`, `PRODUCTS.md`, and `DEPLOYMENT.md` for handoff details.
