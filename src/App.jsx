// src/App.jsx
import React from "react";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import { supabase } from "./supabaseClient.js";

import StandingsPage from "./pages/StandingsPage.jsx";
import GamesPage from "./pages/GamesPage.jsx";
import SummaryPage from "./pages/SummaryPage.jsx";
import LivePage from "./pages/LivePage.jsx";
import RosterPage from "./pages/RosterPage.jsx";
import StatsPage from "./pages/StatsPage.jsx";
import TeamPage from "./pages/TeamPage.jsx";
import PlayerPage from "./pages/PlayerPage.jsx";

import ThemeToggle from "./components/ThemeToggle.jsx";
import LanguageToggle from "./components/LanguageToggle.jsx";
import I18nProvider, { useI18n } from "./i18n.jsx";

import redliteLogo from "../redlite-logo.png";

import "./styles.css?v=999999";

/**
 * Small helper to build className strings.
 */
function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Auth bar: handles sign-in / sign-out with Supabase email + password.
 * Only sign-in and sign-out (no sign-up / forgot password).
 */
function AuthBar() {
  const { t } = useI18n();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [user, setUser] = React.useState(null);
  const [status, setStatus] = React.useState("");

  React.useEffect(() => {
    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      setUser(data?.user ?? null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return;
        setUser(session?.user ?? null);
      }
    );

    return () => {
      isMounted = false;
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  async function handleSignIn(e) {
    e.preventDefault();
    setStatus("");

    if (!email || !password) {
      setStatus(t("Please enter email and password"));
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus(error.message);
    } else {
      setStatus(t("Signed in!"));
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setStatus("");
  }

  if (user) {
    return (
      <div className="auth-bar">
        <span className="auth-status">
          {t("Signed in as")} <strong>{user.email}</strong>
        </span>
        <button type="button" className="btn" onClick={handleSignOut}>
          {t("Sign out")}
        </button>
      </div>
    );
  }

  return (
    <form className="auth-bar" onSubmit={handleSignIn}>
      <input
        type="email"
        className="auth-input"
        placeholder={t("Email")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        className="auth-input"
        placeholder={t("Password")}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit" className="btn">
        {t("Sign in")}
      </button>
      {status && (
        <span className="auth-status auth-status--error">{status}</span>
      )}
    </form>
  );
}

/**
 * Header styles injected here so we don't have to touch styles.css again.
 * Keeps the bar full-width and adjusts the height & font sizes on mobile.
 */
const headerStyles = `
.league-header {
  width: 100%;
  background: #000;
  color: #fff;
}

.league-header-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.league-header-left {
  display: flex;
  align-items: center;
  gap: 20px;
  min-width: 0;
}

.league-logo {
  flex-shrink: 0;
  height: 72px;
  width: auto;
}

.league-header-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.league-title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.league-subtitle {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.18em;
}

.league-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Mobile tweaks */
@media (max-width: 768px) {
  .league-header-inner {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 16px 16px;
  }

  .league-logo {
    height: 56px;
  }

  .league-title {
    font-size: 20px;
    line-height: 1.2;
  }

  .league-subtitle {
    font-size: 12px;
  }

  .league-header-right {
    align-self: stretch;
    justify-content: flex-start;
  }
}
`;

function AppInner() {
  const { t } = useI18n();
  const location = useLocation();

  return (
    <div className="app-shell">
      {/* Inject header-specific CSS */}
      <style>{headerStyles}</style>

      {/* Top black header with logo + league info + toggles */}
      <header className="league-header">
        <div className="league-header-inner">
          <div className="league-header-left">
            <img
              src={redliteLogo}
              alt="Red Lite Hockey Academy logo"
              className="league-logo"
            />
            <div className="league-header-text">
              <div className="league-title">LIGUE RED LITE 3X3</div>
              <div className="league-subtitle">
                LIGUE DE DÉVELOPPEMENT 3X3
              </div>
            </div>
          </div>
          <div className="league-header-right">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="app-main">
        <AuthBar />

        {/* Main navigation tabs */}
        <nav className="tabs">
          <NavLink
            to="/standings"
            className={({ isActive }) =>
              cx("tab", isActive || location.pathname === "/" ? "active" : "")
            }
          >
            {t("Standings")}
          </NavLink>
          <NavLink
            to="/games"
            className={({ isActive }) => cx("tab", isActive ? "active" : "")}
          >
            {t("Games")}
          </NavLink>
          <NavLink
            to="/stats"
            className={({ isActive }) => cx("tab", isActive ? "active" : "")}
          >
            {t("Stats")}
          </NavLink>
        </nav>

        {/* Main routes */}
        <Routes>
          <Route path="/" element={<StandingsPage />} />
          <Route path="/standings" element={<StandingsPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/games/:slug" element={<SummaryPage />} />
          <Route path="/games/:slug/live" element={<LivePage />} />
          <Route path="/games/:slug/roster" element={<RosterPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/teams/:id" element={<TeamPage />} />
          <Route path="/players/:id" element={<PlayerPage />} />
        </Routes>
      </main>
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
