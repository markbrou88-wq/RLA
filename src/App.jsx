import React from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { supabase } from "./supabaseClient.js";

// IMPORT LOGO PROPERLY
import redliteLogo from "./redlite-logo.png";

// PAGES
import StandingsPage from "./pages/StandingsPage.jsx";
import GamesPage from "./pages/GamesPage.jsx";

// READ-ONLY BOX SCORE
import SummaryPage from "./pages/SummaryPage.jsx";

// INTERACTIVE EDITING
import LivePage from "./pages/LivePage.jsx";
import RosterPage from "./pages/RosterPage.jsx";

// Other pages
import StatsPage from "./pages/StatsPage.jsx";
import TeamPage from "./pages/TeamPage.jsx";
import PlayerPage from "./pages/PlayerPage.jsx";

import ThemeToggle from "./components/ThemeToggle";
import LanguageToggle from "./components/LanguageToggle";
import { I18nProvider, useI18n } from "./i18n.jsx";

import "./styles.css?v=999999";

/* -------------------------------- AUTH BAR ------------------------------- */
function AuthBar() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [user, setUser] = React.useState(null);
  const [status, setStatus] = React.useState("");

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setStatus(error ? error.message : "Signed in!");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        padding: "8px 0",
      }}
    >
      {user ? (
        <>
          <span style={{ color: "#0a7e07" }}>
            Signed in{user?.email ? ` as ${user.email}` : ""}
          </span>
          <button onClick={signOut}>Sign out</button>
        </>
      ) : (
        <form
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          onSubmit={signIn}
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">Sign in</button>
        </form>
      )}
      <span style={{ color: "#666" }}>{status}</span>
    </div>
  );
}

/* -------------------------------- APP SHELL ------------------------------- */
function AppInner() {
  const { t } = useI18n();

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px 16px" }}>
      
      {/* ---------------------- FULL-WIDTH BLACK HEADER ---------------------- */}
      <header
        style={{
          width: "100%",
          background: "#000",
          color: "#fff",
          padding: "14px 20px",
          margin: "0 -16px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        {/* LEFT – LOGO + TEXT */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <img
            src={redliteLogo}
            alt="Red Lite Logo"
            style={{
              height: "90px",
              width: "auto",
              objectFit: "contain",
            }}
          />

          <div style={{ lineHeight: 1.2 }}>
            <h1
              style={{
                margin: 0,
                fontSize: "1.8rem",
                textTransform: "uppercase",
                fontWeight: 800,
                letterSpacing: "0.1em",
                color: "white",
              }}
            >
              {t("LIGUE RED LITE 3X3")}
            </h1>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: "1rem",
                textTransform: "uppercase",
                fontWeight: 600,
                color: "white",
                letterSpacing: "0.06em",
              }}
            >
              {t("Ligue de développement 3x3")}
            </p>
          </div>
        </div>

        {/* RIGHT – Language + Theme */}
        <div style={{ display: "flex", gap: 8 }}>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {/* Auth */}
      <AuthBar />

      {/* NAV MENU */}
      <nav className="nav">
        <NavLink to="/" end>
          {t("Standings")}
        </NavLink>
        <NavLink to="/games">{t("Games")}</NavLink>
        <NavLink to="/stats">{t("Stats")}</NavLink>
      </nav>

      {/* ROUTES */}
      <main style={{ padding: "16px 0" }}>
        <Routes>
          <Route path="/" element={<StandingsPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/games/:slug/boxscore" element={<SummaryPage />} />
          <Route path="/games/:slug/live" element={<LivePage />} />
          <Route path="/games/:slug/roster" element={<RosterPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/teams/:id" element={<TeamPage />} />
          <Route path="/players/:id" element={<PlayerPage />} />
        </Routes>
      </main>

      <footer
        style={{
          padding: "16px 0",
          color: "var(--muted)",
          fontSize: 12,
        }}
      >
        Built with React + Supabase • Realtime edits for boxscores
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppInner />
    </I18nProvider>
  );
}
