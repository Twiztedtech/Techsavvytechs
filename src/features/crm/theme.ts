import { useEffect, useState } from "react";

export type CrmThemeName = "light" | "dark";

const STORAGE_KEY = "techsavvy-crm-theme";

function readStoredTheme(): CrmThemeName {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/**
 * CRM-only theme state, persisted per-browser. Defaults to light. Nothing
 * here touches <html>/<body> — callers apply the returned theme as a
 * `.dark` class on the CRM's own root wrapper so it can never leak into the
 * marketing site, contractor portal, or client portal.
 */
export function useCrmTheme() {
  const [theme, setTheme] = useState<CrmThemeName>(() => readStoredTheme());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore write failures (private browsing, storage disabled, etc.) —
      // the toggle still works for the rest of the session.
    }
  }, [theme]);

  const toggle = () => setTheme((current) => (current === "dark" ? "light" : "dark"));

  return { theme, toggle };
}
