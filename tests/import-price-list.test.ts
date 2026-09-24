import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildImportPlan, detectColumns, parseCsv, parsePrice } from '../src/features/catalog/importPriceList.ts';

test('parseCsv handles quotes, embedded commas/newlines, CRLF, BOM and blank lines', () => {
  const csv = '﻿SKU,Description,Price\r\nA-1,"Cat6 cable, 1000ft box","$1,234.50"\r\n\r\nB-2,"Says ""hi""\nsecond line",9\r\n';
  const parsed = parseCsv(csv);
  assert.deepEqual(parsed.headers, ['SKU', 'Description', 'Price']);
  assert.deepEqual(parsed.rows, [
    ['A-1', 'Cat6 cable, 1000ft box', '$1,234.50'],
    ['B-2', 'Says "hi"\nsecond line', '9'],
  ]);
});

test('detectColumns maps common supplier headers', () => {
  assert.deepEqual(detectColumns(['Part Number', 'Item Description', 'Category', 'Your Price', 'Qty']), {
    sku: 0, name: 1, category: 2, unitPrice: 3, quantityOnHand: 4,
  });
});

test('parsePrice accepts currency formats and rejects junk', () => {
  assert.equal(parsePrice('$1,234.567'), 1234.57);
  assert.equal(parsePrice(' 12 '), 12);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice('Call for price'), null);
  assert.equal(parsePrice('-5'), null);
  assert.equal(parsePrice(undefined), null);
});

const existing = [
  { id: 'i1', name: 'Cat6 Plenum Cable', sku: 'CAT6-P', category: 'Cable', unitPrice: 100, quantityOnHand: 7 },
  { id: 'i2', name: 'Patch panel 24p', sku: '', unitPrice: 50, quantityOnHand: 2 },
];

test('updates price by SKU without touching stock, creates new items with zero stock', () => {
  const parsed = parseCsv('sku,name,price\ncat6-p,Different Name,$110\nNEW-1,New thing,5.5\n');
  const plan = buildImportPlan(parsed, detectColumns(parsed.headers), existing);
  assert.equal(plan.updates.length, 1);
  assert.deepEqual(plan.updates[0].patch, { unitPrice: 110 }); // name NOT overwritten, quantity NOT touched
  assert.equal(plan.updates[0].previousPrice, 100);
  assert.deepEqual(plan.creates, [{ name: 'New thing', sku: 'NEW-1', category: '', unitPrice: 5.5, quantityOnHand: 0 }]);
});

test('matches by name when the row has no SKU; identical price is counted unchanged', () => {
  const parsed = parseCsv('name,price\nPatch Panel 24P,50\n');
  const plan = buildImportPlan(parsed, detectColumns(parsed.headers), existing);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.creates.length, 0);
});

test('quantity only changes when the file maps a quantity column', () => {
  const parsed = parseCsv('sku,price,qty\nCAT6-P,100,20\n');
  const plan = buildImportPlan(parsed, detectColumns(parsed.headers), existing);
  assert.deepEqual(plan.updates[0].patch, { quantityOnHand: 20 });
});

test('bad rows are reported with line numbers, not silently zeroed', () => {
  const parsed = parseCsv('sku,name,price\nX-1,Thing,call us\n,,5\nY-2,Other,3\n');
  const plan = buildImportPlan(parsed, detectColumns(parsed.headers), existing);
  assert.deepEqual(plan.skipped.map((s) => s.line), [2, 3]);
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].sku, 'Y-2');
});

test('a repeated SKU uses the last row and warns', () => {
  const parsed = parseCsv('sku,name,price\nZ-1,First,1\nZ-1,Second,2\n');
  const plan = buildImportPlan(parsed, detectColumns(parsed.headers), existing);
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].unitPrice, 2);
  assert.equal(plan.warnings.length, 1);
});

test('missing required column mappings produce a warning and no changes', () => {
  const plan = buildImportPlan(parseCsv('foo,bar\n1,2\n'), {}, existing);
  assert.equal(plan.creates.length + plan.updates.length, 0);
  assert.ok(plan.warnings.length > 0);
});
