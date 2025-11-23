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

  async function signIn(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
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
          {/* hidden reset trigger – you can expose this later if you want */}
          <button
            type="button"
            style={{ display: "none" }}
            onClick={sendReset}
          >
            Forgot password?
          </button>
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
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "0 16px 16px",
      }}
    >
      {/* FULL-WIDTH BLACK HEADER BAR */}
      <header
        style={{
          backgroundColor: "#000",
          color: "#fff",
          margin: "0 -16px 16px", // stretch over the side padding
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
        }}
      >
        {/* Left side: big logo + league text */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <img
            src="/mnt/data/e8de9f08-3006-4aba-9c74-8824fcf3354f.png"
            alt="Red Lite Logo"
            style={{
              height: "90px",
              width: "auto",
              objectFit: "contain",
            }}
          />

          <div
            style={{
              lineHeight: 1.1,
              fontFamily:
                '"Montserrat", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: "1.8rem",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontWeight: 800,
                color: "#ffffff",
              }}
            >
              {t("LIGUE RED LITE 3X3")}
            </h1>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: "0.95rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#ffffff",
              }}
            >
              {t("Ligue de développement 3x3")}
            </p>
            {/* removed: Saison Automne 2025 line */}
          </div>
        </div>

        {/* Right side: language + theme toggles */}
        <div style={{ display: "flex", gap: 8 }}>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {/* Auth bar under header (unchanged behaviour) */}
      <AuthBar />

      {/* Main nav */}
      <nav className="nav">
        <NavLink to="/" end>
          {t("Standings")}
        </NavLink>
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
:contentReference[oaicite:0]{index=0}
