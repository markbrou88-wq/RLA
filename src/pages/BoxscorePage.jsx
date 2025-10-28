import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { groupBy } from "../utils/groupBy"; // Optional helper; see inline fallback below

// Fallback if you don't have a small helper:
function simpleGroup(keyFn, arr) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

function groupLive(ev) {
  // goal + assists on single line; keep others single
  const goals = ev.filter((e) => e.event === "goal");
  const assists = ev.filter((e) => e.event === "assist");
  const key = (e) => `${e.period}|${e.time_mmss}|${e.team_id}|goal`;
  const gmap = new Map();
  for (const g of goals) gmap.set(key(g), { goal: g, assists: [] });
  for (const a of assists) {
    const k = key(a);
    if (gmap.has(k)) gmap.get(k).assists.push(a);
  }
  const joined = Array.from(gmap.values());
  const others = ev.filter((e) => e.event !== "goal" && e.event !== "assist").map((single) => ({ single }));
  const rows = [...joined, ...others];
  rows.sort((a, b) => {
    const ap = a.goal ? a.goal.period : a.single.period;
    const bp = b.goal ? b.goal.period : b.single.period;
    if (ap !== bp) return ap - bp;
    const at = a.goal ? a.goal.time_mmss : a.single.time_mmss;
    const bt = b.goal ? b.goal.time_mmss : b.single.time_mmss;
    return bt.localeCompare(at);
  });
  return rows;
}

export default function BoxscorePage() {
  const { slug } = useParams();

  const [game, setGame] = React.useState(null);
  const [home, setHome] = React.useState(null);
  const [away, setAway] = React.useState(null);
  const [evRows, setEvRows] = React.useState([]);

  React.useEffect(() => {
    (async () => {
      // game
      const { data: g } = await supabase.from("games").select("*").eq("slug", slug).single();
      setGame(g);

      const [h, a] = await Promise.all([
        supabase.from("teams").select("*").eq("id", g.home_team_id).single(),
        supabase.from("teams").select("*").eq("id", g.away_team_id).single(),
      ]);
      setHome(h.data || null);
      setAway(a.data || null);

      // events w/ player info
      const { data: ev } = await supabase
        .from("events")
        .select(
          `
            id, game_id, team_id, player_id, period, time_mmss, event,
            players!events_player_id_fkey ( id, name, number )
          `
        )
        .eq("game_id", g.id)
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: false });

      setEvRows(groupLive(ev || []));
    })();
  }, [slug]);

  if (!game || !home || !away) return <div style={{ padding: 16 }}>Loading…</div>;

  const scoreHome = game.home_score || 0;
  const scoreAway = game.away_score || 0;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <Link to={`/games/${slug}`}>← Back to Game</Link>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr", alignItems: "center", marginTop: 12 }}>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{home.name}</div>
          <div style={{ color: "#666", fontSize: 12 }}>{home.short_name}</div>
        </div>
        <div style={{ textAlign: "center", fontSize: 22, fontWeight: 800 }}>
          {scoreHome} <span style={{ color: "#aaa", fontWeight: 400 }}>vs</span> {scoreAway}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{away.name}</div>
          <div style={{ color: "#666", fontSize: 12 }}>{away.short_name}</div>
        </div>
      </div>

      <h3 style={{ marginTop: 18 }}>Goals</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#666" }}>
            <th style={{ padding: 8 }}>Team</th>
            <th style={{ padding: 8 }}>Period</th>
            <th style={{ padding: 8 }}>Time</th>
            <th style={{ padding: 8 }}>Scorer</th>
            <th style={{ padding: 8 }}>Assists</th>
          </tr>
        </thead>
        <tbody>
          {evRows
            .filter((r) => r.goal) // only goals
            .map((r, i) => {
              const team =
                r.goal.team_id === home.id ? home.short_name : away.short_name;
              const scorer = r.goal.players?.name || `#${r.goal.players?.number}`;
              const assists = r.assists
                .map((a) => (a.players?.name ? a.players.name : `#${a.players?.number}`))
                .join(", ");
              return (
                <tr key={`g${i}`} style={{ borderTop: "1px solid #f1f1f1" }}>
                  <td style={{ padding: 8 }}>{team}</td>
                  <td style={{ padding: 8 }}>{r.goal.period}</td>
                  <td style={{ padding: 8 }}>{r.goal.time_mmss}</td>
                  <td style={{ padding: 8 }}><strong>{scorer}</strong></td>
                  <td style={{ padding: 8 }}>{assists || "—"}</td>
                </tr>
              );
            })}
        </tbody>
      </table>

      <h3 style={{ marginTop: 18 }}>Penalties & Other</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#666" }}>
            <th style={{ padding: 8 }}>Team</th>
            <th style={{ padding: 8 }}>Period</th>
            <th style={{ padding: 8 }}>Time</th>
            <th style={{ padding: 8 }}>Type</th>
            <th style={{ padding: 8 }}>Player</th>
          </tr>
        </thead>
        <tbody>
          {evRows
            .filter((r) => r.single)
            .map((r) => {
              const e = r.single;
              const team = e.team_id === home.id ? home.short_name : away.short_name;
              const nm = e.players?.name || `#${e.players?.number}` || "—";
              return (
                <tr key={e.id} style={{ borderTop: "1px solid #f1f1f1" }}>
                  <td style={{ padding: 8 }}>{team}</td>
                  <td style={{ padding: 8 }}>{e.period}</td>
                  <td style={{ padding: 8 }}>{e.time_mmss}</td>
                  <td style={{ padding: 8 }}>{e.event}</td>
                  <td style={{ padding: 8 }}>{nm}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
