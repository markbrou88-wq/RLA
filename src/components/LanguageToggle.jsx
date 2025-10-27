import React from "react";
import { useI18n } from "../i18n.jsx";

export default function LanguageToggle() {
  const { lang, setLang } = useI18n();
  const next = lang === "en" ? "fr" : "en";
  return (
    <button className="btn secondary" onClick={() => setLang(next)} title="Language">
      {lang === "en" ? "Français" : "English"}
    </button>
  );
}
