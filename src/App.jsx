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

// Pages (make sure these files exist and default-export a React component)
import StandingsPage from "./pages/StandingsPage.jsx";
import GamesPage from "./pages/GamesPage.jsx";
import StatsPage from "./pages/StatsPage.jsx";
import GameDetailPage from "./pages/GameDetailPage.jsx"; // "Open" editor
import BoxscorePage from "./pages/BoxscorePage.jsx";

/* ---------------- Error Boundary ---------------- */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    // You can also send to logging service here if you want
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="container">
          <div className="card" style={{ borderLeft: "4px solid #d33" }}>
            <h2 className="m0" style={{ marginBottom: 8 }}>Something went wrong.</h2>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {String(this.state.error ?? "")}
            </pre>
            {this.state.info?.componentStack && (
              <details>
                <summary>Stack</summary>
                <pre>{this.state.info.componentStack}</pre>
              </details>
            )}
            <div style={{ marginTop: 12 }}>
              <Link className="btn" to="/games">Go to Games</Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------- Placeholder for /teams/:id ---------------- */
function TeamPlaceholder() {
  const { id } = useParams();
  return (
    <div className="container">
      <div className="card">
        <h2 className="m0">Team #{id}</h2>
        <p className="kicker">Team page coming soon.</p>
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
  const linkClass = ({ isActive }) => `nav-link ${isActive ? "active" : ""}`;
  return (
    <nav className="nav container">
      <NavLink to="/standings" className={linkClass}>Standings</NavLink>
      <NavLink to="/games" className={linkClass}>Games</NavLink>
      <NavLink to="/stats" className={linkClass}>Stats</NavLink>
      <div className="flex-spacer" />
    </nav>
  );
}

/* ---------------- App ---------------- */
export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <TopNav />
      <ErrorBoundary>
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

          {/* Old routes → Open editor */}
          <Route path="/games/:slug/roster" element={<Navigate to="../" replace />} />
          <Route path="/games/:slug/goalies" element={<Navigate to="../" replace />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/games" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
