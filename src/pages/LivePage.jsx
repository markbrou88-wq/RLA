// src/pages/LivePage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient.js";

// ---- helpers ---------------------------------------------------------------

// group goal+assists for display; order by period asc, time desc
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

// MM:SS utilities
const clamp2 = (n) => String(Math.max(0, Math.min(59, n))).padStart(2, "0");
function msToMMSS(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
function mmssToMs(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || "");
  if (!m) return 0;
  return (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000;
}

// safe upsert helper for game_stats goalie row
async function bumpGoalieStats({ game_id, player_id, team_id, deltaSA = 0, deltaGA = 0 }) {
  // upsert on (game_id, player_id, team_id)
  const { data: existing } = await supabase
    .from("game_stats")
    .select("id, goalie_shots_against")
    .eq("game_id", game_id)
    .eq("player_id", player_id)
    .eq("team_id", team_id)
    .single();

  if (!existing) {
    await supabase.from("game_stats").insert({
      game_id,
      team_id,
      player_id,
      is_goalie: true,
      goalie_shots_against: Math.max(0, deltaSA),
      // No dedicated GA column in your schema; GA is often derived from events.
      // If you add one later, increment it here.
    });
  } else {
    await supabase
      .from("game_stats")
      .update({
        goalie_shots_against: Math.max(0, (existing.goalie_shots_against || 0) + deltaSA),
      })
      .eq("id", existing.id);
  }
  // GA credit could be derived from events; if you add a GA column, update it here too.
}

// ---- component -------------------------------------------------------------

export default function LivePage() {
  const { slug } = useParams();

  const [game, setGame] = useState(null);
  const [home, setHome] = useState(null);
  const [away, setAway] = useState(null);
  const [players, setPlayers] = useState([]); // both teams
  const [rows, setRows] = useState([]);

  // current goalies on ice (id or "")
  const [goalieByTeam, setGoalieByTeam] = useState({});

  // ----- clock / period -----
  const [period, setPeriod] = useState(1);
  const [periodLenMin, setPeriodLenMin] = useState(15);
  const [clockMMSS, setClockMMSS] = useState("15:00");
  const [running, setRunning] = useState(false);
  const timerRef = useRef(null);
  const lastTickRef = useRef(null);

  // ----- event form -----
  const [etype, setEtype] = useState("goal");
  const [teamId, setTeamId] = useState("");
  const [scorer, setScorer] = useState("");
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const [penMin, setPenMin] = useState(2);
  const [penType, setPenType] = useState("minor");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  // initial load
  useEffect(() => {
    let dead = false;
    (async () => {
      const { data: g } = await supabase.from("games").select("*").eq("slug", slug).single();
      if (dead) return;
      setGame(g);
      const [h, a] = await Promise.all([
        supabase.from("teams").select("*").eq("id", g.home_team_id).single(),
        supabase.from("teams").select("*").eq("id", g.away_team_id).single(),
      ]);
      if (dead) return;
      setHome(h.data);
      setAway(a.data);

      const teamIds = [g.home_team_id, g.away_team_id];
      const { data: pls } = await supabase
        .from("players")
        .select("id, name, number, team_id, position")
        .in("team_id", teamIds)
        .order("team_id", { ascending: true })
        .order("number", { ascending: true });
      setPlayers(pls || []);

      // defaults
      setTeamId(String(g.home_team_id));
      setClockMMSS(msToMMSS(periodLenMin * 60 * 1000));

      await refreshEvents(g.id);
    })();
    return () => {
      dead = true;
      clearInterval(timerRef.current);
    };
  }, [slug]);

  // realtime subscribe
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

  // --- clock controls ---
  function startClock() {
    if (running) return;
    setRunning(true);
    lastTickRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const delta = now - (lastTickRef.current || now);
      lastTickRef.current = now;
      const ms = mmssToMs(clockMMSS) - delta;
      if (ms <= 0) {
        clearInterval(timerRef.current);
        setRunning(false);
        setClockMMSS("00:00");
      } else {
        setClockMMSS(msToMMSS(ms));
      }
    }, 250);
  }
  function stopClock() {
    clearInterval(timerRef.current);
    setRunning(false);
  }
  function resetClock() {
    stopClock();
    setClockMMSS(msToMMSS(periodLenMin * 60 * 1000));
  }
  function applyPeriodLen() {
    setClockMMSS(msToMMSS(Math.max(1, periodLenMin) * 60 * 1000));
  }

  // players by selected team (for scorer/assists pickers)
  const teamPlayers = useMemo(
    () => players.filter((p) => String(p.team_id) === String(teamId)),
    [players, teamId]
  );

  // goalie selects for both teams
  const homeGoalies = useMemo(
    () => players.filter((p) => p.team_id === home?.id && (p.position || "").toLowerCase().includes("g")),
    [players, home?.id]
  );
  const awayGoalies = useMemo(
    () => players.filter((p) => p.team_id === away?.id && (p.position || "").toLowerCase().includes("g")),
    [players, away?.id]
  );

  function setGoalie(team, pid) {
    setGoalieByTeam((m) => ({ ...m, [team]: pid }));
  }

  // quick adds (both teams)
  async function quick(type, forTeamId) {
    setEtype(type);
    setTeamId(String(forTeamId));
    if (type === "goal" || type === "shot" || type === "save") return; // user still chooses player
    await doInsert({ type, forTeamId });
  }

  // compute opposite team id
  function otherTeamId(tid) {
    if (!home || !away) return null;
    return Number(tid) === home.id ? away.id : home.id;
  }

  // insert event(s)
  async function doInsert(opts) {
    const tId = Number(opts?.forTeamId || teamId);
    const per = Number(period) || 1;
    const tm = clockMMSS;

    const toInsert = [];

    if (etype === "goal") {
      if (!scorer) return alert("Choose a scorer");
      toInsert.push({
        game_id: game.id,
        team_id: tId,
        player_id: Number(scorer),
        period: per,
        time_mmss: tm,
        event: "goal",
      });
      if (a1) {
        toInsert.push({
          game_id: game.id,
          team_id: tId,
          player_id: Number(a1),
          period: per,
          time_mmss: tm,
          event: "assist",
        });
      }
      if (a2) {
        toInsert.push({
          game_id: game.id,
          team_id: tId,
          player_id: Number(a2),
          period: per,
          time_mmss: tm,
          event: "assist",
        });
      }
    } else if (etype === "penalty") {
      toInsert.push({
        game_id: game.id,
        team_id: tId,
        player_id: scorer ? Number(scorer) : null,
        period: per,
        time_mmss: tm,
        event: `penalty_${penType}_${penMin}`,
      });
    } else {
      // shot / save / block / faceoff / hit / takeaway / giveaway / note
      toInsert.push({
        game_id: game.id,
        team_id: tId,
        player_id: scorer ? Number(scorer) : null,
        period: per,
        time_mmss: tm,
        event: etype,
      });
    }

    setAdding(true);
    const { error } = await supabase.from("events").insert(toInsert);
    setAdding(false);
    if (error) return alert(error.message);

    // side-effects
    if (etype === "goal") {
      // bump game score
      const isHome = tId === home.id;
      await supabase
        .from("games")
        .update(isHome ? { home_score: (game.home_score || 0) + 1 } : { away_score: (game.away_score || 0) + 1 })
        .eq("id", game.id);

      // credit GA & SA to opposing goalie if set
      const oppTeam = otherTeamId(tId);
      const oppGoalie = goalieByTeam[oppTeam];
      if (oppGoalie) {
        await bumpGoalieStats({ game_id: game.id, player_id: Number(oppGoalie), team_id: oppTeam, deltaSA: 1, deltaGA: 1 });
      }
    } else if (etype === "shot" || etype === "save") {
      // credit SA to opposing goalie if set
      const oppTeam = otherTeamId(tId);
      const oppGoalie = goalieByTeam[oppTeam];
      if (oppGoalie) {
        await bumpGoalieStats({ game_id: game.id, player_id: Number(oppGoalie), team_id: oppTeam, deltaSA: 1, deltaGA: 0 });
      }
    }

    // reset player fields for speed
    setScorer("");
    setA1("");
    setA2("");
  }

  if (!game || !home || !away) return null;

  const teamOptions = [
    { id: home.id, label: home.short_name || home.name },
    { id: away.id, label: away.short_name || away.name },
  ];

  return (
    <div className="container">
      <div className="button-group" style={{ marginBottom: 8 }}>
        <Link className="btn btn-grey" to={`/games/${slug}/roster`}>Roster</Link>
        <Link className="btn btn-grey" to={`/games/${slug}`}>Boxscore</Link>
        <Link className="btn btn-grey" to="/games">Back to Games</Link>
      </div>

      <h2>Live</h2>
      <div className="muted" style={{ marginBottom: 8 }}>
        {home.name} vs {away.name}
      </div>

      {/* === CONTROLS BAR ==================================================== */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: 10 }}>
          {/* Team */}
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Team</div>
            <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teamOptions.map((t) => (
                <option value={t.id} key={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Type</div>
            <select className="input" value={etype} onChange={(e) => setEtype(e.target.value)}>
              <option value="goal">goal</option>
              <option value="shot">shot</option>
              <option value="save">save</option>
              <option value="penalty">penalty</option>
              <option value="block">block</option>
              <option value="faceoff_win">faceoff_win</option>
              <option value="hit">hit</option>
              <option value="giveaway">giveaway</option>
              <option value="takeaway">takeaway</option>
              <option value="note">note</option>
            </select>
          </div>

          {/* Scorer / Player */}
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              {etype === "goal" ? "Scorer" : "Player (optional)"}
            </div>
            <select className="input" value={scorer} onChange={(e) => setScorer(e.target.value)}>
              <option value="">{etype === "goal" ? "Choose scorer…" : "—"}</option>
              {teamPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number ? `#${p.number} ` : ""}{p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Assists (only for goal) */}
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Assist 1</div>
            <select className="input" value={a1} onChange={(e) => setA1(e.target.value)} disabled={etype !== "goal"}>
              <option value="">—</option>
              {teamPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number ? `#${p.number} ` : ""}{p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Assist 2</div>
            <select className="input" value={a2} onChange={(e) => setA2(e.target.value)} disabled={etype !== "goal"}>
              <option value="">—</option>
              {teamPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number ? `#${p.number} ` : ""}{p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Add */}
          <div style={{ alignSelf: "end" }}>
            <button className="btn btn-blue" onClick={() => doInsert()} disabled={adding}>
              {adding ? "Adding…" : "Add event"}
            </button>
          </div>
        </div>

        {/* Penalty and notes row */}
        {etype === "penalty" && (
          <div style={{ display: "grid", gridTemplateColumns: "140px 160px 1fr", gap: 10, marginTop: 10 }}>
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Minutes</div>
              <input className="input" type="number" min={2} max={10} step={2}
                     value={penMin} onChange={(e) => setPenMin(Number(e.target.value) || 2)} />
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Type</div>
              <select className="input" value={penType} onChange={(e) => setPenType(e.target.value)}>
                <option value="minor">minor</option>
                <option value="double_minor">double_minor</option>
                <option value="major">major</option>
                <option value="misconduct">misconduct</option>
              </select>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Note</div>
              <input className="input" type="text" placeholder="Optional note" value={note} onChange={(e)=>setNote(e.target.value)} />
            </div>
          </div>
        )}

        {/* Clock / period / goalies */}
        <hr style={{ margin: "12px 0" }} />
        <div style={{ display: "grid", gridTemplateColumns: "140px 120px 240px 1fr 1fr", gap: 10, alignItems: "end" }}>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Period</div>
            <input className="input" type="number" min={1} value={period} onChange={(e)=>setPeriod(e.target.value)} />
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Clock (MM:SS)</div>
            <input className="input" type="text" value={clockMMSS} onChange={(e)=>{
              const v = e.target.value;
              const m = /^(\d{1,2}):(\d{2})$/.exec(v);
              if (m) setClockMMSS(`${String(parseInt(m[1],10)).padStart(2,"0")}:${clamp2(parseInt(m[2],10))}`);
            }}/>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button className="btn btn-grey" onClick={startClock} disabled={running}>Start</button>
              <button className="btn btn-grey" onClick={stopClock} disabled={!running}>Stop</button>
              <button className="btn btn-grey" onClick={resetClock}>Reset</button>
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Set period length (minutes)</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input" type="number" min={1} max={30}
                     value={periodLenMin} onChange={(e)=>setPeriodLenMin(Number(e.target.value)||15)} />
              <button className="btn btn-grey" onClick={applyPeriodLen}>Apply</button>
            </div>
          </div>

          {/* Goalies on ice */}
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{home.short_name || home.name} Goalie on ice</div>
            <select className="input" value={goalieByTeam[home.id] || ""} onChange={(e)=>setGoalie(home.id, e.target.value)}>
              <option value="">—</option>
              {homeGoalies.map(g => (
                <option value={g.id} key={g.id}>{g.number ? `#${g.number} ` : ""}{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{away.short_name || away.name} Goalie on ice</div>
            <select className="input" value={goalieByTeam[away.id] || ""} onChange={(e)=>setGoalie(away.id, e.target.value)}>
              <option value="">—</option>
              {awayGoalies.map(g => (
                <option value={g.id} key={g.id}>{g.number ? `#${g.number} ` : ""}{g.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick add buttons */}
        <hr style={{ margin: "12px 0" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <QuickBar label={home.short_name || home.name}
                    onShot={()=>quick("shot", home.id)}
                    onGoal={()=>setEtype("goal")||setTeamId(String(home.id))}
                    onSave={()=>quick("save", home.id)}
                    onFaceoff={()=>quick("faceoff_win", home.id)} />
          <QuickBar label={away.short_name || away.name}
                    onShot={()=>quick("shot", away.id)}
                    onGoal={()=>setEtype("goal")||setTeamId(String(away.id))}
                    onSave={()=>quick("save", away.id)}
                    onFaceoff={()=>quick("faceoff_win", away.id)} />
        </div>
      </div>

      {/* === EVENTS TABLE ===================================================== */}
      <div className="card">
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

// quick bar for a team
function QuickBar({ label, onShot, onGoal, onSave, onFaceoff }) {
  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ fontWeight: 700, marginRight: 8 }}>{label}</div>
      <button className="btn btn-grey" onClick={onShot}>+ Shot</button>
      <button className="btn btn-blue" onClick={onGoal}>+ Goal</button>
      <button className="btn btn-grey" onClick={onSave}>+ Save</button>
      <button className="btn btn-grey" onClick={onFaceoff}>+ Faceoff Win</button>
    </div>
  );
}
