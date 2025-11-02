// src/App.jsx
import React from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { supabase } from "./supabaseClient.js";

// PAGES
import StandingsPage from "./pages/StandingsPage.jsx";
import GamesPage from "./pages/GamesPage.jsx";
// NOTE: Retire the old editable boxscore page on /games/:slug
// import GameDetailPage from "./pages/GameDetailPage.jsx";
import BoxscorePage from "./pages/BoxscorePage.jsx";     // read-only, used everywhere
import LivePage from "./pages/LivePage.jsx";             // interactive rink (editing)
import RosterPage from "./pages/RosterPage.jsx";         // toggle who played
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "8px 0" }}>
      {user ? (
        <>
          <span style={{ color: "#0a7e07" }}>Signed in{user?.email ? ` as ${user.email}` : ""}</span>
          <button onClick={signOut}>Sign out</button>
        </>
      ) : (
        <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="email" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
          <button onClick={signIn}>Sign in</button>
          <button type="button" onClick={signUp}>Sign up</button>
          <button type="button" onClick={sendReset}>Forgot password?</button>
        </form>
      )}
      <span style={{ color: "#666" }}>{status}</span>
    </div>
  );
}

/* ------------------------------ Shell ------------------------------ */
function AppInner() {
  const { t } = useI18n();

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>{t("RLA Hockey League")}</h1>
          <p style={{ margin: "4px 0 8px", color: "var(--muted)" }}>
            {t("Standings • Games • Live Boxscore")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>

      <AuthBar />

      <nav className="nav">
        <NavLink to="/" end>{t("Standings")}</NavLink>
        <NavLink to="/games">{t("Games")}</NavLink>
        <NavLink to="/stats">{t("Stats")}</NavLink>
      </nav>

      <main style={{ padding: "16px 0" }}>
        <Routes>
          <Route path="/" element={<StandingsPage />} />
          <Route path="/games" element={<GamesPage />} />

          {/* IMPORTANT: /games/:slug now points to the READ-ONLY boxscore */}
          <Route path="/games/:slug" element={<BoxscorePage />} />
          <Route path="/games/:slug/boxscore" element={<BoxscorePage />} />
       


          {/* Editing pages */}
          <Route path="/games/:slug/live" element={<LivePage />} />
          <Route path="/games/:slug/roster" element={<RosterPage />} />

          {/* Other sections */}
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/teams/:id" element={<TeamPage />} />
          <Route path="/players/:id" element={<PlayerPage />} />
        </Routes>
      </main>

      <footer style={{ padding: "16px 0", color: "var(--muted)", fontSize: 12 }}>
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
