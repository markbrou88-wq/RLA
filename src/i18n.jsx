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
    Playoffs: "Playoffs",
    W: "W",
L: "L",
OTL: "OTL",
SOL: "SOL",
GF: "GF",
GA: "GA",
DIFF: "DIFF",
PTS: "PTS",
"No standings available": "No standings available",
"Points system": "Points system",
"Win (regulation)": "Win (regulation)",
"Win (OT/SO)": "Win (OT/SO)",
"Loss (OT/SO)": "Loss (OT/SO)",
"Loss (regulation)": "Loss (regulation)",
 Player: "PLayer",   
Goalie: "Goalie",   
    "SA": "SA", 
"W-L-OTL-SOL": "W-L-OTL-SOL",    
    
"Back to Stats": "Back to Stats",
"Player not found.": "Player not found.",
"Career Totals": "Career Totals",
"Stats by season & category": "Stats by season & category",
"Game log (Skater)": "Game log (Skater)",
"Game log (Goalie)": "Game log (Goalie)",
"Season": "Season",
"Category": "Category",
"Opponent": "Opponent",
"Decision": "Decision",
"View": "View",
"No goalie games yet.": "No goalie games yet.",

// SummaryPage – missing
"Back to Games": "Back to Games",
"Goals / Events": "Goals / Events",
"No events yet.": "No events yet.",
"PER": "PER",
"TIME": "TIME",
"TEAM": "TEAM",
"TYPE": "TYPE",
"PLAYER / ASSISTS": "PLAYER / ASSISTS",
"Period": "Period",
"Show shots": "Show shots",
"Hide shots": "Hide shots",
"GOAL": "GOAL",
"Shootout": "Shootout",
"Winner": "Winner",
"Live": "Live",
"No lineup recorded.": "No lineup recorded.",
"Unknown": "Unknown",
"MISS": "MISS",

    // GamesPage
"at": "at",
"Live": "Live",
"Mark as Final": "Mark as Final",

"Team…": "Team…",
"Clear": "Clear",

"Home team…": "Home team…",
"Away team…": "Away team…",

"Create": "Create",
"Creating…": "Creating…",

"Upcoming": "Upcoming",
"Past": "Past",
"Next games": "Next games",

"No games match your filters.": "No games match your filters.",

"Delete this game?": "Delete this game?",
"Please fill date, home and away.": "Please fill date, home and away.",
"Home and away cannot be the same team.": "Home and away cannot be the same team.",

"Final": "Final",
"OT": "OT",
"SO": "SO",

    
    
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
    Playoffs: "Séries",
    W: "V",
L: "D",
OTL: "DP",
SOL: "DB",
GF: "BP",
GA: "BA",
DIFF: "Diff.",
PTS: "Pts",
"No standings available": "Aucun classement disponible",
"Points system": "Système de points",
"Win (regulation)": "Victoire (temps réglementaire)",
"Win (OT/SO)": "Victoire (prolongation / tirs)",
"Loss (OT/SO)": "Défaite (prolongation / tirs)",
"Loss (regulation)": "Défaite (temps réglementaire)",    
   Player: "Joueur", 
Goalie: "Gardien",
  "W-L-OTL-SOL": "V-D-DP-DB",     
   
  "Back to Standings": "Retour au classement",
  "Team": "Équipe",
  "Attack": "Attaque",
  "Defense": "Défense",
  "Trend (10)": "Tendance (10)",
  "GF per game": "BP / match",
  "GA per game": "BA / match",
  "Goals For vs Goals Against (Last 10)": "Buts marqués vs buts accordés (10 derniers)",
  "For": "Marqués",
  "Against": "Accordés",
  "Roster & Player Stats": "Alignement & statistiques",
  "Add Player": "Ajouter un joueur",
  "Actions": "Actions",
  "Select a Season and Category to view this team's roster.": "Sélectionnez une saison et une catégorie pour voir l’alignement.",
  "No players found.": "Aucun joueur trouvé.",
  "No final games yet": "Aucun match final pour le moment",
    
"Back to Stats": "Retour aux statistiques",
"Player not found.": "Joueur introuvable.",
"Career Totals": "Totaux en carrière",
"Stats by season & category": "Statistiques par saison et catégorie",
"Game log (Skater)": "Journal des matchs (joueur)",
"Game log (Goalie)": "Journal des matchs (gardien)",
"Season": "Saison",
"Category": "Catégorie",
"Opponent": "Adversaire",
"Decision": "Décision",
"View": "Voir",
"No goalie games yet.": "Aucun match disputé comme gardien.",

// SummaryPage – missing
"Back to Games": "Retour aux matchs",
"Goals / Events": "Buts / Événements",
"No events yet.": "Aucun événement pour le moment.",
"PER": "PÉR",
"TIME": "TEMPS",
"TEAM": "ÉQUIPE",
"TYPE": "TYPE",
"PLAYER / ASSISTS": "JOUEUR / PASSES",
"Period": "Période",
"Show shots": "Afficher les tirs",
"Hide shots": "Masquer les tirs",
"GOAL": "BUT",
"Shootout": "Tirs de barrage",
"Winner": "Gagnant",
"Live": "Direct",
"No lineup recorded.": "Aucun alignement enregistré.",
"Unknown": "Inconnu",
"MISS": "RATÉ",

// GamesPage
"at": "à",
"Live": "Live",
"Mark as Final": "Marquer comme final",

"Team…": "Équipe…",
"Clear": "Effacer",

"Home team…": "Équipe locale…",
"Away team…": "Équipe visiteuse…",

"Create": "Créer",
"Creating…": "Création…",

"Upcoming": "À venir",
"Past": "Passés",
"Next games": "Prochains matchs",

"No games match your filters.": "Aucun match ne correspond aux filtres.",

"Delete this game?": "Supprimer ce match ?",
"Please fill date, home and away.": "Veuillez remplir la date, l’équipe locale et visiteuse.",
"Home and away cannot be the same team.": "L’équipe locale et visiteuse ne peuvent pas être identiques.",

"Final": "Final",
"OT": "P",
"SO": "Bl",

    
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
    "GAA": "MBA",

    // Navigation / headers
  "Season": "Saison",
  "Category": "Catégorie",
  "Back to Games": "Retour aux matchs",
  "Back to Stats": "Retour aux statistiques",

  // Player / stats pages
  "Career Totals": "Totaux en carrière",
  "Stats by season & category": "Statistiques par saison et catégorie",
  "Game log (Skater)": "Journal des matchs (Joueur)",
  "Game log (Goalie)": "Journal des matchs (Gardien)",

  // Tables
  "GP": "PJ",
  "SA": "TA",  
  "W-L-OTL": "V-D-DP",
  "SV%": "ARR%",
  "TOI": "Temps de jeu",
  "Decision": "Décision",
  "Opponent": "Adversaire",
  "No events yet.": "Aucun événement pour le moment.",

  // Status
  "Loading…": "Chargement…",
  "Game not found.": "Match introuvable.",
    
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
    return "fr";
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
