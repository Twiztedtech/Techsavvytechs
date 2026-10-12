import { auth } from '../../lib/firebase';

// Asks the server for the driving distance between the home base and a job site.
// The server caches every answer, so repeat lookups are instant.

export type RouteEstimate = {
  roundTripMiles: number;
  oneWayMiles: number;
  oneWayMinutes: number;
  from?: string;
  to?: string;
  cached?: boolean;
};

export async function estimateRoundTrip(destination: string, origin?: string): Promise<RouteEstimate> {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch('/api/portal/time-clock?portalOperation=routeEstimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ destination, origin: origin || undefined }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The distance could not be looked up. Type the miles by hand.');
  return data as RouteEstimate;
}

/** "About 67 mi each way (81 min) from Fairfield, CA 94533." */
export const describeRoute = (route: RouteEstimate, origin: string) =>
  `About ${route.oneWayMiles} mi each way (${route.oneWayMinutes} min) from ${origin}.`;
