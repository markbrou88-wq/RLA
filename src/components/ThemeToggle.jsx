import React from "react";

const ICON_SUN = "☀️";
const ICON_MOON = "🌙";

export default function ThemeToggle({ className = "" }) {
  const [theme, setTheme] = React.useState(
    document.documentElement.getAttribute("data-theme") || "light"
  );

  const apply = (next) => {
    const html = document.documentElement;
    html.setAttribute("data-theme", next);
    html.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("theme", next); } catch {}
    let meta = document.querySelector('meta[name="color-scheme"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'color-scheme');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', next === 'dark' ? 'dark light' : 'light dark');
  };

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    apply(next);
  };

  return (
    <button
      onClick={toggle}
      className={`themetoggle ${className}`}
      aria-label="Toggle theme"
      title={theme === "dark" ? "Switch to Light" : "Switch to Dark"}
      type="button"
    >
      <span className="themetoggle__icon" aria-hidden>
        {theme === "dark" ? ICON_SUN : ICON_MOON}
      </span>
      <span className="themetoggle__label">
        {theme === "dark" ? "Light" : "Dark"}
      </span>
    </button>
  );
}
