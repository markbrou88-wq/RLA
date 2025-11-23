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
import LivePage from "./pages/LivePage.jsx";       // interactive rink
import RosterPage from "./pages/RosterPage.jsx";   // who played

// Other sections
import StatsPage from "./pages/StatsPage.jsx";
import TeamPage from "./pages/TeamPage.jsx";
import PlayerPage from "./pages/PlayerPage.jsx";

import ThemeToggle from "./components/ThemeToggle";
import LanguageToggle from "./components/LanguageToggle";
import { I18nProvider, useI18n } from "./i18n.jsx";

import './styles.css?v=999999';

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
{/* -------------------- NEW HEADER -------------------- */}
<div
  style={{
    width: "100%",
    backgroundColor: "#000",          // Black header
    borderBottom: "6px solid #d00000", // Red stripe (match poster)
    borderTop: "6px solid #d00000",    // Top red stripe
    padding: "12px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "white",
  }}
>
  {/* LEFT SECTION – Logo + Title */}
  <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
    <img
      src="https://tmodvqenwgxojmjiyknr.supabase.co/storage/v1/object/public/team-logos/RLR.png"
      alt="Red Lite Logo"
      style={{
        height: "85px",   // Larger logo
        width: "auto",
        objectFit: "contain",
      }}
    />

    <div>
      <h1 style={{ margin: 0, fontSize: "26px", color: "white" }}>
        {t("Ligue RED LITE 3x3")}
      </h1>
      <p style={{ margin: "4px 0 0", color: "#ccc" }}>
        {t("Saison Automne 2025")}
      </p>
    </div>
  </div>

  {/* RIGHT SECTION – Language + Theme */}
  <div style={{ display: "flex", gap: 10 }}>
    <LanguageToggle />
    <ThemeToggle />
  </div>
</div>
{/* ------------------------------------------------------ */}

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
  <img 
    src="https://tmodvqenwgxojmjiyknr.supabase.co/storage/v1/object/public/team-logos/RLR.png"
    alt="Red Lite Logo"
    style={{
      height: "60px",
      width: "auto",
      objectFit: "contain",
    }}
  />

  <div>
    <h1 style={{ margin: 0 }}>{t("Ligue RED LITE 3x3")}</h1>
    <p style={{ margin: "4px 0 8px", color: "var(--muted)" }}>
      {t("Saison Automne 2025")}
    </p>
  </div>
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

          {/* READ-ONLY summary (this is the one you want when clicking Boxscore) */}
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
