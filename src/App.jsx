import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useParams } from "react-router-dom";

import "./styles.css";
import ThemeToggle from "./components/ThemeToggle";

// Pages (make sure these files exist)
import StandingsPage from "./pages/StandingsPage.jsx";
import GamesPage from "./pages/GamesPage.jsx";
import StatsPage from "./pages/StatsPage.jsx";
import GameDetailPage from "./pages/GameDetailPage.jsx"; // "Open" editor
import BoxscorePage from "./pages/BoxscorePage.jsx";

// ---------- Small helpers ----------
function NavLink({ to, children }) {
  const loc = useLocation();
  const isActive =
    (to === "/"
      ? loc.pathname === "/"
      : loc.pathname === to || loc.pathname.startsWith(to + "/"));
  return (
    <Link className={`nav-link ${isActive ? "active" : ""}`} to={to}>
      {children}
    </Link>
  );
}

// Placeholder so /teams/:id links don’t 404 if you haven’t built a Team page yet.
function TeamPlaceholder() {
  const { id } = useParams();
  return (
    <div className="container">
      <div className="card">
        <h2 className="m0">Team #{id}</h2>
        <p className="kicker">Team page coming soon.</p>
        <p>
          (The link exists so clicks from the Games list don’t 404. We can wire a full
          team roster/editor here when you’re ready.)
        </p>
        <Link to="/games">← Back to Games</Link>
      </div>
    </div>
  );
}

// Top header (title + theme toggle)
function Header() {
  return (
    <header className="container row" style={{ justifyContent: "space-between" }}>
      <h1 className="m0">RLA Hockey League</h1>
      <ThemeToggle />
    </header>
  );
}

// Site nav (uses NavLink for active states)
function TopNav() {
  return (
    <nav className="nav container">
      <NavLink to="/standings">Standings</NavLink>
      <NavLink to="/games">Games</NavLink>
      <NavLink to="/stats">Stats</NavLink>
      <div className="flex-spacer" />
      {/* You can add auth status or buttons at right if needed */}
    </nav>
  );
}

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
        <Route path="/games/:slug" element={<GameDetailPage />} />            {/* Open editor */}
        <Route path="/games/:slug/boxscore" element={<BoxscorePage />} />
        <Route path="/stats" element={<StatsPage />} />

        {/* Team placeholder so Games links don't 404 */}
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
