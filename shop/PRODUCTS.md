# Collection 001

All pricing and options below are proposed, not offers for sale.

| Design | Price | Proposed colors |
|---|---:|---|
| TechSavvy Logo Tee | $28 | Black, Charcoal, Olive, White |
| Mission Tee | $28 | Black |
| Head Geek Tee | $28 | Black, Charcoal, Olive |
| People Matter Tee | $28 | Black |
| TechSavvy Hoodie | $55 | Black, Charcoal |

Proposed sizes: S–4XL. No size surcharges are enabled. Garment composition, measurements, supplier availability, shipping, and return terms are intentionally not invented.

The Logo Tee has color-specific concept images. Other designs display the supplied black concept with an explicit notice when a different color is selected. The Mission Tee image depicts the back design. No unavailable front/lifestyle image is fabricated.

## Future commerce schema

Keep Products, Variants, ArtworkVersions, BlankInventory, TransferInventory, Orders, OrderItems, Payments, FulfillmentGroups, and Shipments separate. Product variants should map to a fulfillment provider and approved production asset. Snapshot price, variant, and artwork version on order items. Multiple designs must share blank inventory rather than each receiving a copy of its quantity.

Use independent payment and fulfillment states, support split shipments and partial refunds, and validate availability and price server-side at checkout. Use idempotent, signature-verified payment and supplier webhooks. The current `fulfillment` values are planning defaults only: in-house tees and an optional POD hoodie. They do not route orders.

## Launch gates

1. Confirm blank garments, print placements, costs, and sample approval.
2. Supply print-ready artwork and independent product photography.
3. Confirm each variant and garment-specific size chart.
4. Finalize prices, stock/production capacity, shipping, and return policies.
5. Implement database, protected admin, payments, fulfillment, and transactional email.
6. Test successful/failed payments, duplicate webhooks, stock conflicts, refunds, and split shipments before opening orders.
