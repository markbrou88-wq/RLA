import React from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { supabase } from "./supabaseClient";

// CONTEXTS
import { SeasonProvider, useSeason } from "./contexts/SeasonContext";
import { CategoryProvider, useCategory } from "./contexts/CategoryContext";
import { I18nProvider, useI18n } from "./i18n";

// PAGES
import StandingsPage from "./pages/StandingsPage";
import GamesPage from "./pages/GamesPage";
import StatsPage from "./pages/StatsPage";
import SummaryPage from "./pages/SummaryPage";
import LivePage from "./pages/LivePage";
import RosterPage from "./pages/RosterPage";
import TeamPage from "./pages/TeamPage";
import PlayerPage from "./pages/PlayerPage";

// UI
import ThemeToggle from "./components/ThemeToggle";
import LanguageToggle from "./components/LanguageToggle";

// ASSETS
import redliteLogo from "../redlite-logo.png";

// IMPORTANT: use ORIGINAL styles
import "./styles.css";

/* ===================== AUTH BAR ===================== */
function AuthBar() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(e) {
    e.preventDefault();
    await supabase.auth.signInWithPassword({ email, password });
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="auth-bar">
      {user ? (
        <>
          <span>Signed in as {user.email}</span>
          <button onClick={signOut}>Sign out</button>
        </>
      ) : (
        <form onSubmit={signIn}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit">Sign in</button>
        </form>
      )}
    </div>
  );
}

/* ===================== RED NAV ===================== */
function RedNav() {
  const { t } = useI18n();
  const { seasons, seasonId, setSeasonId } = useSeason();
  const { categories, categoryId, setCategoryId } = useCategory();

  return (
    <div className="red-nav-bar">
      <nav className="red-nav">
        <NavLink to="/" end>
          {t("Standings")}
        </NavLink>
        <NavLink to="/games">{t("Games")}</NavLink>
        <NavLink to="/stats">{t("Stats")}</NavLink>
      </nav>

      <div className="red-nav-right">
        <label>
          {t("Season")}
          <select
            value={seasonId ?? ""}
            onChange={(e) => setSeasonId(Number(e.target.value))}
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t("Category")}
          <select
            value={categoryId ?? ""}
            onChange={(e) => setCategoryId(Number(e.target.value))}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

/* ===================== APP ===================== */
function AppInner() {
  const { t } = useI18n();

  return (
    <>
      {/* BLACK HEADER */}
      <header className="site-header">
        <img src={redliteLogo} alt="Red Lite" />
        <div className="site-header-text">
          <h1>{t("LIGUE RED LITE 3X3")}</h1>
          <p>{t("Ligue de développement")}</p>
        </div>
        <div className="site-header-actions">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {/* RED NAV */}
      <RedNav />

      {/* MAIN */}
      <main>
        <AuthBar />

        <Routes>
          <Route path="/" element={<StandingsPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/stats" element={<StatsPage />} />

          <Route path="/summary/:slug" element={<SummaryPage />} />
          <Route path="/live/:slug" element={<LivePage />} />
          <Route path="/roster/:slug" element={<RosterPage />} />
          <Route path="/teams/:id" element={<TeamPage />} />
          <Route path="/players/:id" element={<PlayerPage />} />
        </Routes>

        <footer className="site-footer">
          Built with React + Supabase • Realtime edits for boxscores
        </footer>
      </main>
    </>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <SeasonProvider>
        <CategoryProvider>
          <AppInner />
        </CategoryProvider>
      </SeasonProvider>
    </I18nProvider>
  );
}
