import assert from 'node:assert/strict';
import test from 'node:test';
import { jobsNeedingCloseout, jobsNeedingInvoice } from '../api/_lib/job-alerts.js';

const today = new Date('2026-10-01T12:00:00Z');

test('jobsNeedingCloseout: flags a job 3 days past its scheduled date, still open', () => {
  const jobs = [{ id: 'a', status: 'Scheduled', schedule: { date: '2026-09-28' } }];
  const result = jobsNeedingCloseout(jobs, { today });
  assert.equal(result.length, 1);
  assert.equal(result[0].job.id, 'a');
  assert.equal(result[0].daysOverdue, 3);
});

test('jobsNeedingCloseout: a job within the grace window is not flagged yet', () => {
  const jobs = [{ id: 'a', status: 'Scheduled', schedule: { date: '2026-09-30' } }];
  assert.equal(jobsNeedingCloseout(jobs, { today, graceDays: 2 }).length, 0);
});

test('jobsNeedingCloseout: a completed/invoiced/voided job is never flagged', () => {
  const jobs = [
    { id: 'a', status: 'Completed', schedule: { date: '2026-09-01' } },
    { id: 'b', status: 'Invoiced', schedule: { date: '2026-09-01' } },
    { id: 'c', status: 'voided', schedule: { date: '2026-09-01' } },
    { id: 'd', status: 'Ready to Invoice', schedule: { date: '2026-09-01' } },
  ];
  assert.equal(jobsNeedingCloseout(jobs, { today }).length, 0);
});

test('jobsNeedingCloseout: a job with no scheduled date is never flagged', () => {
  assert.equal(jobsNeedingCloseout([{ id: 'a', status: 'Scheduled' }], { today }).length, 0);
});

test('jobsNeedingCloseout: falls back to targetCompletion when there is no schedule', () => {
  const jobs = [{ id: 'a', status: 'New', targetCompletion: '2026-09-20' }];
  assert.equal(jobsNeedingCloseout(jobs, { today }).length, 1);
});

test('jobsNeedingInvoice: flags a completed job with no invoice after the grace period', () => {
  const jobs = [{ id: 'a', status: 'Completed', completedAt: '2026-09-25' }];
  const result = jobsNeedingInvoice(jobs, [], { today });
  assert.equal(result.length, 1);
  assert.equal(result[0].daysWaiting, 6);
});

test('jobsNeedingInvoice: a job that already has a real invoice is not flagged', () => {
  const jobs = [{ id: 'a', status: 'Completed', completedAt: '2026-09-25' }];
  const invoices = [{ jobId: 'a', type: 'service' }];
  assert.equal(jobsNeedingInvoice(jobs, invoices, { today }).length, 0);
});

test('jobsNeedingInvoice: a deposit invoice does not count as the job being invoiced', () => {
  const jobs = [{ id: 'a', status: 'Completed', completedAt: '2026-09-25' }];
  const invoices = [{ jobId: 'a', type: 'deposit' }];
  assert.equal(jobsNeedingInvoice(jobs, invoices, { today }).length, 1);
});

test('jobsNeedingInvoice: a job still Scheduled or New is never flagged', () => {
  const jobs = [
    { id: 'a', status: 'Scheduled', completedAt: '2026-09-01' },
    { id: 'b', status: 'New' },
  ];
  assert.equal(jobsNeedingInvoice(jobs, [], { today }).length, 0);
});

test('jobsNeedingInvoice: respects a custom grace period', () => {
  const jobs = [{ id: 'a', status: 'Completed', completedAt: '2026-09-30' }];
  assert.equal(jobsNeedingInvoice(jobs, [], { today, graceDays: 3 }).length, 0);
  assert.equal(jobsNeedingInvoice(jobs, [], { today, graceDays: 1 }).length, 1);
});
