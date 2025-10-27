import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  Link,
  useParams,
} from "react-router-dom";

import "./styles.css";
import ThemeToggle from "./components/ThemeToggle";

// Pages you already have
import StandingsPage from "./pages/StandingsPage.jsx";
import GamesPage from "./pages/GamesPage.jsx";
import StatsPage from "./pages/StatsPage.jsx";
import GameDetailPage from "./pages/GameDetailPage.jsx"; // "Open" editor
import BoxscorePage from "./pages/BoxscorePage.jsx";

/* ---------------- Helper/Placeholder ---------------- */

// Simple placeholder so /teams/:id links work even
// if you haven't added a real Team page yet.
function TeamPlaceholder() {
  const { id } = useParams();
  return (
    <div className="container">
      <div className="card">
        <h2 className="m0">Team #{id}</h2>
        <p className="kicker">Team page coming soon.</p>
        <p>
          (This is a placeholder so links don’t 404. We can replace it with the
          full Team page later.)
        </p>
        <Link to="/games">← Back to Games</Link>
      </div>
    </div>
  );
}

/* ---------------- Layout ---------------- */

function Header() {
  return (
    <header className="container row" style={{ justifyContent: "space-between" }}>
      <h1 className="m0">RLA Hockey League</h1>
      <ThemeToggle />
    </header>
  );
}

function TopNav() {
  const linkClass = ({ isActive }) =>
    `nav-link ${isActive ? "active" : ""}`;

  return (
    <nav className="nav container">
      <NavLink to="/standings" className={linkClass}>
        Standings
      </NavLink>
      <NavLink to="/games" className={linkClass}>
        Games
      </NavLink>
      <NavLink to="/stats" className={linkClass}>
        Stats
      </NavLink>
      <div className="flex-spacer" />
      {/* add auth controls here if you want */}
    </nav>
  );
}

/* ---------------- App ---------------- */

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <TopNav />

      <Routes>
        {/* Home → Games */}
        <Route path="/" element={<Navigate to="/games" replace />} />

        {/* Main pages */}
        <Route path="/standings" element={<StandingsPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/games/:slug" element={<GameDetailPage />} /> {/* Open editor */}
        <Route path="/games/:slug/boxscore" element={<BoxscorePage />} />
        <Route path="/stats" element={<StatsPage />} />

        {/* Team placeholder so /teams/:id links don’t 404 */}
        <Route path="/teams/:id" element={<TeamPlaceholder />} />

        {/* Old pages → redirect to Open editor */}
        <Route path="/games/:slug/roster" element={<Navigate to="../" replace />} />
        <Route path="/games/:slug/goalies" element={<Navigate to="../" replace />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/games" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
