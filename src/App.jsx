// src/App.jsx
import React from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { supabase } from "./supabaseClient.js";

// PAGES
import StandingsPage from "./pages/StandingsPage.jsx";
import GamesPage from "./pages/GamesPage.jsx";

// READ-ONLY BOX SCORE (summary you wanted)
import SummaryPage from "./pages/SummaryPage.jsx";

// INTERACTIVE EDITING
import LivePage from "./pages/LivePage.jsx"; // interactive rink
import RosterPage from "./pages/RosterPage.jsx"; // who played

// Other sections
import StatsPage from "./pages/StatsPage.jsx";
import TeamPage from "./pages/TeamPage.jsx";
import PlayerPage from "./pages/PlayerPage.jsx";

import ThemeToggle from "./components/ThemeToggle";
import LanguageToggle from "./components/LanguageToggle";
import { I18nProvider, useI18n } from "./i18n.jsx";

import "./styles.css?v=999999";
import redliteLogo from "../redlite-logo.png";

/* ------------------------- Auth bar (top right) ------------------------- */

function AuthBar() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [user, setUser] = React.useState(null);
  const [status, setStatus] = React.useState("");

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setStatus("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      console.error(error);
      setStatus(error.message);
    } else {
      setStatus("");
      setEmail("");
      setPassword("");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setStatus("");
  };

  return (
    <div className="auth-bar">
      {user ? (
        <>
          <span className="auth-signed-in">
            Signed in as <strong>{user.email}</strong>
          </span>
          <button className="btn ghost" onClick={handleSignOut}>
            Sign out
          </button>
        </>
      ) : (
        <form className="auth-form" onSubmit={handleSignIn}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
          <button className="btn" type="submit">
            Sign in
          </button>
        </form>
      )}
      {status && <div className="auth-status">{status}</div>}
    </div>
  );
}

/* ---------------------------- Layout & Nav ---------------------------- */

function AppShell({ children }) {
  const { t } = useI18n();

  return (
    <div className="app-shell">
      {/* HEADER */}
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-header-left">
            <img
              src={redliteLogo}
              alt="Red Lite logo"
              className="header-logo"
            />
            <div className="app-header-text">
              <h1 className="league-title">LIGUE RED LITE 3x3</h1>
              <p className="league-subtitle">Ligue de développement 3 x 3</p>
            </div>
          </div>

          <div className="app-header-right">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* NAV + AUTH */}
      <div className="app-nav-row">
        <nav className="main-nav">
          <NavLink
            to="/standings"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            {t("Standings")}
          </NavLink>
          <NavLink
            to="/games"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            {t("Games")}
          </NavLink>
          <NavLink
            to="/stats"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            {t("Stats")}
          </NavLink>
        </nav>

        <AuthBar />
      </div>

      {/* CONTENT */}
      <main className="app-main">{children}</main>

      <footer className="app-footer">
        Built with React + Supabase • Realtime edits for boxscores
      </footer>
    </div>
  );
}

/* ------------------------------- Routing ------------------------------- */

function AppInner() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<StandingsPage />} />
        <Route path="/standings" element={<StandingsPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/games/:slug/summary" element={<SummaryPage />} />
        <Route path="/games/:slug/live" element={<LivePage />} />
        <Route path="/games/:slug/roster" element={<RosterPage />} />
        <Route path="/teams/:teamId" element={<TeamPage />} />
        <Route path="/players/:playerId" element={<PlayerPage />} />
        <Route path="/stats" element={<StatsPage />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppInner />
    </I18nProvider>
  );
}
