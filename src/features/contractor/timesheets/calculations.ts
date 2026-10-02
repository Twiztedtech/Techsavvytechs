interface TimeEntryTotalsInput {
  totalHours?: string | number;
  rate?: number;
  suppliesCost?: string | number;
  travelCost?: string | number;
  bonusCost?: string | number;
  laborStatus?: string;
  suppliesStatus?: string;
  travelStatus?: string;
  bonusStatus?: string;
}

export function getEntryTotals(entry: TimeEntryTotalsInput) {
  const labor = Number(entry.totalHours || 0) * (entry.rate || 75);
  const supplies = Number(entry.suppliesCost || 0);
  const travel = Number(entry.travelCost || 0);
  const bonus = Number(entry.bonusCost || 0);

  return {
    labor,
    supplies,
    travel,
    bonus,
    totalGross: labor + supplies + travel + bonus,
    totalApproved:
      (entry.laborStatus === 'approved' ? labor : 0) +
      (entry.suppliesStatus === 'approved' ? supplies : 0) +
      (entry.travelStatus === 'approved' ? travel : 0) +
      (entry.bonusStatus === 'approved' ? bonus : 0),
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

// A key-less Google Maps directions deep link -- no Maps API/SDK needed.
// Omitting origin still works correctly: Google Maps (app or mobile web)
// falls back to using the device's own current location automatically, so
// this degrades gracefully when geolocation isn't available.
export function getDirectionsUrl(address: string, origin?: { lat: number; lng: number }) {
  const params = new URLSearchParams({ api: '1', destination: address, travelmode: 'driving' });
  if (origin) params.set('origin', `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
