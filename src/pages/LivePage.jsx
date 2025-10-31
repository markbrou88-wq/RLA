// src/pages/LivePage.jsx
import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getGameBySlug } from "../lib/db.js";
import { supabase } from "../supabaseClient.js";

export default function LivePage() {
  const { slug } = useParams();
  const [game, setGame] = useState(null);

  useEffect(() => {
    (async () => {
      const g = await getGameBySlug(slug);
      setGame(g);
    })();
  }, [slug]);

  // Optional realtime refresh on game/events
  useEffect(() => {
    const ch = supabase
      .channel(`rt-live-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, reload)
      .subscribe();
    function reload() { getGameBySlug(slug).then(setGame).catch(()=>{}); }
    return () => supabase.removeChannel(ch);
  }, [slug]);

  if (!game) return null;

  return (
    <div className="container">
      <div className="button-group" style={{ marginBottom: 12 }}>
        <Link className="btn btn-grey" to={`/games/${slug}/roster`}>Roster</Link>
        <Link className="btn btn-grey" to={`/games/${slug}`}>Boxscore</Link>
      </div>

      <h2>Live</h2>
      <p className="muted">{game.home?.name} vs {game.away?.name}</p>

      {/* 👉 Place your existing live controls here (clock, add event, shots, goals, score). */}
    </div>
  );
}
