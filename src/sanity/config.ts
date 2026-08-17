export const sanityConfig = {
  projectId: import.meta.env.VITE_SANITY_PROJECT_ID || 'dnlgguay',
  dataset: import.meta.env.VITE_SANITY_DATASET || 'production',
  apiVersion: '2026-08-17',
} as const
