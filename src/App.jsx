// src/App.jsx
import React from "react";
import { Routes, Route, NavLink, Link } from "react-router-dom";
import { supabase } from "./supabaseClient.js";

// PAGES (unchanged)
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

import "./styles.css";

/* ----------------------------- Auth bar ----------------------------- */
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

  async function signUp(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signUp({ email, password });
    setStatus(error ? error.message : "Account created! You can now sign in.");
  }
  async function signIn(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setStatus(error ? error.message : "Signed in!");
  }
  async function sendReset() {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setStatus(error ? error.message : "Password reset email sent.");
  }
  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="authbar">
      {user ? (
        <>
          <span className="authbar__status">
            Signed in{user?.email ? ` as ${user.email}` : ""}
          </span>
          <button className="btn" onClick={signOut}>Sign out</button>
        </>
      ) : (
        <form className="authbar__form">
          <input className="input" type="email" placeholder="Email"
                 value={email} onChange={(e)=>setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Password"
                 value={password} onChange={(e)=>setPassword(e.target.value)} required />
          <button className="btn" onClick={signIn}>Sign in</button>
          <button className="btn btn--subtle" type="button" onClick={signUp}>Sign up</button>
          <button className="btn btn--subtle" type="button" onClick={sendReset}>Forgot password?</button>
        </form>
      )}
      <span className="authbar__hint">{status}</span>
    </div>
  );
}

/* ------------------------------ Shell ------------------------------ */
function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <Link to="/" className="brand">
          {/* stylized text (keeps it light & local) */}
          <span className="brand__script">Red Lite</span>
        </Link>

        <nav className="topnav">
          <NavLink to="/" end className="topnav__link">Dashboard</NavLink>
          <NavLink to="/games" className="topnav__link">Games</NavLink>
          <NavLink to="/stats" className="topnav__link">Players</NavLink>
          <NavLink to="/" className="topnav__link">Teams</NavLink>
          <NavLink to="/" className="topnav__link">Settings</NavLink>
        </nav>

        <div className="topbar__actions">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function SubNav() {
  const { t } = useI18n();
  return (
    <nav className="subnav">
      <NavLink to="/" end className="subnav__link">{t("Standings")}</NavLink>
      <NavLink to="/games" className="subnav__link">{t("Games")}</NavLink>
      <NavLink to="/stats" className="subnav__link">{t("Stats")}</NavLink>
    </nav>
  );
}

function AppInner() {
  const { t } = useI18n();

  return (
    <div className="layout">
      <TopBar />
      <div className="layout__content">
        <div className="pagehead">
          <div>
            <h1 className="pagehead__title">{t("RLA Hockey League")}</h1>
            <p className="pagehead__sub">{t("Standings • Games • Live Boxscore")}</p>
          </div>
        </div>

        <SubNav />
        <AuthBar />

        <main className="main">
          <Routes>
            <Route path="/" element={<StandingsPage />} />
            <Route path="/games" element={<GamesPage />} />

            {/* READ-ONLY summary */}
            <Route path="/games/:slug/boxscore" element={<SummaryPage />} />

            {/* Editing pages */}
            <Route path="/games/:slug/live" element={<LivePage />} />
            <Route path="/games/:slug/roster" element={<RosterPage />} />

            {/* Other sections */}
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/teams/:id" element={<TeamPage />} />
            <Route path="/players/:id" element={<PlayerPage />} />
          </Routes>
        </main>

        <footer className="footer">
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
