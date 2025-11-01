// src/pages/LivePage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient.js";

/* ========================== small utils ========================== */
const pad2 = (n) => String(n).padStart(2, "0");
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const msToMMSS = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${pad2(mm)}:${pad2(ss)}`;
};
const mmssToMs = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || "");
  if (!m) return 0;
  return (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000;
};

// event grouping for display
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
    return bT.localeCompare(aT);
  });
  return rows;
}

// goalie SA bump
async function bumpGoalieSA({ game_id, team_id, player_id, deltaSA }) {
  const { data } = await supabase
    .from("game_stats")
    .select("id, goalie_shots_against")
    .eq("game_id", game_id)
    .eq("team_id", team_id)
    .eq("player_id", player_id)
    .single();
  if (!data) {
    await supabase.from("game_stats").insert({
      game_id,
      team_id,
      player_id,
      is_goalie: true,
      goalie_shots_against: Math.max(0, deltaSA),
    });
  } else {
    await supabase
      .from("game_stats")
      .update({ goalie_shots_against: Math.max(0, (data.goalie_shots_against || 0) + deltaSA) })
      .eq("id", data.id);
  }
}

/* ========================== team color helpers ========================== */
function colorForTeam(team) {
  const n = (team?.short_name || team?.name || "").toLowerCase();
  // tolerant matching for your 3 clubs
  if (n.includes("black") || n.includes("rln")) return "#111111"; // Red Lite Black
  if (n.includes("blue") || n.includes("rlb")) return "#2d7ef7"; // Red Lite Blue
  if (n.includes("red") || n.includes("rlr")) return "#ff2a2a"; // Red Lite Red
  return "#444"; // fallback
}
const textOn = (hex) => {
  // simple contrast
  return ["#111", "#222", "#333"].includes(hex) ? "#fff" : "#fff";
};

/* ========================== main page ========================== */
export default function LivePage() {
  const { slug } = useParams();

  // game + teams
  const [game, setGame] = useState(null);
  const [home, setHome] = useState(null);
  const [away, setAway] = useState(null);

  // players dressed
  const [dressedHome, setDressedHome] = useState([]);
  const [dressedAway, setDressedAway] = useState([]);

  // goalie on ice
  const [goalieOnIce, setGoalieOnIce] = useState({}); // {teamId: playerId}

  // on-ice tokens UI only
  const [onIce, setOnIce] = useState([]); // [{id, team_id, x, y} %]

  // rink orientation
  const [flip, setFlip] = useState(false);

  // clock
  const [period, setPeriod] = useState(1);
  const [periodLen, setPeriodLen] = useState(15);
  const [clock, setClock] = useState("15:00");
  const [running, setRunning] = useState(false);
  const tickRef = useRef(null);
  const lastRef = useRef(null);

  // events
  const [rows, setRows] = useState([]);
  const [lastGroupIds, setLastGroupIds] = useState([]);

  // goal popup
  const [goalPick, setGoalPick] = useState(null);
  const [assist1, setAssist1] = useState("");
  const [assist2, setAssist2] = useState("");

  useEffect(() => {
    let dead = false;
    (async () => {
      const { data: g } = await supabase.from("games").select("*").eq("slug", slug).single();
      if (!g) return;
      const [h, a] = await Promise.all([
        supabase.from("teams").select("*").eq("id", g.home_team_id).single(),
        supabase.from("teams").select("*").eq("id", g.away_team_id).single(),
      ]);
      const [{ data: homeRoster }, { data: awayRoster }] = await Promise.all([
        supabase
          .from("game_rosters")
          .select("players:player_id(id,name,number,position),dressed,team_id")
          .eq("game_id", g.id)
          .eq("team_id", g.home_team_id)
          .eq("dressed", true),
        supabase
          .from("game_rosters")
          .select("players:player_id(id,name,number,position),dressed,team_id")
          .eq("game_id", g.id)
          .eq("team_id", g.away_team_id)
          .eq("dressed", true),
      ]);

      if (dead) return;
      setGame(g);
      setHome(h.data);
      setAway(a.data);
      setDressedHome((homeRoster || []).map((r) => r.players).sort((x, y) => (x.number || 0) - (y.number || 0)));
      setDressedAway((awayRoster || []).map((r) => r.players).sort((x, y) => (x.number || 0) - (y.number || 0)));
      setClock(msToMMSS((g.period_seconds || periodLen * 60) * 1000));
      await refreshEvents(g.id);
    })();
    return () => {
      dead = true;
      clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!game?.id) return;
    const ch = supabase
      .channel(`rt-live-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => refreshEvents(game.id))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games" }, async () => {
        const { data: g } = await supabase.from("games").select("*").eq("slug", slug).single();
        if (g) setGame(g);
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
        teams!events_team_id_fkey ( id, short_name, name )
      `)
      .eq("game_id", gameId)
      .order("period", { ascending: true })
      .order("time_mmss", { ascending: false });
    setRows(groupEvents(ev || []));
  }

  // clock controls
  function startClock() {
    if (running) return;
    setRunning(true);
    lastRef.current = Date.now();
    tickRef.current = setInterval(() => {
      const now = Date.now();
      const d = now - (lastRef.current || now);
      lastRef.current = now;
      const ms = mmssToMs(clock) - d;
      if (ms <= 0) {
        setClock("00:00");
        clearInterval(tickRef.current);
        setRunning(false);
      } else {
        setClock(msToMMSS(ms));
      }
    }, 250);
  }
  function stopClock() {
    clearInterval(tickRef.current);
    setRunning(false);
  }
  function resetClock() {
    stopClock();
    setClock(msToMMSS(periodLen * 60 * 1000));
  }

  // dnd handlers
  function handleDropOnRink(e) {
    e.preventDefault();
    const data = e.dataTransfer.getData("text/plain");
    if (!data) return;
    const payload = JSON.parse(data); // {id, team_id}
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
    setOnIce((cur) => {
      const copy = cur.filter((t) => t.id !== payload.id);
      copy.push({ id: payload.id, team_id: payload.team_id, x: +x.toFixed(2), y: +y.toFixed(2) });
      return copy;
    });
  }
  function removeFromIce(id) {
    setOnIce((cur) => cur.filter((t) => t.id !== id));
  }

  // goal zones
  function handleDropOnGoal(e, which) {
    e.preventDefault();
    const data = e.dataTransfer.getData("text/plain");
    if (!data) return;
    const payload = JSON.parse(data);
    const isHomeScorer = payload.team_id === home.id && which === "awayNet";
    const isAwayScorer = payload.team_id === away.id && which === "homeNet";
    if (!isHomeScorer && !isAwayScorer) return;
    setGoalPick({ scorer: payload.id, team_id: payload.team_id, side: isHomeScorer ? "home" : "away" });
    setAssist1("");
    setAssist2("");
  }

  // confirm goal
  async function confirmGoal() {
    if (!goalPick) return;
    const groupIds = [];
    const tm = clock;
    const per = Number(period) || 1;
    const tId = Number(goalPick.team_id);

    const { data: gRow, error: e1 } = await supabase
      .from("events")
      .insert([{ game_id: game.id, team_id: tId, player_id: goalPick.scorer, period: per, time_mmss: tm, event: "goal" }])
      .select()
      .single();
    if (e1) return alert(e1.message);
    groupIds.push(gRow.id);

    for (const a of [assist1, assist2]) {
      if (!a) continue;
      const { data: aRow, error: ea } = await supabase
        .from("events")
        .insert([{ game_id: game.id, team_id: tId, player_id: Number(a), period: per, time_mmss: tm, event: "assist" }])
        .select()
        .single();
      if (ea) return alert(ea.message);
      groupIds.push(aRow.id);
    }

    const isHome = tId === home.id;
    await supabase.from("games").update(isHome ? { home_score: (game.home_score || 0) + 1 } : { away_score: (game.away_score || 0) + 1 }).eq("id", game.id);

    const oppTeam = tId === home.id ? away.id : home.id;
    const oppGoalie = goalieOnIce[oppTeam];
    if (oppGoalie) {
      await bumpGoalieSA({ game_id: game.id, team_id: oppTeam, player_id: oppGoalie, deltaSA: 1 });
    }

    setLastGroupIds(groupIds);
    setGoalPick(null);
  }

  async function undoLast() {
    if (lastGroupIds.length === 0) return;
    const { data: evts } = await supabase.from("events").select("*").in("id", lastGroupIds);
    await supabase.from("events").delete().in("id", lastGroupIds);
    const goalEvt = evts.find((e) => e.event === "goal");
    if (goalEvt) {
      const isHome = goalEvt.team_id === home.id;
      await supabase
        .from("games")
        .update(isHome ? { home_score: Math.max(0, (game.home_score || 0) - 1) } : { away_score: Math.max(0, (game.away_score || 0) - 1) })
        .eq("id", game.id);
      const oppTeam = isHome ? away.id : home.id;
      const oppGoalie = goalieOnIce[oppTeam];
      if (oppGoalie) await bumpGoalieSA({ game_id: game.id, team_id: oppTeam, player_id: oppGoalie, deltaSA: -1 });
    }
    setLastGroupIds([]);
  }

  function clearOnIce() {
    setOnIce([]);
  }
  function swapSides() {
    setFlip((f) => !f);
  }

  // assist choices from on-ice teammates
  const assistChoices = useMemo(() => {
    if (!goalPick) return [];
    return onIce
      .filter((t) => t.team_id === goalPick.team_id && t.id !== goalPick.scorer)
      .map((t) => {
        const src = t.team_id === home?.id ? dressedHome : dressedAway;
        return src.find((pp) => pp.id === t.id) || { id: t.id, name: "#" + t.id };
      });
  }, [goalPick, onIce, dressedHome, dressedAway, home?.id]);

  if (!game || !home || !away) return null;

  // colors
  const homeColor = colorForTeam(home);
  const awayColor = colorForTeam(away);

  /* ========================== styles ========================== */
  // Rink: aspect-ratio 2.2:1 to be long-wide; blue deck with subtle grid and yellow lines
  const rinkS = {
    position: "relative",
    aspectRatio: "2.2 / 1",
    width: "100%",
    borderRadius: 16,
    border: "1px solid #d6e2ff",
    overflow: "hidden",
    background: `repeating-linear-gradient(
      0deg,
      #1b5fd6,
      #1b5fd6 10px,
      #1a59ca 10px,
      #1a59ca 20px
    )`,
    boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.05)",
    userSelect: "none",
  };

  return (
    <div className="container">
      {/* Top links */}
      <div className="button-group" style={{ marginBottom: 8 }}>
        <Link className="btn btn-grey" to={`/games/${slug}/roster`}>Roster</Link>
        <Link className="btn btn-grey" to={`/games/${slug}`}>Boxscore</Link>
        <Link className="btn btn-grey" to="/games">Back to Games</Link>
      </div>

      {/* Scores + Clock */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10 }}>
        <ScoreBox team={away} score={game.away_score || 0} label="AWAY" />
        <div className="card" style={{ padding: 12, textAlign: "center", minWidth: 300 }}>
          <div style={{ fontSize: 32, fontWeight: 800 }}>{clock}</div>
          {/* Controls row horizontally */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 8 }}>
            <button className="btn btn-grey" onClick={() => (running ? stopClock() : startClock())}>
              {running ? "Stop" : "Start"}
            </button>
            <button className="btn btn-grey" onClick={undoLast}>Undo</button>
            <button className="btn btn-grey" onClick={swapSides}>Swap Sides</button>
            <button className="btn btn-grey" onClick={clearOnIce}>Clear On-Ice</button>
            <button className="btn btn-grey" onClick={resetClock}>Reset</button>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
            <span className="muted">Period</span>
            <input className="input" type="number" min={1} step={1} value={period}
              onChange={(e) => setPeriod(clamp(parseInt(e.target.value || "1", 10), 1, 9))}
              style={{ width: 70 }} />
            <span className="muted">Len</span>
            <input className="input" type="number" min={1} max={30} value={periodLen}
              onChange={(e) => setPeriodLen(clamp(parseInt(e.target.value || "15", 10), 1, 30))}
              style={{ width: 70 }} />
            <span className="muted">min</span>
          </div>
        </div>
        <ScoreBox team={home} score={game.home_score || 0} label="HOME" />
      </div>

      {/* Benches + Rink */}
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 160px", gap: 10, marginTop: 10 }}>
        <Bench title={away.short_name || away.name} players={dressedAway} color={awayColor} />
        <div
          style={rinkS}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropOnRink}
        >
          {/* Yellow board stripes + center line */}
          <div style={yl({ top: 0 })} />
          <div style={yl({ bottom: 0 })} />
          <div style={yl({ top: "50%", translateY: "-50%" })} />

          {/* Goal creases (yellow) */}
          <GoalCrease top flipped={flip} onDrop={(e) => handleDropOnGoal(e, flip ? "awayNet" : "homeNet")} />
          <GoalCrease bottom flipped={flip} onDrop={(e) => handleDropOnGoal(e, flip ? "homeNet" : "awayNet")} />

          {/* Goalie pickers near creases */}
          <GoaliePicker
            position={flip ? "bottom" : "top"}
            team={home}
            value={goalieOnIce[home.id] || ""}
            options={dressedHome.filter((p) => (p.position || "").toLowerCase().includes("g"))}
            onChange={(pid) => setGoalieOnIce((m) => ({ ...m, [home.id]: Number(pid) || "" }))}
          />
          <GoaliePicker
            position={flip ? "top" : "bottom"}
            team={away}
            value={goalieOnIce[away.id] || ""}
            options={dressedAway.filter((p) => (p.position || "").toLowerCase().includes("g"))}
            onChange={(pid) => setGoalieOnIce((m) => ({ ...m, [away.id]: Number(pid) || "" }))}
          />

          {/* On-ice tokens */}
          {onIce.map((t) => {
            const p = (t.team_id === home.id ? dressedHome : dressedAway).find((pp) => pp.id === t.id);
            const col = t.team_id === home.id ? homeColor : awayColor;
            return (
              <IceToken
                key={`${t.team_id}-${t.id}`}
                player={p || { id: t.id, number: "•" }}
                teamId={t.team_id}
                x={t.x}
                y={t.y}
                color={col}
                onDragEnd={(nx, ny) => setOnIce((cur) => cur.map((it) => (it.id === t.id ? { ...it, x: nx, y: ny } : it)))}
                onSendToBench={() => removeFromIce(t.id)}
              />
            );
          })}
        </div>
        <Bench title={home.short_name || home.name} players={dressedHome} color={homeColor} />
      </div>

      {/* Events */}
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 700, paddingBottom: 6 }}>Events</div>
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
              <tr><td colSpan={5} style={{ padding: 10, color: "#8a8a8a" }}>—</td></tr>
            )}
            {rows.map((r, idx) => {
              if (r.goal) {
                const asst = r.assists.map((a) => a.players?.name || (a.players?.number ? `#${a.players.number}` : "—")).join(", ");
                return (
                  <tr key={`g${idx}`} style={{ borderTop: "1px solid #f2f2f2" }}>
                    <td style={{ padding: 8 }}>{r.goal.period}</td>
                    <td style={{ padding: 8 }}>{r.goal.time_mmss}</td>
                    <td style={{ padding: 8 }}>{r.goal.teams?.short_name || r.goal.teams?.name || ""}</td>
                    <td style={{ padding: 8 }}>goal</td>
                    <td style={{ padding: 8 }}>
                      <strong>{r.goal.players?.name || (r.goal.players?.number ? `#${r.goal.players.number}` : "—")}</strong>
                      {asst && <span style={{ color: "#666" }}> (A: {asst})</span>}
                    </td>
                  </tr>
                );
              }
              const e = r.single;
              return (
                <tr key={`o${e.id}`} style={{ borderTop: "1px solid #f2f2f2" }}>
                  <td style={{ padding: 8 }}>{e.period}</td>
                  <td style={{ padding: 8 }}>{e.time_mmss}</td>
                  <td style={{ padding: 8 }}>{e.teams?.short_name || e.teams?.name || ""}</td>
                  <td style={{ padding: 8 }}>{e.event}</td>
                  <td style={{ padding: 8 }}>{e.players?.name || (e.players?.number ? `#${e.players.number}` : "—")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Goal confirm modal */}
      {goalPick && (
        <div style={modalWrapS}>
          <div className="card" style={{ width: 520, maxWidth: "calc(100vw - 24px)" }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Confirm Goal</div>
            <div className="muted" style={{ marginBottom: 8 }}>
              {(home.id === goalPick.team_id ? (home.short_name || home.name) : (away.short_name || away.name))} • {clock} • Period {period}
            </div>
            <div style={{ marginBottom: 8 }}>
              <div className="muted">Scorer</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>
                {displayPlayer(goalPick.scorer, goalPick.team_id, dressedHome, dressedAway)}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div className="muted">Assist 1</div>
                <select className="input" value={assist1} onChange={(e) => setAssist1(e.target.value)}>
                  <option value="">—</option>
                  {assistChoices.map((p) => (
                    <option key={p.id} value={p.id}>{p.number ? `#${p.number} ` : ""}{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="muted">Assist 2</div>
                <select className="input" value={assist2} onChange={(e) => setAssist2(e.target.value)}>
                  <option value="">—</option>
                  {assistChoices.map((p) => (
                    <option key={p.id} value={p.id}>{p.number ? `#${p.number} ` : ""}{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button className="btn btn-grey" onClick={() => setGoalPick(null)}>Cancel</button>
              <button className="btn btn-blue" onClick={confirmGoal}>Confirm Goal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================== components ========================== */

function ScoreBox({ team, score, label }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontSize: 14, color: "#667" }}>{team?.short_name || team?.name}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 28 }}>{score}</div>
        <span className="muted">{label}</span>
      </div>
    </div>
  );
}

function Bench({ title, players, color }) {
  const txt = textOn(color);
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {players.map((p) => (
          <div
            key={p.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ id: p.id, team_id: (p.team_id || 0) }))}
            className="chip"
            style={{
              width: 54,
              height: 54,
              borderRadius: 999,
              background: color,
              color: txt,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 18,
              cursor: "grab",
              boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
            }}
            title={`Drag #${p.number ?? "?"} onto the rink`}
          >
            {p.number ?? "•"}
          </div>
        ))}
      </div>
    </div>
  );
}

function IceToken({ player, teamId, x, y, color, onDragEnd, onSendToBench }) {
  const ref = useRef(null);
  function onDragStart(e) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ id: player.id, team_id: teamId }));
  }
  function onDragEndHandler(e) {
    const parent = ref.current?.parentElement?.getBoundingClientRect();
    if (!parent) return;
    const nx = clamp(((e.clientX - parent.left) / parent.width) * 100, 0, 100);
    const ny = clamp(((e.clientY - parent.top) / parent.height) * 100, 0, 100);
    onDragEnd(+nx.toFixed(2), +ny.toFixed(2));
  }
  return (
    <div
      ref={ref}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEndHandler}
      onDoubleClick={onSendToBench}
      style={{
        position: "absolute",
        left: `calc(${x}% - 22px)`,
        top: `calc(${y}% - 22px)`,
        width: 44,
        height: 44,
        borderRadius: 999,
        background: color,
        color: textOn(color),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: 18,
        cursor: "grab",
        boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
      }}
      title="Drag to move • Double-tap to send back to bench"
    >
      {player.number ?? "•"}
    </div>
  );
}

