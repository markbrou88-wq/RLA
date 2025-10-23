// src/App.jsx
import React from "react";
import { supabase } from "./supabaseClient.js";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import StandingsPage from "./pages/StandingsPage.jsx";
import GamesPage from "./pages/GamesPage.jsx";
import GameDetailPage from "./pages/GameDetailPage.jsx";

function AuthBar() {
  const [email, setEmail] = React.useState("");
  const [user, setUser] = React.useState(null);
  const [status, setStatus] = React.useState("");

  React.useEffect(() => {
    // Get user on load
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
    // Listen for sign-in / sign-out changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (e) => {
    e.preventDefault();
    setStatus("Sending magic link…");
    const { error } = await supabase.auth.signInWithOtp({ email });
    setStatus(error ? error.message : "Check your email for the magic link.");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0" }}>
      {user ? (
        <>
          <span style={{ color: "#0a7e07" }}>Signed in</span>
          <button onClick={signOut}>Sign out</button>
        </>
      ) : (
        <form onSubmit={signIn} style={{ display: "flex", gap: 8 }}>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit">Send magic link</button>
        </form>
      )}
      <span style={{ color: "#666" }}>{status}</span>
    </div>
  );
}

function Nav() {
  return (
    <nav
      style={{
        display: "flex",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid #eee",
        marginBottom: 8,
      }}
    >
      <NavLink to="/" end>
        Standings
      </NavLink>
      <NavLink to="/games">Games</NavLink>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div
        style={{
          fontFamily: "Inter, system-ui, Arial",
          maxWidth: 1100,
          margin: "0 auto",
          padding: "16px",
        }}
      >
        <h1 style={{ margin: 0 }}>RLA Hockey League</h1>
        <p style={{ margin: "4px 0 8px", color: "#666" }}>
          Standings • Games • Live Boxscore
        </p>

        <AuthBar />
        <Nav />

        <main style={{ padding: "16px 0" }}>
          <Routes>
            <Route path="/" element={<StandingsPage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/games/:slug" element={<GameDetailPage />} />
          </Routes>
        </main>

        <footer style={{ padding: "16px 0", color: "#777", fontSize: 12 }}>
          Built with React + Supabase • Live stats updates for games
        </footer>
      </div>
    </BrowserRouter>
  );
}
