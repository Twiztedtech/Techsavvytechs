// Starter content for the technician community and training library.
//
//   node scripts/seed-community.mjs            (dry run: lists what it would add)
//   node scripts/seed-community.mjs --apply    (writes)
//
// Lessons are created as DRAFTS (only admins and Technician Leads can see them) so
// they can be reviewed and edited before anyone relies on them. Re-running never
// overwrites a page that already exists, so edits made in the app are safe.
// A single pinned welcome thread is added to the General category (no announcement is sent).

import { config } from 'dotenv';
import { createRequire } from 'node:module';

config({ path: '.env.local' });
const require = createRequire(import.meta.url);
void require;
const { adminDb } = await import('../api/_lib/firebase-admin.js');

const apply = process.argv.includes('--apply');
const now = new Date().toISOString();

const lessons = [
  {
    slug: 'cat6a-termination-and-testing', track: 'Cabling', order: 1, estimatedMinutes: 15,
    title: 'Cat6A termination and testing',
    summary: 'Terminate to the T568B pinout, keep the pairs tight, and prove every run with a test.',
    body: `# Cat6A termination and testing

A bad termination is the most common cause of a callback. Take the extra minute to do each one cleanly.

## Before you start

- [ ] Confirm the cable type on the job (Cat6 or Cat6A) and use matching jacks and patch panels
- [ ] Pull the cable with no kinks and never past the pull tension on the reel
- [ ] Leave a service loop at each end (about 12 inches at the outlet, more in the rack)

## Terminating

1. Strip only as much jacket as the jack requires.
2. Keep the pairs twisted right up to the termination point. For Cat6A, untwist as little as you can.
3. Follow the **T568B** colour order unless the customer's standard says otherwise. Use the same standard at both ends.
4. Seat each conductor fully, then punch or close the jack per its instructions.
5. Fit the strain relief or boot and check the shield bonding if the cable is shielded.

## Bends and ties

- Keep bends gentle. As a rule of thumb the radius should be at least four times the cable's diameter.
- Use hook-and-loop straps. Never pull a plastic tie tight enough to squash the jacket.

## Test every run

- A basic tester proves the wire map. A certifier proves the run meets the category.
- Save the results for the job record. Fix any failure before you move on.
- Label both ends before you leave the room. See the labeling lesson.

## Common mistakes

- Untwisting too much pair at the jack
- Mixing T568A at one end and T568B at the other
- Stretching the cable during a pull
- Crushing the cable with ties or a tight J-hook
`,
  },
  {
    slug: 'rack-dressing-and-labeling', track: 'Cabling', order: 2, estimatedMinutes: 12,
    title: 'Rack dressing and labeling',
    summary: 'Leave every rack so the next technician can trace any cable in seconds.',
    body: `# Rack dressing and labeling

A clean rack is how customers judge the whole job. It is also how the next person fixes a problem fast.

## Dressing

- Route cables in bundles through the vertical and horizontal managers, never across equipment faces.
- Use hook-and-loop straps, snug but not tight.
- Keep power and data separated where the rack allows.
- Leave a short service loop so a device can be slid out without tension.
- Use patch cords of the right length so there is no big slack coil in the rack.

## Labeling

1. Label **both ends** of every cable with the same ID.
2. Match the ID to the patch panel port and the wall plate.
3. Use printed labels, not handwriting.
4. Keep the scheme the customer already uses. If there is none, propose one and write it on the as-built.

## Before you leave

- [ ] Photo of the finished rack, front and back
- [ ] Photo of each patch panel with labels readable
- [ ] Marked-up port map or as-built given to the site contact or sent to the office
- [ ] Packaging and offcuts removed
`,
  },
  {
    slug: 'fiber-inspect-and-clean', track: 'Fiber', order: 1, estimatedMinutes: 12,
    title: 'Fiber: inspect, clean, connect',
    summary: 'Dirty connectors cause most fiber faults. Inspect and clean every end face before you mate it.',
    body: `# Fiber: inspect, clean, connect

Most fiber problems are dirt on the connector end face. A speck smaller than a hair can block the signal.

## Safety first

- **Never look into the end of a fiber or a port** that may be live. You cannot see the light and it can damage your eyes.
- Treat glass shards as sharp waste. Collect them in a sealed container.

## The routine

1. **Inspect** the end face with a scope.
2. **Clean** it if it is not spotless, using the right cleaner for the connector type (one-click pen, or lint-free wipe with cleaner).
3. **Inspect again.** Repeat until clean.
4. **Connect.** Do not touch the end face.
5. Fit the dust cap back on anything left unmated.

## Handling

- Respect the minimum bend radius on the cable and patch cord.
- Do not pull fiber by the connector.
- Check the fiber type before you connect. Aqua (OM3/OM4) and yellow (single-mode) cables are not interchangeable.

## Testing

- Use a power meter and light source, or an OTDR, as the job requires.
- Record the results against the loss budget and save them with the job.
`,
  },
  {
    slug: 'ladder-ceiling-and-site-safety', track: 'Safety', order: 1, estimatedMinutes: 10,
    title: 'Ladders, ceilings and site safety',
    summary: 'The basics that keep you and the customer safe on every site.',
    body: `# Ladders, ceilings and site safety

Follow the customer's site rules and TechSavvy's safety expectations. When in doubt, stop and call the office.

## Ladders

- Inspect the ladder before every use. Do not use a damaged one.
- Keep three points of contact and do not overreach. Move the ladder.
- Keep it level and on a stable floor, and keep people clear below.

## Ceilings and attics

- Look before you lift a tile. Check for pipes, wires and anything that looks like insulation or tile you do not recognise.
- **If you suspect asbestos or any hazardous material, stop work and report it.** Do not disturb it.
- In hot attics, take breaks and drink water.
- Wear eye protection when cutting, drilling or working overhead.

## Penetrations and fire

- Do not leave holes through fire-rated walls or floors. Firestop them per the job scope or tell the office.

## Power

- Never work on energized equipment you are not trained and authorised to work on.
- Do not unplug or move customer equipment unless it is part of the job.

## If something goes wrong

1. Make the area safe.
2. Get medical help if needed.
3. Call the office as soon as it is safe.
`,
  },
  {
    slug: 'using-the-technician-app', track: 'Getting started', order: 1, estimatedMinutes: 8,
    title: 'Using the technician app on a job',
    summary: 'Clock in, document the work, attach receipts, and finish the job in the app.',
    body: `# Using the technician app on a job

## Before the job

- Check your upcoming jobs and the address. Use **Get Directions** to open maps from where you are.
- Keep notifications on so you get reminders and schedule changes.

## On site

1. **Clock in** when you start. The app records where you clocked in. Allow location when asked so the stamp is saved.
2. Take **photos** as you work: before, during, and after.
3. Keep your **receipts**. Attach a photo of each one to your timesheet so supplies and tolls are paid back.
4. If the customer needs to sign off, collect the signature in the app.

## Finishing

- **Clock out** when you leave. Add your break time.
- Check the hours before you submit.
- If something is wrong with your time, use the correction request instead of editing around it.

## Where to get help

- Ask in the **Community** section. Someone has probably hit it already.
- For anything urgent, use **Contact Admin** or call the office.
`,
  },
  {
    slug: 'customer-site-etiquette', track: 'Getting started', order: 2, estimatedMinutes: 6,
    title: 'Customer site etiquette',
    summary: 'How we show up, work, and leave a customer site.',
    body: `# Customer site etiquette

How you act on site reflects on everyone at TechSavvy.

## Arriving

- Arrive on time. If you are running late, tell the office before you are late.
- Check in with the site contact and confirm the scope for the day.
- Wear clean work clothes and keep your TechSavvy ID visible if you have one.

## Working

- Protect floors and furniture. Use drop cloths and shoe covers where needed.
- Keep your tools and cases in the work area.
- Do not discuss pricing or contract details with the customer. Send those questions to the office.
- **If the customer asks for extra work, do not agree to it on the spot.** Tell them you will pass it to the office so it can be scoped properly.

## Privacy

- Do not photograph screens, documents or people that are not part of the job.
- Do not post customer sites or equipment to social media.

## Leaving

- Clean up. Take all packaging and offcuts with you.
- Walk the site contact through what was done and get any sign-off the job needs.
- Say thank you.
`,
  },
];

