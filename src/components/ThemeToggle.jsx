// src/components/ThemeToggle.jsx
import React from "react";

export default function ThemeToggle() {
  // Safe localStorage helpers (iOS private mode etc.)
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

  // System preference (for first run)
  const mql = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : { matches: false, addEventListener(){}, removeEventListener(){} };

  const initialTheme = () => {
    const saved = get("theme"); // "light" | "dark" | null
    if (saved === "light" || saved === "dark") return saved;
    return mql.matches ? "dark" : "light";
  };

  const [theme, setTheme] = React.useState(initialTheme);
  const [locked, setLocked] = React.useState(() => {
    const saved = get("theme");
    return saved === "light" || saved === "dark";
  });

  // Apply to DOM (cover all selector styles)
  const apply = React.useCallback((t) => {
    const html = document.documentElement;
    const body = document.body;

    // 1) Attribute selector
    html.setAttribute("data-theme", t);

    // 2) Class selectors
    html.classList.toggle("dark", t === "dark");
    body.classList.toggle("dark", t === "dark");
    body.classList.toggle("theme-dark", t === "dark");
    body.classList.toggle("theme-light", t === "light");

    // 3) Native form controls & UA widgets
    //    (lets inputs, scrollbars, pickers follow the theme)
    //    Also helps some mobile browsers.
    body.style.colorScheme = t; // CSS property
    let meta = document.querySelector('meta[name="color-scheme"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "color-scheme";
      document.head.appendChild(meta);
    }
    meta.content = t === "dark" ? "dark light" : "light dark";
  }, []);

  // On mount + whenever theme changes
  React.useEffect(() => {
    apply(theme);
    // Persist only if user explicitly locked a choice
    if (locked) set("theme", theme);
    else set("theme", null);
  }, [theme, locked, apply]);

  // Follow system changes *until* user toggles manually
  React.useEffect(() => {
    const onChange = (e) => { if (!locked) setTheme(e.matches ? "dark" : "light"); };
    try {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    } catch {
      return () => {};
    }
  }, [locked]);

  const toggle = () => {
    setLocked(true);           // from now on, keep user choice
    setTheme((t) => t === "dark" ? "light" : "dark");
  };

  return (
    <button
      type="button"
      className="btn secondary"
      onClick={toggle}
      title="Toggle theme"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}
