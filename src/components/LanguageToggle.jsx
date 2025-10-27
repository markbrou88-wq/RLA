// src/components/LanguageToggle.jsx
import React from "react";
import { useI18n } from "../i18n.jsx";

export default function LanguageToggle() {
  const { lang, setLang } = useI18n();

  const toggleLang = () => setLang(lang === "en" ? "fr" : "en");

  return (
    <button onClick={toggleLang}>
      {lang === "en" ? "Français" : "English"}
    </button>
  );
}
