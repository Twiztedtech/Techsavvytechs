const DEFAULT_PORTAL_CRON_URL = 'https://techsavvytechs.com/api/cron/client-portal';

async function triggerPortalAutomation(env, trigger = 'scheduled') {
  if (!env.CRON_SECRET) throw new Error('CRON_SECRET is not configured.');

  const response = await fetch(env.PORTAL_CRON_URL || DEFAULT_PORTAL_CRON_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      'Content-Type': 'application/json',
      'User-Agent': 'TechSavvy-Cloudflare-Scheduler/1.0',
    },
    body: JSON.stringify({ trigger }),
  });

  const responseText = await response.text();
  if (!response.ok) throw new Error(`Portal automation returned ${response.status}: ${responseText.slice(0, 500)}`);
  console.log('Portal automation completed.', responseText.slice(0, 1000));
}

export default {
  async scheduled(controller, env, context) {
    context.waitUntil(triggerPortalAutomation(env, `cron:${controller.cron}`));
  },
};
