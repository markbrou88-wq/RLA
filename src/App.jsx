// src/App.jsx
import React from "react";
import { Routes, Route, NavLink, useNavigate, useLocation, useParams } from "react-router-dom";
import { supabase } from "./supabaseClient.js";

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

import "./styles.css";

/**
 * --------- Season helpers ----------
 * URL shape: /s/:seasonSlug/<section>
 * We keep all old routes without "/s/:slug" working for backward compatibility.
 * Season switcher loads from `seasons` (id, name, slug, start_date).
 */

const SeasonContext = React.createContext({
  seasons: [],
  current: null, // { id, slug, name }
  setCurrentBySlug: (_slug) => {},
});

function useSeason() {
  return React.useContext(SeasonContext);
}

function SeasonProvider({ children }) {
  const nav = useNavigate();
  const loc = useLocation();
  const urlSlug = React.useMemo(() => {
    const m = loc.pathname.match(/^\/s\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }, [loc.pathname]);

  const [seasons, setSeasons] = React.useState([]);
  const [current, setCurrent] = React.useState(null);

  // load seasons once
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("seasons")
        .select("id, name, slug, start_date")
        .order("start_date", { ascending: false });
      if (!cancelled) {
        if (error) {
          console.error("load seasons", error);
          setSeasons([]);
          setCurrent(null);
          return;
        }
        setSeasons(data || []);
      }
    })();
    return () => (cancelled = true);
  }, []);

  // choose current season based on URL or localStorage or the newest
  React.useEffect(() => {
    if (!seasons.length) return;

    const stored = localStorage.getItem("rla:seasonSlug");
    const pickSlug = urlSlug || stored || seasons[0]?.slug;
    const pick = seasons.find((s) => s.slug === pickSlug) || seasons[0] || null;
    setCurrent(pick);
    if (pick) localStorage.setItem("rla:seasonSlug", pick.slug);
  }, [seasons, urlSlug]);

  function setCurrentBySlug(slug) {
    const next = seasons.find((s) => s.slug === slug);
    if (!next) return;
    setCurrent(next);
    localStorage.setItem("rla:seasonSlug", next.slug);

    // Rebuild the path with the same subpath but for the new season
    // - If already under /s/slug -> replace that slug
    // - If not, prefix current path
    const pathAfterSeason =
      loc.pathname.replace(/^\/s\/[^/]+/, "") || "/";
    nav(`/s/${encodeURIComponent(next.slug)}${pathAfterSeason}${loc.search}${loc.hash}`);
  }

  const value = React.useMemo(() => ({ seasons, current, setCurrentBySlug }), [seasons, current]);

  return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>;
}

/* ----------------------------- Auth bar (unchanged) ----------------------------- */
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
          <span style={{ color: "#0a7e07" }}>
            Signed in{user?.email ? ` as ${user.email}` : ""}
          </span>
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
function SeasonSwitcher() {
  const { seasons, current, setCurrentBySlug } = useSeason();
  if (!seasons.length) return null;

  return (
    <div className="season-switcher">
      <span className="season-label">Season:</span>
      <div className="season-pills">
        {seasons.map((s) => (
          <button
            key={s.slug}
            className={`pill ${current?.slug === s.slug ? "active" : ""}`}
            onClick={() => setCurrentBySlug(s.slug)}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function TopBar() {
  const { t } = useI18n();
  return (
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
  );
}

function MainNav() {
  const { current } = useSeason();
  const base = current ? `/s/${encodeURIComponent(current.slug)}` : "";
  return (
    <nav className="nav">
      <NavLink to={`${base || "/"}`} end>Standings</NavLink>
      <NavLink to={`${base}/games`}>Games</NavLink>
      <NavLink to={`${base}/stats`}>Stats</NavLink>
    </nav>
  );
}

/**
 * We host two route trees:
 *  A) Back-compat old paths (no /s/:slug) – still work
 *  B) Seasoned paths   (/s/:seasonSlug/...)
 */
function RoutesBackCompat() {
  return (
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
  );
}

function RoutesSeasoned() {
  return (
    <Routes>
      <Route path="/s/:seasonSlug" element={<StandingsPage />} />
      <Route path="/s/:seasonSlug/games" element={<GamesPage />} />
      <Route path="/s/:seasonSlug/games/:slug/boxscore" element={<SummaryPage />} />
      <Route path="/s/:seasonSlug/games/:slug/live" element={<LivePage />} />
      <Route path="/s/:seasonSlug/games/:slug/roster" element={<RosterPage />} />
      <Route path="/s/:seasonSlug/stats" element={<StatsPage />} />
      {/* Team / Player profiles stay global (IDs are unique), no need to seasonize URLs */}
      <Route path="/teams/:id" element={<TeamPage />} />
      <Route path="/players/:id" element={<PlayerPage />} />
    </Routes>
  );
}

function AppInner() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px" }}>
      <TopBar />
      <SeasonSwitcher />
      <AuthBar />
      <MainNav />
      <main style={{ padding: "16px 0" }}>
        {/* Seasoned routes first so they capture when /s/:slug is present */}
        <RoutesSeasoned />
        {/* Back-compat (no season in URL) */}
        <RoutesBackCompat />
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
      <SeasonProvider>
        <AppInner />
      </SeasonProvider>
    </I18nProvider>
  );
}

/*  Built on your original App.jsx layout (auth, nav, routes, toggles preserved).  :contentReference[oaicite:2]{index=2} */