function GoalCrease({ top, bottom, flipped, onDrop }) {
  const place =
    top ? (flipped ? { bottom: "6%" } : { top: "6%" }) : bottom ? (flipped ? { top: "6%" } : { bottom: "6%" }) : {};
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      title="Drop scorer here to arm a goal"
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        width: "20%",
        height: "14%",
        borderRadius: 12,
        border: "3px solid #ffd400",
        background: "rgba(255,212,0,0.10)",
        ...place,
      }}
    />
  );
}

function GoaliePicker({ position, team, value, options, onChange }) {
  const place = position === "top" ? { top: 10, left: 10 } : { bottom: 10, right: 10 };
  return (
    <div style={{ position: "absolute", ...place }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{team.short_name || team.name} Goalie</div>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((g) => (
          <option value={g.id} key={g.id}>{g.number ? `#${g.number} ` : ""}{g.name}</option>
        ))}
      </select>
    </div>
  );
}

function displayPlayer(pid, teamId, benchHome, benchAway) {
  const src =
    benchHome.find((p) => p.id === pid) ? benchHome :
    benchAway.find((p) => p.id === pid) ? benchAway : [];
  const p = src.find((pp) => pp.id === pid);
  if (!p) return `#${pid}`;
  return `${p.number ? `#${p.number} ` : ""}${p.name}`;
}

/* overlays */
const modalWrapS = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 12,
  zIndex: 50,
};

// yellow line helper
function yl({ top, bottom, translateY }) {
  const base = {
    position: "absolute",
    left: 0,
    width: "100%",
    height: 10,
    background: "#ffd400",
    opacity: 0.9,
  };
  if (top !== undefined) return { ...base, top };
  if (bottom !== undefined) return { ...base, bottom };
  return { ...base, top, transform: `translateY(${translateY || 0})` };
}
