// src/components/LanguageToggle.jsx
import React from "react";
import { useI18n } from "../i18n.jsx";

export default function LanguageToggle() {
  const { lang, setLang } = useI18n();

  const toggleLang = () => setLang(lang === "en" ? "fr" : "en");

  return (
    <button
      className="btn secondary small"
      onClick={toggleLang}
      title="Toggle language"
    >
      {lang === "en" ? "FR" : "EN"}
    </button>
  );
}

