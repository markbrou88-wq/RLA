import React from "react";

export default function ThemeToggle() {
  const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const mql = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : { matches: false, addEventListener() {}, removeEventListener() {} };

  // If user has a saved theme, use it; otherwise follow system
  const getInitial = () => {
    const saved = safeGet("theme");
    if (saved === "dark" || saved === "light") return saved;
    return mql.matches ? "dark" : "light";
  };

  const [theme, setTheme] = React.useState(getInitial);
  const [userLocked, setUserLocked] = React.useState(() => {
    const saved = safeGet("theme");
    return saved === "dark" || saved === "light";
  });

  // Apply to DOM + persist
  React.useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-theme", theme);
    html.classList.toggle("dark", theme === "dark");

    // keep UA widgets consistent
    let meta = document.querySelector('meta[name="color-scheme"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "color-scheme");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", theme === "dark" ? "dark light" : "light dark");

    safeSet("theme", userLocked ? theme : ""); // only store if user explicitly chose
  }, [theme, userLocked]);

  // Follow system changes *until* user manually toggles
  React.useEffect(() => {
    const onChange = (e) => {
      if (!userLocked) setTheme(e.matches ? "dark" : "light");
    };
    try {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    } catch {
      // older browsers (no-op)
      return () => {};
    }
  }, [userLocked]);

  const toggle = () => {
    setUserLocked(true);
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  return (
    <button
      className="btn secondary"
      onClick={toggle}
      title="Toggle theme"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}
