"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Appearance = "light" | "dark";
export type AccentColor =
  | "green"
  | "brown"
  | "orange"
  | "rose"
  | "indigo"
  | "blue"
  | "purple"
  | "teal";
export type Density = "compact" | "balanced" | "comfy";

interface ThemePrefs {
  appearance: Appearance;
  accent: AccentColor;
  density: Density;
}

interface ThemeContextValue extends ThemePrefs {
  setAppearance: (value: Appearance) => void;
  setAccent: (value: AccentColor) => void;
  setDensity: (value: Density) => void;
}

export const THEME_STORAGE_KEY = "counter-app-theme";

export const DEFAULT_THEME: ThemePrefs = {
  appearance: "light",
  accent: "green",
  density: "balanced",
};

export const ACCENT_COLORS: { value: AccentColor; label: string }[] = [
  { value: "green", label: "Green" },
  { value: "brown", label: "Brown" },
  { value: "orange", label: "Orange" },
  { value: "rose", label: "Rose" },
  { value: "indigo", label: "Indigo" },
  { value: "blue", label: "Blue" },
  { value: "purple", label: "Purple" },
  { value: "teal", label: "Teal" },
];

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyToDocument(prefs: ThemePrefs) {
  const root = document.documentElement;
  root.dataset.appearance = prefs.appearance;
  root.dataset.accent = prefs.accent;
  root.dataset.density = prefs.density;
}

function readPersistedPrefs(): ThemePrefs {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ThemePrefs>;
      return { ...DEFAULT_THEME, ...parsed };
    }
  } catch {
    // ignore malformed storage
  }
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ThemePrefs>(readPersistedPrefs);

  useEffect(() => {
    applyToDocument(prefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((next: ThemePrefs) => {
    setPrefs(next);
    applyToDocument(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage failures (private browsing, quota, etc.)
    }
  }, []);

  const setAppearance = useCallback(
    (appearance: Appearance) => persist({ ...prefs, appearance }),
    [prefs, persist],
  );
  const setAccent = useCallback(
    (accent: AccentColor) => persist({ ...prefs, accent }),
    [prefs, persist],
  );
  const setDensity = useCallback(
    (density: Density) => persist({ ...prefs, density }),
    [prefs, persist],
  );

  return (
    <ThemeContext.Provider
      value={{ ...prefs, setAppearance, setAccent, setDensity }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside a ThemeProvider");
  }
  return ctx;
}

export const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var raw = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var prefs = raw ? JSON.parse(raw) : {};
    var appearance = prefs.appearance || ${JSON.stringify(DEFAULT_THEME.appearance)};
    var accent = prefs.accent || ${JSON.stringify(DEFAULT_THEME.accent)};
    var density = prefs.density || ${JSON.stringify(DEFAULT_THEME.density)};
    var root = document.documentElement;
    root.dataset.appearance = appearance;
    root.dataset.accent = accent;
    root.dataset.density = density;
  } catch (e) {}
})();
`;