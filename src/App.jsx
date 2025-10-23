// src/App.jsx
import React from "react";
import { supabase } from "./supabaseClient.js";
import { Routes, Route, NavLink } from "react-router-dom";
import StandingsPage from "./pages/StandingsPage.jsx";
import GamesPage from "./pages/GamesPage.jsx";
import GameDetailPage from "./pages/GameDetailPage.jsx";

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

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function sendReset() {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin, // sends them back to your site
    });
    setStatus(error ? error.message : "Password reset email sent.");
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "8px 0" }}>
      {user ? (
        <>
          <span style={{ color: "#0a7e07" }}>Signed in{user.email ? ` as ${user.email}` : ""}</span>
          <button onClick={signOut}>Sign out</button>
        </>
      ) : (
        <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button onClick={signIn}>Sign in</button>
          <button type="button" onClick={signUp}>Sign up</button>
          <button type="button" onClick={sendReset}>Forgot password?</button>
        </form>
      )}
      <span style={{ color: "#666" }}>{status}</span>
    </div>
  );
}

function Nav() {
  return (
    <nav style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid #eee", marginBottom: 8 }}>
      <NavLink to="/" end>Standings</NavLink>
      <NavLink to="/games">Games</NavLink>
    </nav>
  );
}

export default function App() {
  return (
    <div style={{ fontFamily: "Inter, system-ui, Arial", maxWidth: 1100, margin: "0 auto", padding: "16px" }}>
      <h1 style={{ margin: 0 }}>RLA Hockey League</h1>
      <p style={{ margin: "4px 0 8px", color: "#666" }}>Standings • Games • Live Boxscore</p>

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
        Built with React + Supabase • Realtime edits for boxscores
      </footer>
    </div>
  );
}
