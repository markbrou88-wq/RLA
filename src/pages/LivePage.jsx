import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";

// helper: group goal + assists; sort by period asc, time desc
function groupEvents(raw) {
  const key = (e) => `${e.period}|${e.time_mmss}|${e.team_id}|goal`;
  const goals = new Map();
  for (const e of raw) if (e.event === "goal") goals.set(key(e), { goal: e, assists: [] });
  for (const e of raw) if (e.event === "assist" && goals.has(key(e))) goals.get(key(e)).assists.push(e);
  const others = raw.filter((e) => e.event !== "goal" && e.event !== "assist");
  const rows = [...goals.values(), ...others.map((o) => ({ single: o }))];
  rows.sort((a, b) => {
    const aP = a.goal ? a.goal.period : a.single.period;
    const bP = b.goal ? b.goal.period : b.single.period;
    if (aP !== bP) return aP - bP;
    const aT = a.goal ? a.goal.time_mmss : a.single.time_mmss;
    const bT = b.goal ? b.goal.time_mmss : b.single.time_mmss;
    return bT > aT ? 1 : bT < aT ? -1 : 0;
  });
  return rows;
}

export default function LivePage() {
  const { slug } = useParams();

  const [game, setGame] = useState(null);
  const [home, setHome] = useState(null);
  const [away, setAway] = useState(null);
  const [rows, setRows] = useState([]);

  // initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: g } = await supabase.from("games").select("*").eq("slug", slug).single();
      if (cancelled) return;
      setGame(g);
      const [h, a] = await Promise.all([
        supabase.from("teams").select("*").eq("id", g.home_team_id).single(),
        supabase.from("teams").select("*").eq("id", g.away_team_id).single(),
      ]);
      if (cancelled) return;
      setHome(h.data);
      setAway(a.data);
      await refreshEvents(g.id);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // realtime refresh for events + game meta
  useEffect(() => {
    if (!game?.id) return;
    const ch = supabase
      .channel(`rt-live-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => refreshEvents(game.id))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games" }, async () => {
        const { data: g } = await supabase.from("games").select("*").eq("slug", slug).single();
        setGame(g);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [slug, game?.id]);

  async function refreshEvents(gameId) {
    const { data: ev } = await supabase
      .from("events")
      .select(`
        id, game_id, team_id, player_id, period, time_mmss, event,
        players!events_player_id_fkey ( id, name, number ),
        teams!events_team_id_fkey   ( id, short_name )
      `)
      .eq("game_id", gameId)
      .order("period", { ascending: true })
      .order("time_mmss", { ascending: false });
    setRows(groupEvents(ev || []));
  }

  if (!game || !home || !away) return null;

  return (
    <div className="container">
      <h2>Live</h2>
      <p className="muted">{home.name} vs {away.name}</p>

      {/* ⬇️ Put your existing live controls here (clock/period, shots/goals, “Add event”, score, etc.) */}
      {/* IMPORTANT: No roster UI on this page. */}

      {/* Read-only Events list — NO Actions column, NO roster above */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ paddingBottom: 6, fontWeight: 700 }}>Events</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#666" }}>
              <th style={{ padding: 8 }}>Period</th>
              <th style={{ padding: 8 }}>Time</th>
              <th style={{ padding: 8 }}>Team</th>
              <th style={{ padding: 8 }}>Type</th>
              <th style={{ padding: 8 }}>Player / Assists</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 12, color: "#888" }}>—</td></tr>
            )}
            {rows.map((r, i) => {
              if (r.goal) {
                const teamShort = r.goal.teams?.short_name || "";
                const main = r.goal.players?.name || (r.goal.players?.number ? `#${r.goal.players.number}` : "—");
                const assists = r.assists
                  .map(a => a.players?.name || (a.players?.number ? `#${a.players.number}` : "—"))
                  .join(", ");
                return (
                  <tr key={`g${i}`} style={{ borderTop: "1px solid #f2f2f2" }}>
                    <td style={{ padding: 8 }}>{r.goal.period}</td>
                    <td style={{ padding: 8 }}>{r.goal.time_mmss}</td>
                    <td style={{ padding: 8 }}>{teamShort}</td>
                    <td style={{ padding: 8 }}>goal</td>
                    <td style={{ padding: 8 }}><strong>{main}</strong>{assists && <span style={{ color: "#666" }}> (A: {assists})</span>}</td>
                  </tr>
                );
              }
              const e = r.single;
              const teamShort = e.teams?.short_name || "";
              const nm = e.players?.name || (e.players?.number ? `#${e.players.number}` : "—");
              return (
                <tr key={`o${e.id}`} style={{ borderTop: "1px solid #f2f2f2" }}>
                  <td style={{ padding: 8 }}>{e.period}</td>
                  <td style={{ padding: 8 }}>{e.time_mmss}</td>
                  <td style={{ padding: 8 }}>{teamShort}</td>
                  <td style={{ padding: 8 }}>{e.event}</td>
                  <td style={{ padding: 8 }}>{nm}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
