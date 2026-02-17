"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type ABTheme = "tech" | "luxury";

type ThemeCtx = {
  theme: ABTheme;
  setTheme: (t: ABTheme) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

function getInitialTheme(): ABTheme {
  if (typeof window === "undefined") return "tech";
  const saved = window.localStorage.getItem("ab_theme");
  if (saved === "luxury" || saved === "tech") return saved;
  return "tech";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ABTheme>(getInitialTheme);

  const setTheme = (t: ABTheme) => {
    setThemeState(t);
    try {
      window.localStorage.setItem("ab_theme", t);
    } catch {}
  };

  useEffect(() => {
    // apply to <html>
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // keep in sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "ab_theme") return;
      if (e.newValue === "luxury" || e.newValue === "tech") setThemeState(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<ThemeCtx>(() => ({ theme, setTheme }), [theme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useABTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // fallback safe default so the app never crashes if someone forgets provider
    return {
      theme: (typeof document !== "undefined" && (document.documentElement.dataset.theme as ABTheme)) || "tech",
      setTheme: (_t: ABTheme) => {},
    };
  }
  return ctx;
}