const welcome = {
  id: 'welcome-to-the-community',
  categoryId: 'general',
  title: 'Welcome to the TechSavvy technician community',
  body: `This is the place for the crew to talk shop.

**What it is for**

- Ask questions when you are stuck on a job
- Share what worked, including photos of a good install
- Help each other with tools, fiber, cabling, cell boosters and working with customers

**Ground rules**

- Be respectful. We are all learning.
- Do not post customer names, prices, passwords or private site details
- Use the **Report** button if something is not right

**Training**

The **Training** section has short lessons on the work we do. Mark a lesson as completed when you have read it. If you spot something wrong or out of date, use **Suggest an edit** and a technician lead will review it.

Reply below to say hello.`,
};

const planned = [];
for (const lesson of lessons) {
  const exists = (await adminDb.collection('wiki_pages').doc(lesson.slug).get()).exists;
  planned.push({ what: `lesson ${lesson.slug}`, action: exists ? 'skip (already exists)' : 'create draft' });
  if (!apply || exists) continue;
  await adminDb.collection('wiki_pages').doc(lesson.slug).set({
    title: lesson.title, track: lesson.track, summary: lesson.summary, body: lesson.body, visibility: 'members', status: 'draft', order: lesson.order,
    estimatedMinutes: lesson.estimatedMinutes, version: 0, searchText: `${lesson.title} ${lesson.body}`.toLowerCase().slice(0, 4000),
    createdAt: now, createdByName: 'TechSavvy', updatedAt: now, updatedByUid: 'seed', updatedByName: 'TechSavvy',
  });
}

const threadRef = adminDb.collection('community_threads').doc(welcome.id);
const threadExists = (await threadRef.get()).exists;
const categoryExists = (await adminDb.collection('community_categories').doc(welcome.categoryId).get()).exists;
planned.push({ what: 'welcome thread', action: threadExists ? 'skip (already exists)' : categoryExists ? 'create pinned' : 'skip (General category missing; open /community once first)' });
if (apply && !threadExists && categoryExists) {
  await threadRef.set({
    categoryId: welcome.categoryId, title: welcome.title, body: welcome.body, photos: [], authorUid: 'techsavvy', authorName: 'TechSavvy', authorRole: 'admin',
    createdAt: now, lastActivityAt: now, replyCount: 0, pinned: true, locked: false, solvedReplyId: '', status: 'active', followers: [],
    searchText: `${welcome.title} ${welcome.body}`.toLowerCase().slice(0, 4000),
  });
}

console.table(planned);
console.log(apply ? 'Applied.' : 'Dry run only. Re-run with --apply to write.');
process.exit(0);
