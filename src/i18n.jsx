import React from "react";

const translations = {
  en: {
    // Common
    Standings: "Standings",
    Games: "Games",
    Stats: "Stats",
    Team: "Team",
    Roster: "Roster",
    "All Games →": "All Games →",
    "Save Team": "Save Team",
    "RLA Hockey League": "RLA Hockey League",
    "Standings • Games • Live Boxscore": "Standings • Games • Live Boxscore",
    "Built with React + Supabase • Realtime edits for boxscores":
      "Built with React + Supabase • Realtime edits for boxscores",

    // Auth
    "Email": "Email",
    "Password": "Password",
    "Sign in": "Sign in",
    "Sign up": "Sign up",
    "Forgot password?": "Forgot password?",
    "Signed in as": "Signed in as",
    "Sign out": "Sign out",

    // Games
    "Date": "Date",
    "Matchup": "Matchup",
    "Score": "Score",
    "Status": "Status",
    "Final": "Final",
    "Scheduled": "Scheduled",
    "Open": "Open",
    "Reopen": "Reopen",
    "Delete": "Delete",
    "Boxscore": "Boxscore",
    "Goalies": "Goalies",

    // Stats
    "Goals": "Goals",
    "Assists": "Assists",
    "Points": "Points",
    "Games Played": "Games Played",
    "Save%": "Save%",
    "GAA": "GAA",
  },

  fr: {
    // Common
    Standings: "Classement",
    Games: "Matchs",
    Stats: "Statistiques",
    Team: "Équipe",
    Roster: "Alignement",
    "All Games →": "Tous les matchs →",
    "Save Team": "Enregistrer l’équipe",
    "RLA Hockey League": "Ligue de hockey RLA",
    "Standings • Games • Live Boxscore":
      "Classement • Matchs • Feuille de pointage en direct",
    "Built with React + Supabase • Realtime edits for boxscores":
      "Construit avec React + Supabase • Édition en direct des feuilles de match",

    // Auth
    "Email": "Courriel",
    "Password": "Mot de passe",
    "Sign in": "Connexion",
    "Sign up": "Créer un compte",
    "Forgot password?": "Mot de passe oublié?",
    "Signed in as": "Connecté comme",
    "Sign out": "Déconnexion",

    // Games
    "Date": "Date",
    "Matchup": "Affiche",
    "Score": "Pointage",
    "Status": "Statut",
    "Final": "Final",
    "Scheduled": "Prévu",
    "Open": "Ouvrir",
    "Reopen": "Rouvrir",
    "Delete": "Supprimer",
    "Boxscore": "Feuille de match",
    "Goalies": "Gardiens",

    // Stats
    "Goals": "Buts",
    "Assists": "Passes",
    "Points": "Points",
    "Games Played": "Parties jouées",
    "Save%": "Pourcentage d’arrêts",
    "GAA": "Moyenne de buts alloués",
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
