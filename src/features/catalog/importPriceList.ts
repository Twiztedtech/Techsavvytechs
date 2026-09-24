// Pure logic for importing a supplier price-list CSV into the materials
// catalog. Dependency-free so it can be unit-tested without Firebase
// (same approach as buildJobRecord.ts and record-links.ts).

export type ImportField = 'name' | 'sku' | 'category' | 'unitPrice' | 'quantityOnHand';
export type ColumnMap = Partial<Record<ImportField, number>>;

export interface ExistingItem {
  id: string;
  name: string;
  sku?: string;
  category?: string;
  unitPrice?: number;
  quantityOnHand?: number;
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export interface ImportCreate {
  name: string;
  sku: string;
  category: string;
  unitPrice: number;
  quantityOnHand: number;
}

export interface ImportUpdate {
  id: string;
  name: string;
  sku: string;
  previousPrice: number;
  unitPrice: number;
  // Only present when the file supplied a value for it; existing values for
  // anything not listed here are left untouched.
  patch: Partial<Pick<ImportCreate, 'name' | 'category' | 'unitPrice' | 'quantityOnHand'>>;
}

export interface ImportPlan {
  creates: ImportCreate[];
  updates: ImportUpdate[];
  unchanged: number;
  skipped: { line: number; reason: string }[];
  warnings: string[];
}

const HEADER_ALIASES: Record<ImportField, string[]> = {
  name: ['name', 'item', 'item name', 'description', 'product', 'product name', 'product description', 'item description'],
  sku: ['sku', 'part number', 'part #', 'part no', 'part no.', 'part', 'item number', 'item #', 'item no', 'mfr part', 'mfr part #', 'model', 'model number', 'catalog number', 'catalog #'],
  category: ['category', 'type', 'group', 'product category', 'department'],
  unitPrice: ['unit price', 'price', 'your price', 'net price', 'list price', 'cost', 'unit cost', 'sell price', 'each'],
  quantityOnHand: ['quantity', 'qty', 'on hand', 'quantity on hand', 'qty on hand', 'stock', 'in stock'],
};

// Minimal RFC 4180 parser: quoted fields, escaped quotes (""), commas and
// newlines inside quotes, CRLF or LF, and a leading BOM (Excel exports).
export function parseCsv(text: string): ParsedCsv {
  const source = text.replace(/^﻿/, '');
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  const endField = () => { record.push(field); field = ''; };
  const endRecord = () => {
    endField();
    if (record.some((cell) => cell.trim() !== '')) records.push(record);
    record = [];
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ',') endField();
    else if (char === '\r') { if (source[i + 1] === '\n') i++; endRecord(); }
    else if (char === '\n') endRecord();
    else field += char;
  }
  if (field !== '' || record.length) endRecord();
  const [headers = [], ...rows] = records;
  return { headers: headers.map((header) => header.trim()), rows };
}

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

// Guess which column holds which field. Exact alias match wins, in alias
// order, so "Unit Price" beats a bare "Cost" if both exist.
export function detectColumns(headers: string[]): ColumnMap {
  const normalized = headers.map(normalizeHeader);
  const map: ColumnMap = {};
  const used = new Set<number>();
  (Object.keys(HEADER_ALIASES) as ImportField[]).forEach((field) => {
    for (const alias of HEADER_ALIASES[field]) {
      const index = normalized.findIndex((header, i) => header === alias && !used.has(i));
      if (index !== -1) { map[field] = index; used.add(index); return; }
    }
  });
  return map;
}

// "$1,234.50", "1234.5", " 12 " -> number; anything else (blank, "call for
// price", negative) -> null so the row is reported, not silently zeroed.
export function parsePrice(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[$\s,]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

const parseQuantity = (raw: string | undefined): number | null => {
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw.replace(/[,\s]/g, ''));
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
};

export function buildImportPlan(parsed: ParsedCsv, columns: ColumnMap, existing: ExistingItem[]): ImportPlan {
  const plan: ImportPlan = { creates: [], updates: [], unchanged: 0, skipped: [], warnings: [] };
  if (columns.name === undefined && columns.sku === undefined) {
    plan.warnings.push('Choose a column for item name or SKU.');
    return plan;
  }
  if (columns.unitPrice === undefined) {
    plan.warnings.push('Choose a column for the price.');
    return plan;
  }

  const bySku = new Map<string, ExistingItem>();
  const byName = new Map<string, ExistingItem>();
  existing.forEach((item) => {
    const sku = item.sku?.trim().toLowerCase();
    if (sku && !bySku.has(sku)) bySku.set(sku, item);
    const name = item.name?.trim().toLowerCase();
    if (name && !byName.has(name)) byName.set(name, item);
  });

  const cell = (row: string[], field: ImportField) => (columns[field] === undefined ? undefined : (row[columns[field] as number] ?? '').trim());
  const rowKey = (row: string[]) => {
    const sku = cell(row, 'sku') ?? '';
    const name = cell(row, 'name') ?? '';
    return sku ? `sku:${sku.toLowerCase()}` : name ? `name:${name.toLowerCase()}` : '';
  };
  // Last row wins when the file repeats a key, but say so.
  const lastLineForKey = new Map<string, number>();
  parsed.rows.forEach((row, index) => { const key = rowKey(row); if (key) lastLineForKey.set(key, index + 2); });

  parsed.rows.forEach((row, index) => {
    const line = index + 2; // +1 for header, +1 for 1-based
    const sku = cell(row, 'sku') ?? '';
    const name = cell(row, 'name') ?? '';
    const category = cell(row, 'category') ?? '';
    const price = parsePrice(cell(row, 'unitPrice'));
    if (!sku && !name) return plan.skipped.push({ line, reason: 'No item name or SKU' });
    const laterLine = lastLineForKey.get(rowKey(row));
    if (laterLine !== undefined && laterLine !== line) {
      plan.warnings.push(`Line ${line} ("${sku || name}") is repeated on line ${laterLine}; the later row is used.`);
      return;
    }
    if (price === null) return plan.skipped.push({ line, reason: `Price "${cell(row, 'unitPrice') ?? ''}" isn't a valid amount` });
    const quantityRaw = cell(row, 'quantityOnHand');
    const quantity = parseQuantity(quantityRaw);
    if (quantityRaw && quantity === null) return plan.skipped.push({ line, reason: `Quantity "${quantityRaw}" isn't a valid number` });

    const match = (sku && bySku.get(sku.toLowerCase())) || (!sku ? byName.get(name.toLowerCase()) : undefined) || undefined;
    if (!match) {
      plan.creates.push({ name: name || sku, sku, category, unitPrice: price, quantityOnHand: quantity ?? 0 });
      return;
    }
    const patch: ImportUpdate['patch'] = {};
    const previousPrice = Number(match.unitPrice || 0);
    if (price !== previousPrice) patch.unitPrice = price;
    // Fill in blanks from the file but never overwrite what's already set.
    if (name && !match.name?.trim()) patch.name = name;
    if (category && !match.category?.trim()) patch.category = category;
    // Stock counts change only when the file explicitly maps a quantity column.
    if (quantity !== null && quantity !== Number(match.quantityOnHand ?? 0)) patch.quantityOnHand = quantity;
    if (Object.keys(patch).length === 0) plan.unchanged += 1;
    else plan.updates.push({ id: match.id, name: match.name, sku: match.sku || sku, previousPrice, unitPrice: price, patch });
  });
  return plan;
}
