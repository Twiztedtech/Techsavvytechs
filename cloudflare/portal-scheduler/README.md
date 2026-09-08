# TechSavvy portal scheduler

This Cloudflare Worker invokes the production portal automation endpoint every hour. The endpoint processes appointment reminders, closeout reminders, automatic closeout, and pending Google Calendar synchronization.

`CRON_SECRET` must contain the same secret stored in the Vercel production environment. Store it with `wrangler secret put CRON_SECRET`; never add the value to source control.

Useful commands, run from this directory:

```bash
pnpm dlx wrangler deploy
pnpm dlx wrangler secret put CRON_SECRET
pnpm dlx wrangler tail
```

The Worker is scheduled-only and has no public route. Cloudflare Workers Logs and Cron Events provide its execution history.
