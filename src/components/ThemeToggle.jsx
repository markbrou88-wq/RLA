import React from "react";

export default function ThemeToggle() {
  const getInitial = () => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") return saved;
    // default to OS preference
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const [theme, setTheme] = React.useState(getInitial);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <button
      className="btn secondary"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title="Toggle theme"
    >
      {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}
