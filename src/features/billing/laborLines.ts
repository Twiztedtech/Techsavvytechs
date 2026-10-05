// Customer-facing labor lines for an invoice. Everything here is what the
// CUSTOMER is billed (bill rate, night rate, minimum) -- never the technician's
// pay rate, which lives on the time entry and the job's hourlyRate.

export type LaborEntry = { date?: string; clockIn?: string; clockOut?: string; totalHours?: string | number };
export type LaborLine = { description: string; quantity: number; unitPrice: number; kind: 'labor' };
export type LaborRates = { billRate: number; nightRate?: number; minimumHours?: number };

// Standard business hours per the service agreement: 7:00 AM - 5:00 PM on
// weekdays. Everything else (before 7, after 5, Sat/Sun) is the night rate.
// Holidays are not detected -- adjust those lines by hand.
const DAY_START = 7 * 60;
const DAY_END = 17 * 60;

const toMinutes = (value?: string) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
};

// Share (0-1) of the shift worked outside standard business hours.
export function nightFraction(entry: LaborEntry): number {
  const start = toMinutes(entry.clockIn);
  let end = toMinutes(entry.clockOut);
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(entry.date || ''));
  if (start === null || end === null || !dateMatch) return 0;
  if (end <= start) end += 1440;
  const baseDay = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])).getDay();
  let night = 0;
  for (let minute = start; minute < end; minute += 1) {
    const day = (baseDay + Math.floor(minute / 1440)) % 7;
    const minuteOfDay = minute % 1440;
    if (day === 0 || day === 6 || minuteOfDay < DAY_START || minuteOfDay >= DAY_END) night += 1;
  }
  return night / (end - start);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

// One standard line per calendar date worked (plus one night line when some of
// those hours fall outside business hours and a night rate exists). The
// customer sees headcount and hours, never who specifically worked.
export function buildLaborLines(entries: LaborEntry[], rates: LaborRates): LaborLine[] {
  const nightRate = Number(rates.nightRate) > 0 ? Number(rates.nightRate) : 0;
  const minimum = Number(rates.minimumHours) > 0 ? Number(rates.minimumHours) : 0;
  const byDate = new Map<string, { billed: number[]; night: number; minimumApplied: boolean }>();
  entries.forEach((entry) => {
    const worked = Number(entry.totalHours || 0);
    if (!worked) return;
    const billed = minimum && worked < minimum ? minimum : worked;
    const date = entry.date || 'Unspecified date';
    const group = byDate.get(date) || { billed: [], night: 0, minimumApplied: false };
    group.billed.push(billed);
    if (billed !== worked) group.minimumApplied = true;
    if (nightRate) group.night += billed * nightFraction(entry);
    byDate.set(date, group);
  });

  const lines: LaborLine[] = [];
  Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([date, group]) => {
      const total = group.billed.reduce((sum, hours) => sum + hours, 0);
      const night = round2(group.night);
      const standard = round2(total - night);
      const uniform = group.billed.every((hours) => hours === group.billed[0]);
      let description = group.billed.length === 1
        ? `${date} — 1 technician — ${group.billed[0].toFixed(2)} hrs`
        : uniform
          ? `${date} — ${group.billed.length} technicians @ ${group.billed[0].toFixed(2)} hrs each — ${total.toFixed(2)} hrs total`
          : `${date} — ${group.billed.length} technicians — ${total.toFixed(2)} hrs total`;
      if (group.minimumApplied) description += ` (${minimum}-hr minimum applied)`;
      if (night > 0) {
        if (standard > 0) lines.push({ description: `${date} — standard hours — ${standard.toFixed(2)} hrs`, quantity: standard, unitPrice: rates.billRate, kind: 'labor' });
        lines.push({ description: `${date} — night / weekend hours — ${night.toFixed(2)} hrs`, quantity: night, unitPrice: nightRate, kind: 'labor' });
      } else {
        lines.push({ description, quantity: round2(total), unitPrice: rates.billRate, kind: 'labor' });
      }
    });
  return lines;
}
