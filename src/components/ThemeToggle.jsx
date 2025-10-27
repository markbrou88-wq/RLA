import React from "react";

export default function ThemeToggle() {
  // Safe helpers even if window doesn't exist
  const safeMatchMedia = (q) => {
    if (typeof window === "undefined" || !window.matchMedia) return { matches: false };
    try {
      return window.matchMedia(q);
    } catch {
      return { matches: false };
    }
  };
  const safeGetStorage = (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const safeSetStorage = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };

  const getInitial = () => {
    const saved = safeGetStorage("theme");
    if (saved === "dark" || saved === "light") return saved;
    return safeMatchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const [theme, setTheme] = React.useState(getInitial);

  React.useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
    safeSetStorage("theme", theme);
  }, [theme]);

  return (
    <button
      className="btn secondary"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title="Toggle theme"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}
