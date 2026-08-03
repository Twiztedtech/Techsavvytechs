interface TimeEntryTotalsInput {
  totalHours?: string | number;
  rate?: number;
  suppliesCost?: string | number;
  travelCost?: string | number;
  laborStatus?: string;
  suppliesStatus?: string;
  travelStatus?: string;
}

export function getEntryTotals(entry: TimeEntryTotalsInput) {
  const labor = Number(entry.totalHours || 0) * (entry.rate || 75);
  const supplies = Number(entry.suppliesCost || 0);
  const travel = Number(entry.travelCost || 0);

  return {
    labor,
    supplies,
    travel,
    totalGross: labor + supplies + travel,
    totalApproved:
      (entry.laborStatus === 'approved' ? labor : 0) +
      (entry.suppliesStatus === 'approved' ? supplies : 0) +
      (entry.travelStatus === 'approved' ? travel : 0),
  };
}

export function formatElapsed(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function getGoogleMapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
