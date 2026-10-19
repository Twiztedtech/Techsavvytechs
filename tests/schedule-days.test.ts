import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanDays, dayPosition, describeDays, expandRange, firstDay, isMultiDay, jobOnDay, lastDay, normalizeSchedule, scheduleDays, techDaysFor, techOnDay,
} from '../api/_lib/schedule-days.js';

const week = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];

test('a legacy single-date job is one day and an unscheduled job is none', () => {
  assert.deepEqual(scheduleDays({ schedule: { date: '2026-10-23', start: '09:00', end: '17:00' } }), ['2026-10-23']);
  assert.deepEqual(scheduleDays({ schedule: { date: '', start: '', end: '' } }), []);
  assert.deepEqual(scheduleDays({}), []);
  assert.equal(isMultiDay({ schedule: { date: '2026-10-23' } }), false);
});

test('explicit days win, are sorted, de-duplicated and validated', () => {
  const job = { schedule: { date: '2026-10-19', days: ['2026-10-21', '2026-10-19', '2026-10-19', 'nope', '2026-13-40'] } };
  assert.deepEqual(scheduleDays(job), ['2026-10-19', '2026-10-21']);
  assert.equal(firstDay(job), '2026-10-19');
  assert.equal(lastDay(job), '2026-10-21');
  assert.equal(jobOnDay(job, '2026-10-20'), false);
  assert.deepEqual(cleanDays('not an array'), []);
});

test('a range is Mon-Fri by default and includes the weekend when asked', () => {
  assert.deepEqual(expandRange('2026-10-19', '2026-10-23'), week);
  assert.deepEqual(expandRange('2026-10-23', '2026-10-27'), ['2026-10-23', '2026-10-26', '2026-10-27']);
  assert.deepEqual(expandRange('2026-10-23', '2026-10-27', { weekends: true }), ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
  assert.deepEqual(expandRange('2026-10-24', '2026-10-24'), ['2026-10-24']); // a lone Saturday is honoured
  assert.deepEqual(expandRange('2026-10-24', '2026-10-25'), ['2026-10-24']); // weekend-only range falls back to the start day
  assert.deepEqual(expandRange('2026-10-20', '2026-10-19'), ['2026-10-20']); // end before start
  assert.deepEqual(expandRange('garbage', '2026-10-19'), []);
});

test('a technician works every day unless they have their own list', () => {
  const job = { schedule: { date: week[0], days: week, techDays: { tech2: [week[0], week[1], '2026-10-30'] } } };
  assert.deepEqual(techDaysFor(job, 'tech1'), week);
  assert.deepEqual(techDaysFor(job, 'tech2'), [week[0], week[1]]); // a date outside the job is ignored
  assert.equal(techOnDay(job, 'tech2', week[2]), false);
  assert.equal(techOnDay(job, 'tech1', week[2]), true);
  assert.deepEqual(techDaysFor({ schedule: { date: week[0], days: week, techDays: { tech3: [] } } }, 'tech3'), []);
});

test('normalizing keeps date = first day and only real per-technician differences', () => {
  const saved = normalizeSchedule({
    start: '09:00', end: '17:00', days: [week[2], week[0], week[1], week[3], week[4]],
    techDays: { tech1: week, tech2: [week[0], week[1]], ghost: [week[0]], tech3: 'bad' as unknown as string[] },
    assignedTechIds: ['tech1', 'tech2', 'tech3'],
  });
  assert.equal(saved.date, week[0]);
  assert.deepEqual(saved.days, week);
  assert.deepEqual(saved.techDays, { tech2: [week[0], week[1]] }); // tech1 is the default, ghost is not assigned, tech3 is invalid
  const single = normalizeSchedule({ date: '2026-10-23', start: '09:00', end: '17:00', days: ['2026-10-23'], techDays: { a: [] }, assignedTechIds: ['a'] });
  assert.deepEqual(single, { date: '2026-10-23', start: '09:00', end: '17:00' }); // single day keeps the original shape
  assert.deepEqual(normalizeSchedule({ days: [] }), { date: '', start: '', end: '' });
});

test('day position labels a multi-day job and stays quiet otherwise', () => {
  const job = { schedule: { date: week[0], days: week } };
  assert.deepEqual(dayPosition(job, week[1]), { number: 2, count: 5 });
  assert.equal(dayPosition(job, '2026-10-30'), null);
  assert.equal(dayPosition({ schedule: { date: week[0] } }, week[0]), null);
});

test('describing days reads naturally', () => {
  assert.equal(describeDays([]), '');
  assert.equal(describeDays(['2026-10-19']), 'Mon Oct 19');
  assert.equal(describeDays(week), 'Mon Oct 19 to Fri Oct 23');
  assert.equal(describeDays(['2026-10-23', '2026-10-26']), 'Fri Oct 23 to Mon Oct 26'); // a weekend gap is not a gap
  assert.equal(describeDays(['2026-10-19', '2026-10-20', '2026-10-22']), 'Mon Oct 19, Tue Oct 20, Thu Oct 22');
});
