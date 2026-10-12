import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTechReminder, formatClock, formatServiceDate, jobsNeedingTechReminder } from '../api/_lib/tech-reminders.js';

const tomorrow = '2026-10-12';
const job = {
  id: 'j-1', workOrderNumber: 'WO-2026-51739', name: 'Tesla _ Fremont', vendorName: 'ATG', status: 'Scheduled',
  address: '47700 Kato Rd, Fremont, CA 94538', schedule: { date: tomorrow, start: '09:00', end: '17:00' },
  assignedTechIds: ['a', 'b', 'a'],
};

test('formatClock converts 24-hour times and leaves odd input alone', () => {
  assert.equal(formatClock('09:00'), '9:00 AM');
  assert.equal(formatClock('17:30'), '5:30 PM');
  assert.equal(formatClock('00:15'), '12:15 AM');
  assert.equal(formatClock('12:00'), '12:00 PM');
  assert.equal(formatClock(''), '');
  assert.equal(formatClock('noon'), 'noon');
});

test('formatServiceDate gives weekday and month without timezone drift', () => {
  assert.equal(formatServiceDate('2026-10-12'), 'Mon, Oct 12');
});

test('a scheduled job tomorrow reminds each assigned technician once', () => {
  const result = jobsNeedingTechReminder([job], { tomorrow });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].techIds, ['a', 'b']);
  assert.equal(result[0].serviceDate, tomorrow);
});

test('targetCompletion is used when there is no schedule date', () => {
  const noSchedule = { ...job, schedule: undefined, targetCompletion: tomorrow };
  assert.equal(jobsNeedingTechReminder([noSchedule], { tomorrow }).length, 1);
});

test('other dates, finished jobs, demo jobs and open-to-all jobs are skipped', () => {
  const cases = [
    { ...job, schedule: { date: '2026-10-13' } },
    { ...job, status: 'Completed' },
    { ...job, status: 'Voided' },
    { ...job, isDemo: true },
    { ...job, assignedTechIds: ['ALL'] },
    { ...job, assignedTechIds: [], assignedTechId: '' },
  ];
  for (const candidate of cases) assert.equal(jobsNeedingTechReminder([candidate], { tomorrow }).length, 0, JSON.stringify(candidate));
});

test('assignedTechId is used when assignedTechIds is missing', () => {
  const single = { ...job, assignedTechIds: undefined, assignedTechId: 'solo' };
  assert.deepEqual(jobsNeedingTechReminder([single], { tomorrow })[0].techIds, ['solo']);
});

test('the message carries the time, address, directions link and portal link', () => {
  const message = buildTechReminder({ job, technician: { name: 'Anthony Milliner' }, serviceDate: tomorrow, appUrl: 'https://techsavvytechs.com/' });
  assert.match(message.subject, /Tesla _ Fremont/);
  assert.match(message.subject, /9:00 AM/);
  assert.match(message.text, /^Hi Anthony,/);
  assert.match(message.text, /Mon, Oct 12, 9:00 AM to 5:00 PM/);
  assert.match(message.text, /47700 Kato Rd, Fremont, CA 94538/);
  assert.match(message.text, /google\.com\/maps\/dir\/\?api=1&destination=47700%20Kato%20Rd/);
  assert.match(message.text, /https:\/\/techsavvytechs\.com\/contractor\/dashboard/);
  assert.ok(message.sms.length < 200, `SMS too long: ${message.sms.length}`);
  assert.match(message.sms, /WO-2026-51739/);
});

test('the placeholder address is never shown or turned into a directions link', () => {
  const message = buildTechReminder({ job: { ...job, address: 'Address on file' }, technician: { name: 'A' }, serviceDate: tomorrow });
  assert.doesNotMatch(message.text, /Address on file/);
  assert.doesNotMatch(message.text, /google\.com\/maps/);
  assert.doesNotMatch(message.html, /Get directions/);
});

test('html output escapes job and technician text', () => {
  const message = buildTechReminder({ job: { ...job, name: '<script>x</script>' }, technician: { name: '"><b>Bob' }, serviceDate: tomorrow });
  assert.doesNotMatch(message.html, /<script>/);
  assert.doesNotMatch(message.html, /<b>Bob/);
});
