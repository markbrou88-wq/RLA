import React from "react";

const translations = {
  en: {
    Standings: "Standings",
    Games: "Games",
    Stats: "Stats",
    "RLA Hockey League": "RLA Hockey League",
    "Standings • Games • Live Boxscore": "Standings • Games • Live Boxscore",
    "All Games →": "All Games →",
    Team: "Team",
    Roster: "Roster",
    "Recent Games": "Recent Games",
    "Save Team": "Save Team",
  },
  fr: {
    Standings: "Classement",
    Games: "Matchs",
    Stats: "Statistiques",
    "RLA Hockey League": "Ligue de hockey RLA",
    "Standings • Games • Live Boxscore": "Classement • Matchs • Feuille de pointage en direct",
    "All Games →": "Tous les matchs →",
    Team: "Équipe",
    Roster: "Alignement",
    "Recent Games": "Matchs récents",
    "Save Team": "Enregistrer l’équipe",
  },
};

const I18nContext = React.createContext({
  lang: "en",
  t: (k) => k,
  setLang: () => {},
});

export function I18nProvider({ children }) {
  const getInitial = () => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved === "en" || saved === "fr") return saved;
    } catch {}
    return "en";
  };

  const [lang, setLang] = React.useState(getInitial);

  React.useEffect(() => {
    try {
      localStorage.setItem("lang", lang);
    } catch {}
  }, [lang]);

  const t = React.useCallback(
    (key) => translations[lang]?.[key] ?? translations.en[key] ?? key,
    [lang]
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return React.useContext(I18nContext);
}
