// src/pages/BoxscorePage.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

function groupEvents(raw, homeId, awayId, teamsById) {
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

export default function BoxscorePage() {
  const { slug } = useParams();
  const [game, setGame] = React.useState(null);
  const [home, setHome] = React.useState(null);
  const [away, setAway] = React.useState(null);
  const [events, setEvents] = React.useState([]);
  const [rows, setRows] = React.useState([]);

  const [homeLineup, setHomeLineup] = React.useState([]);
  const [awayLineup, setAwayLineup] = React.useState([]);

  React.useEffect(() => {
    (async () => {
      const { data: g } = await supabase.from("games").select("*").eq("slug", slug).single();
      setGame(g);
      const [h, a] = await Promise.all([
        supabase.from("teams").select("*").eq("id", g.home_team_id).single(),
        supabase.from("teams").select("*").eq("id", g.away_team_id).single(),
      ]);
      setHome(h.data);
      setAway(a.data);

      // Pull rosters from game_rosters (active players)
      const [grHome, grAway] = await Promise.all([
        supabase
          .from("game_rosters")
          .select("players:player_id ( id, name, number, position )")
          .eq("game_id", g.id)
          .eq("team_id", g.home_team_id),
        supabase
          .from("game_rosters")
          .select("players:player_id ( id, name, number, position )")
          .eq("game_id", g.id)
          .eq("team_id", g.away_team_id),
      ]);
      setHomeLineup(
        (grHome.data || [])
          .map((r) => r.players)
          .sort((a, b) => (a.number || 0) - (b.number || 0))
      );
      setAwayLineup(
        (grAway.data || [])
          .map((r) => r.players)
          .sort((a, b) => (a.number || 0) - (b.number || 0))
      );

      const { data: ev } = await supabase
        .from("events")
        .select(
          `
          id, game_id, team_id, player_id, period, time_mmss, event,
          players!events_player_id_fkey ( id, name, number ),
          teams!events_team_id_fkey ( id, short_name )
        `
        )
        .eq("game_id", g.id)
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: false });

      setEvents(ev || []);
      setRows(groupEvents(ev || [], g.home_team_id, g.away_team_id));
    })();
  }, [slug]);

  if (!game || !home || !away) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <Link to="/games">← Back to Games</Link>

      <div style={{ textAlign: "center", marginTop: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          {home.name} {game.home_score ?? 0} — {game.away_score ?? 0} {away.name}
        </div>
        <div style={{ color: "#667", fontSize: 12 }}>
          {game.status?.toUpperCase() || "OPEN"} • {new Date(game.game_date).toLocaleDateString()}
        </div>
      </div>

      {/* Lineups from game_rosters */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 8 }}>
          <div style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 700 }}>{home.short_name} Lineup</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#666" }}>
                <th style={{ padding: 8, width: 50 }}>#</th>
                <th style={{ padding: 8 }}>Player</th>
                <th style={{ padding: 8, width: 80 }}>Pos</th>
              </tr>
            </thead>
            <tbody>
              {homeLineup.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: 10, color: "#999" }}>
                    —
                  </td>
                </tr>
              )}
              {homeLineup.map((p) => (
                <tr key={p.id} style={{ borderTop: "1px solid #f3f3f3" }}>
                  <td style={{ padding: 8 }}>{p.number}</td>
                  <td style={{ padding: 8 }}>{p.name}</td>
                  <td style={{ padding: 8 }}>{p.position || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 8 }}>
          <div style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 700 }}>{away.short_name} Lineup</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#666" }}>
                <th style={{ padding: 8, width: 50 }}>#</th>
                <th style={{ padding: 8 }}>Player</th>
                <th style={{ padding: 8, width: 80 }}>Pos</th>
              </tr>
            </thead>
            <tbody>
              {awayLineup.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: 10, color: "#999" }}>
                    —
                  </td>
                </tr>
              )}
              {awayLineup.map((p) => (
                <tr key={p.id} style={{ borderTop: "1px solid #f3f3f3" }}>
                  <td style={{ padding: 8 }}>{p.number}</td>
                  <td style={{ padding: 8 }}>{p.name}</td>
                  <td style={{ padding: 8 }}>{p.position || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Events: goal lines show assists inline */}
      <div style={{ marginTop: 16, border: "1px solid #eee", borderRadius: 8 }}>
        <div style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 700 }}>Goals / Events</div>
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
              <tr>
                <td colSpan={5} style={{ padding: 12, color: "#888" }}>
                  —
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              if (r.goal) {
                const teamShort =
                  r.goal.team_id === home.id ? home.short_name : away.short_name;
                const main =
                  r.goal.players?.name ||
                  (r.goal.players?.number ? `#${r.goal.players.number}` : "—");
                const assists = r.assists
                  .map((a) => a.players?.name || (a.players?.number ? `#${a.players.number}` : "—"))
                  .join(", ");

                return (
                  <tr key={`g${i}`} style={{ borderTop: "1px solid #f2f2f2" }}>
                    <td style={{ padding: 8 }}>{r.goal.period}</td>
                    <td style={{ padding: 8 }}>{r.goal.time_mmss}</td>
                    <td style={{ padding: 8 }}>{teamShort}</td>
                    <td style={{ padding: 8 }}>goal</td>
                    <td style={{ padding: 8 }}>
                      <strong>{main}</strong>
                      {assists && <span style={{ color: "#666" }}> (A: {assists})</span>}
                    </td>
                  </tr>
                );
              } else {
                const e = r.single;
                const teamShort = e.team_id === home.id ? home.short_name : away.short_name;
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
              }
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
