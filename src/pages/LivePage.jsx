// src/pages/LivePage.jsx
import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient.js";

// group goal+assists rows for display, sorted by period asc, time desc
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
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);
  const [players, setPlayers] = useState([]); // players of both teams
  const [rows, setRows] = useState([]);

  // --- Add Event form state ---
  const [formTeamId, setFormTeamId] = useState("");
  const [formType, setFormType] = useState("goal");
  const [formPeriod, setFormPeriod] = useState(1);
  const [formTime, setFormTime] = useState("15:00");
  const [formScorer, setFormScorer] = useState("");
  const [formA1, setFormA1] = useState("");
  const [formA2, setFormA2] = useState("");
  const [adding, setAdding] = useState(false);

  // initial load
  useEffect(() => {
    let dead = false;
    (async () => {
      const { data: g } = await supabase.from("games").select("*").eq("slug", slug).single();
      if (!g || dead) return;
      setGame(g);
      const [h, a] = await Promise.all([
        supabase.from("teams").select("*").eq("id", g.home_team_id).single(),
        supabase.from("teams").select("*").eq("id", g.away_team_id).single(),
      ]);
      setHomeTeam(h.data || null);
      setAwayTeam(a.data || null);

      // preload players for both teams
      const teamIds = [g.home_team_id, g.away_team_id];
      const { data: pls } = await supabase
        .from("players")
        .select("id, name, number, team_id")
        .in("team_id", teamIds)
        .order("team_id", { ascending: true })
        .order("number", { ascending: true });
      setPlayers(pls || []);

      // default team in form: home
      setFormTeamId(String(g.home_team_id));
      await refreshEvents(g.id);
    })();
    return () => { dead = true; };
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

  const teamPlayers = useMemo(
    () => players.filter(p => String(p.team_id) === String(formTeamId)),
    [players, formTeamId]
  );

  const eventTypes = [
    { v: "goal", label: "goal" },
    { v: "shot", label: "shot" },
    { v: "penalty", label: "penalty" },
    { v: "save", label: "save" },
    { v: "block", label: "block" },
  ];

  async function handleAddEvent() {
    if (!game) return;
    if (!formTeamId) return alert("Pick a team.");
    if (!/^\d{1,2}:\d{2}$/.test(formTime)) return alert("Time must be MM:SS");

    const period = Number(formPeriod) || 1;

    const rowsToInsert = [];
    if (formType === "goal") {
      if (!formScorer) return alert("Choose a scorer.");
      rowsToInsert.push({
        game_id: game.id,
        team_id: Number(formTeamId),
        player_id: Number(formScorer),
        period,
        time_mmss: formTime,
        event: "goal",
      });
      if (formA1) {
        rowsToInsert.push({
          game_id: game.id,
          team_id: Number(formTeamId),
          player_id: Number(formA1),
          period,
          time_mmss: formTime,
          event: "assist",
        });
      }
      if (formA2) {
        rowsToInsert.push({
          game_id: game.id,
          team_id: Number(formTeamId),
          player_id: Number(formA2),
          period,
          time_mmss: formTime,
          event: "assist",
        });
      }
    } else {
      // single non-goal event
      rowsToInsert.push({
        game_id: game.id,
        team_id: Number(formTeamId),
        player_id: formScorer ? Number(formScorer) : null,
        period,
        time_mmss: formTime,
        event: formType,
      });
    }

    setAdding(true);
    const { error } = await supabase.from("events").insert(rowsToInsert);
    setAdding(false);
    if (error) return alert(error.message);

    // reset scorer/assists for next entry; keep team/period/time for speed
    setFormScorer("");
    setFormA1("");
    setFormA2("");
  }

  if (!game || !homeTeam || !awayTeam) return null;

  return (
    <div className="container">
      <h2>Live</h2>
      <p className="muted">{homeTeam.name} vs {awayTeam.name}</p>

      {/* ======= ADD EVENT (Live only) ======= */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "140px 160px 1fr 1fr 1fr 90px 110px auto", gap: 8, alignItems: "center" }}>
          {/* Team */}
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Team</div>
            <select value={formTeamId} onChange={(e)=>setFormTeamId(e.target.value)} className="input">
              <option value={homeTeam.id}>{homeTeam.short_name || homeTeam.name}</option>
              <option value={awayTeam.id}>{awayTeam.short_name || awayTeam.name}</option>
            </select>
          </div>

          {/* Event type */}
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Type</div>
            <select value={formType} onChange={(e)=>setFormType(e.target.value)} className="input">
              {eventTypes.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>

          {/* Scorer / Player */}
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{formType==="goal" ? "Scorer" : "Player (optional)"}</div>
            <select value={formScorer} onChange={(e)=>setFormScorer(e.target.value)} className="input">
              <option value="">{formType==="goal" ? "Choose scorer…" : "—"}</option>
              {teamPlayers.map(p => (
                <option key={p.id} value={p.id}>
                  {p.number ? `#${p.number} ` : ""}{p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Assist 1 (only for goals) */}
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Assist 1</div>
            <select value={formA1} onChange={(e)=>setFormA1(e.target.value)} className="input" disabled={formType!=="goal"}>
              <option value="">—</option>
              {teamPlayers.map(p => (
                <option key={p.id} value={p.id}>
                  {p.number ? `#${p.number} ` : ""}{p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Assist 2 (only for goals) */}
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Assist 2</div>
            <select value={formA2} onChange={(e)=>setFormA2(e.target.value)} className="input" disabled={formType!=="goal"}>
              <option value="">—</option>
              {teamPlayers.map(p => (
                <option key={p.id} value={p.id}>
                  {p.number ? `#${p.number} ` : ""}{p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Period */}
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Period</div>
            <input type="number" min={1} max={9} value={formPeriod} onChange={(e)=>setFormPeriod(e.target.value)} className="input"/>
          </div>

          {/* Time */}
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Time (MM:SS)</div>
            <input type="text" value={formTime} onChange={(e)=>setFormTime(e.target.value)} className="input" />
          </div>

          {/* Add button */}
          <div style={{ alignSelf: "end" }}>
            <button className="btn btn-blue" onClick={handleAddEvent} disabled={adding}>
              {adding ? "Adding…" : "Add event"}
            </button>
          </div>
        </div>
      </div>

      {/* ======= READ-ONLY EVENTS LIST ======= */}
      <div className="card" style={{ marginTop: 8 }}>
        <div style={{ paddingBottom: 6, fontWeight: 700 }}>Events</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#666" }}>
              <th style={{ padding: 8 }}>PERIOD</th>
              <th style={{ padding: 8 }}>TIME</th>
              <th style={{ padding: 8 }}>TEAM</th>
              <th style={{ padding: 8 }}>TYPE</th>
              <th style={{ padding: 8 }}>PLAYER / ASSISTS</th>
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
                    <td style={{ padding: 8 }}>
                      <strong>{main}</strong>
                      {assists && <span style={{ color: "#666" }}> (A: {assists})</span>}
                    </td>
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
