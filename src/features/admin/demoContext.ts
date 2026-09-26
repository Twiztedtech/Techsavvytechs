import { createContext } from "react";

// Demo mode: when provided, the dispatch and roster components change local
// state only and never touch Firestore or any API. Used by the public /demo page.
export type DispatchDemoApi = {
  updateJob: (jobId: string, patch: Record<string, unknown>) => void;
  updateContractor?: (contractorId: string, patch: Record<string, unknown>) => void;
  addContractor?: (record: Record<string, unknown>) => void;
  timeEntries?: Array<Record<string, any>>;
};
export const DispatchDemoContext = createContext<DispatchDemoApi | null>(null);
