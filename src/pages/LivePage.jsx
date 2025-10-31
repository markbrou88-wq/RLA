// src/pages/LivePage.jsx
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { getGameBySlug } from "../lib/db.js";
import { supabase } from "../supabaseClient.js";

export default function LivePage() {
  const { slug } = useParams();
  const [game, setGame] = useState(null);

  // initial load
  useEffect(() => {
    (async () => setGame(await getGameBySlug(slug)))();
  }, [slug]);

  // live refresh when game or events change
  useEffect(() => {
    const ch = supabase
      .channel(`rt-live-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, reload)
      .subscribe();
    function reload() { getGameBySlug(slug).then(setGame).catch(() => {}); }
    return () => supabase.removeChannel(ch);
  }, [slug]);

  if (!game) return null;

  return (
    <div className="container">
      <h2>Live</h2>
      <p className="muted">
        {game.home?.name} vs {game.away?.name}
      </p>

      {/* ⬇️ Your existing live controls go here (clock, period, shots, add event, scores, etc.) */}
      {/* Keep roster UI off this page per your request. */}
    </div>
  );
}
