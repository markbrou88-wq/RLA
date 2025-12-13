// src/App.jsx
import React from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { supabase } from "./supabaseClient.js";

// LOGO
import redliteLogo from "../redlite-logo.png";

// PAGES
import StandingsPage from "./pages/StandingsPage.jsx";
import GamesPage from "./pages/GamesPage.jsx";
import SummaryPage from "./pages/SummaryPage.jsx";
import LivePage from "./pages/LivePage.jsx";
import RosterPage from "./pages/RosterPage.jsx";
import StatsPage from "./pages/StatsPage.jsx";
import TeamPage from "./pages/TeamPage.jsx";
import PlayerPage from "./pages/PlayerPage.jsx";

import ThemeToggle from "./components/ThemeToggle";
import LanguageToggle from "./components/LanguageToggle";
import { I18nProvider, useI18n } from "./i18n.jsx";

import "./styles.css?v=1000000";

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
    <div className="auth-bar">
      {user ? (
        <>
          <span className="auth-ok">
            Signed in{user?.email ? ` as ${user.email}` : ""}
          </span>
          <button onClick={signOut}>Sign out</button>
        </>
      ) : (
        <form onSubmit={signIn}>
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
      <span className="auth-status">{status}</span>
    </div>
  );
}

/* -------------------------------- APP SHELL ------------------------------- */
function AppInner() {
  const { t } = useI18n();

  return (
    <div className="app-shell">
      {/* ================= BLACK HEADER ================= */}
      <header className="site-header">
        <div className="site-header-inner">
          <div className="site-header-left">
            <img
              src={redliteLogo}
              alt="Red Lite Logo"
              className="site-header-logo"
            />
            <div className="site-header-text">
              <h1 className="site-header-title">
                {t("LIGUE RED LITE 3X3")}
              </h1>
              <p className="site-header-subtitle">
                {t("Ligue de développement")}
              </p>
            </div>
          </div>

          <div className="auth-bar-right">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ================= RED NAV BAR ================= */}
      <div className="red-nav-bar">
        <nav className="red-nav">
          <NavLink to="/" end>
            {t("Standings")}
          </NavLink>
          <NavLink to="/games">{t("Games")}</NavLink>
          <NavLink to="/stats">{t("Stats")}</NavLink>
        </nav>
      </div>

      {/* ================= MAIN CONTENT ================= */}
      <div className="app-content">
        <AuthBar />

        <main>
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

        <footer className="site-footer">
          Built with React + Supabase • Realtime edits for boxscores
        </footer>
      </div>
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
