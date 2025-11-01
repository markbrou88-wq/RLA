// src/pages/LivePage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient.js";

/* ========================== helpers ========================== */

// time helpers
const pad2 = (n) => String(n).padStart(2, "0");
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function msToMMSS(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${pad2(mm)}:${pad2(ss)}`;
}
function mmssToMs(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || "");
  if (!m) return 0;
  return (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000;
}

// group goal+assists for display
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
    return bT.localeCompare(aT); // descending time within period
  });
  return rows;
}

// bump goalie SA (and later GA if you add a column) in game_stats
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

/* ========================== main page ========================== */

export default function LivePage() {
  const { slug } = useParams();

  // game + teams
  const [game, setGame] = useState(null);
  const [home, setHome] = useState(null);
  const [away, setAway] = useState(null);

  // players
  const [dressedHome, setDressedHome] = useState([]);
  const [dressedAway, setDressedAway] = useState([]);

  // goalie on ice per team id
  const [goalieOnIce, setGoalieOnIce] = useState({}); // { [teamId]: playerId }

  // on-ice tokens (UI only): {id, team_id, x%, y%}
  const [onIce, setOnIce] = useState([]); // not persisted; visual state

  // rink orientation (false = default; true = swapped)
  const [flip, setFlip] = useState(false);

  // clock/period
  const [period, setPeriod] = useState(1);
  const [periodLen, setPeriodLen] = useState(15); // minutes
  const [clock, setClock] = useState("15:00");
  const [running, setRunning] = useState(false);
  const tickRef = useRef(null);
  const lastRef = useRef(null);

  // events/render
  const [rows, setRows] = useState([]);
  const [lastGroupIds, setLastGroupIds] = useState([]); // for undo

  // goal composer popup
  const [goalPick, setGoalPick] = useState(null); // { scorer, team_id, side: 'home'|'away' }
  const [assist1, setAssist1] = useState("");
  const [assist2, setAssist2] = useState("");

  // load game+teams+dressed
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

      setClock(msToMMSS((g.period_seconds || periodLen * 60) * 1000)); // fallback to UI len
      await refreshEvents(g.id);
    })();
    return () => {
      dead = true;
      clearInterval(tickRef.current);
    };
  }, [slug]);

  // realtime updates
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
        teams!events_team_id_fkey ( id, short_name )
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

  // benches
  const benchHome = dressedHome;
  const benchAway = dressedAway;

  // helpers
  const teamShort = (tid) =>
    tid === home?.id ? home?.short_name || home?.name : tid === away?.id ? away?.short_name || away?.name : "";

  function otherTeamId(tid) {
    if (!home || !away) return null;
    return Number(tid) === home.id ? away.id : home.id;
  }

  // drag / drop
  function handleDropOnRink(e) {
    e.preventDefault();
    const data = e.dataTransfer.getData("text/plain");
    if (!data) return;
    const payload = JSON.parse(data); // {id, team_id, from:'bench'|'ice'}
    const rect = e.currentTarget.getBoundingClientRect();
    // compute % coords with flip consideration
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

  // goal zones (top/bottom depending on flip)
  function handleDropOnGoal(e, which) {
    e.preventDefault();
    const data = e.dataTransfer.getData("text/plain");
    if (!data) return;
    const payload = JSON.parse(data); // token
    // which: 'homeNet' or 'awayNet' (net the token is dropped INTO)
    // If token is Home and dropped into Away net => home scored
    const isHomeScorer = payload.team_id === home.id && which === "awayNet";
    const isAwayScorer = payload.team_id === away.id && which === "homeNet";
    if (!isHomeScorer && !isAwayScorer) return; // ignore

    const side = isHomeScorer ? "home" : "away";
    setGoalPick({
      scorer: payload.id,
      team_id: payload.team_id,
      side,
    });
    setAssist1("");
    setAssist2("");
  }

  async function confirmGoal() {
    if (!goalPick) return;
    const groupIds = [];
    const tm = clock;
    const per = Number(period) || 1;
    const tId = Number(goalPick.team_id);

    // write goal
    const { data: gRow, error: e1 } = await supabase
      .from("events")
      .insert([{ game_id: game.id, team_id: tId, player_id: goalPick.scorer, period: per, time_mmss: tm, event: "goal" }])
      .select()
      .single();
    if (e1) return alert(e1.message);
    groupIds.push(gRow.id);

    // assists
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

    // bump score
    const isHome = tId === home.id;
    const update = isHome
      ? { home_score: (game.home_score || 0) + 1 }
      : { away_score: (game.away_score || 0) + 1 };
    await supabase.from("games").update(update).eq("id", game.id);

    // credit SA to opposing goalie on ice
    const oppTeam = otherTeamId(tId);
    const oppGoalie = goalieOnIce[oppTeam];
    if (oppGoalie) {
      await bumpGoalieSA({ game_id: game.id, team_id: oppTeam, player_id: oppGoalie, deltaSA: 1 });
    }

    setLastGroupIds(groupIds);
    setGoalPick(null);
  }

  async function undoLast() {
    if (lastGroupIds.length === 0) return;
    // fetch the events to know if a goal existed
    const { data: evts } = await supabase.from("events").select("*").in("id", lastGroupIds);
    // delete them
    await supabase.from("events").delete().in("id", lastGroupIds);
    // if goal was part of group, decrement score
    const goalEvt = evts.find((e) => e.event === "goal");
    if (goalEvt) {
      const isHome = goalEvt.team_id === home.id;
      await supabase
        .from("games")
        .update(isHome ? { home_score: Math.max(0, (game.home_score || 0) - 1) } : { away_score: Math.max(0, (game.away_score || 0) - 1) })
        .eq("id", game.id);
      // optional: reduce SA for opp goalie (best-effort)
      const oppTeam = otherTeamId(goalEvt.team_id);
      const oppGoalie = goalieOnIce[oppTeam];
      if (oppGoalie) {
        await bumpGoalieSA({ game_id: game.id, team_id: oppTeam, player_id: oppGoalie, deltaSA: -1 });
      }
    }
    setLastGroupIds([]);
  }

  function clearOnIce() {
    setOnIce([]);
  }

  function swapSides() {
    setFlip((f) => !f);
  }

  // assist candidates = on-ice teammates excluding scorer
  const assistChoices = useMemo(() => {
    if (!goalPick) return [];
    return onIce
      .filter((t) => t.team_id === goalPick.team_id && t.id !== goalPick.scorer)
      .map((t) => {
        const p =
          (t.team_id === home?.id ? benchHome : benchAway).find((pp) => pp.id === t.id) || { id: t.id, name: "#" + t.id };
        return p;
      });
  }, [goalPick, onIce, benchHome, benchAway, home?.id]);

  if (!game || !home || !away) return null;

  // CSS helpers
  const rinkS = {
    position: "relative",
    background:
      "radial-gradient(transparent 50%, rgba(0,0,0,0.02) 51%), linear-gradient(#e9f1ff 0 0)",
    backgroundSize: "8px 8px, cover",
    borderRadius: 16,
    border: "1px solid #d6e2ff",
    height: 480,
    userSelect: "none",
    overflow: "hidden",
  };

  return (
    <div className="container">
      {/* Nav */}
      <div className="button-group" style={{ marginBottom: 10 }}>
        <Link className="btn btn-grey" to={`/games/${slug}/roster`}>Roster</Link>
        <Link className="btn btn-grey" to={`/games/${slug}`}>Boxscore</Link>
        <Link className="btn btn-grey" to="/games">Back to Games</Link>
      </div>

      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10, marginBottom: 10 }}>
        {/* Away score box */}
        <ScoreBox team={away} score={game.away_score || 0} label="AWAY" />
        {/* Clock */}
        <div className="card" style={{ padding: 12, textAlign: "center", minWidth: 260 }}>
          <div style={{ fontSize: 32, fontWeight: 800 }}>{clock}</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8 }}>
            <button className="btn btn-grey" onClick={startClock} disabled={running}>Start</button>
            <button className="btn btn-grey" onClick={stopClock} disabled={!running}>Stop</button>
            <button className="btn btn-grey" onClick={resetClock}>Reset</button>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
            <span className="muted">Period</span>
            <input
              className="input"
              type="number"
              min={1}
              step={1}
              value={period}
              onChange={(e) => setPeriod(clamp(parseInt(e.target.value || "1", 10), 1, 9))}
              style={{ width: 70 }}
            />
            <span className="muted">Len</span>
            <input
              className="input"
              type="number"
              min={1}
              max={30}
              value={periodLen}
              onChange={(e) => setPeriodLen(clamp(parseInt(e.target.value || "15", 10), 1, 30))}
              style={{ width: 70 }}
            />
            <span className="muted">min</span>
          </div>
        </div>
        {/* Home score box */}
        <ScoreBox team={home} score={game.home_score || 0} label="HOME" />
      </div>

      {/* Play surface block */}
      <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 140px", gap: 10 }}>
        {/* Left bench + rail */}
        <div>
          <ToolRail
            onStartStop={() => (running ? stopClock() : startClock())}
            running={running}
            onUndo={undoLast}
            onSwap={swapSides}
            onClear={clearOnIce}
          />
          <Bench
            title={away.short_name || away.name}
            players={benchAway}
            color="#e74c3c"
            onTokenDragStart={(p) =>
              JSON.stringify({ id: p.id, team_id: away.id, from: "bench" })
            }
          />
        </div>

        {/* Rink */}
        <div
          style={rinkS}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropOnRink}
        >
          {/* goal zones */}
          {/* Top net (y small) */}
          <GoalCrease
            top
            flipped={flip}
            label="G"
            onDrop={(e) => handleDropOnGoal(e, flip ? "awayNet" : "homeNet")}
          />
          {/* Bottom net */}
          <GoalCrease
            bottom
            flipped={flip}
            label="G"
            onDrop={(e) => handleDropOnGoal(e, flip ? "homeNet" : "awayNet")}
          />

          {/* Goalie selects */}
          <GoaliePicker
            position={flip ? "bottom" : "top"}
            team={home}
            value={goalieOnIce[home.id] || ""}
            options={benchHome.filter((p) => (p.position || "").toLowerCase().includes("g"))}
            onChange={(pid) => setGoalieOnIce((m) => ({ ...m, [home.id]: Number(pid) || "" }))}
          />
          <GoaliePicker
            position={flip ? "top" : "bottom"}
            team={away}
            value={goalieOnIce[away.id] || ""}
            options={benchAway.filter((p) => (p.position || "").toLowerCase().includes("g"))}
            onChange={(pid) => setGoalieOnIce((m) => ({ ...m, [away.id]: Number(pid) || "" }))}
          />

          {/* on-ice tokens */}
          {onIce.map((t) => {
            const p =
              (t.team_id === home.id ? benchHome : benchAway).find((pp) => pp.id === t.id) ||
              { id: t.id, name: "#" + t.id };
            return (
              <IceToken
                key={`${t.team_id}-${t.id}`}
                player={p}
                teamId={t.team_id}
                x={t.x}
                y={t.y}
                color={t.team_id === home.id ? "#2d7ef7" : "#e74c3c"}
                onDragEnd={(nx, ny) =>
                  setOnIce((cur) =>
                    cur.map((it) => (it.id === t.id ? { ...it, x: nx, y: ny } : it))
                  )
                }
                onSendToBench={() => removeFromIce(t.id)}
              />
            );
          })}
        </div>

        {/* Right bench */}
        <div>
          <Bench
            title={home.short_name || home.name}
            players={benchHome}
            color="#2d7ef7"
            onTokenDragStart={(p) =>
              JSON.stringify({ id: p.id, team_id: home.id, from: "bench" })
            }
          />
        </div>
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
                const asst = r.assists
                  .map((a) => a.players?.name || (a.players?.number ? `#${a.players.number}` : "—"))
                  .join(", ");
                return (
                  <tr key={`g${idx}`} style={{ borderTop: "1px solid #f2f2f2" }}>
                    <td style={{ padding: 8 }}>{r.goal.period}</td>
                    <td style={{ padding: 8 }}>{r.goal.time_mmss}</td>
                    <td style={{ padding: 8 }}>{r.goal.teams?.short_name || ""}</td>
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
                  <td style={{ padding: 8 }}>{e.teams?.short_name || ""}</td>
                  <td style={{ padding: 8 }}>{e.event}</td>
                  <td style={{ padding: 8 }}>
                    {e.players?.name || (e.players?.number ? `#${e.players.number}` : "—")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Goal popup */}
      {goalPick && (
        <div style={modalWrapS}>
          <div className="card" style={{ width: 520, maxWidth: "calc(100vw - 24px)" }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Confirm Goal</div>
            <div className="muted" style={{ marginBottom: 8 }}>
              {teamShort(goalPick.team_id)} • {clock} • Period {period}
            </div>
            <div style={{ marginBottom: 8 }}>
              <div className="muted">Scorer</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>
                {displayPlayer(goalPick.scorer, goalPick.team_id, benchHome, benchAway)}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div className="muted">Assist 1</div>
                <select className="input" value={assist1} onChange={(e) => setAssist1(e.target.value)}>
                  <option value="">—</option>
                  {assistChoices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.number ? `#${p.number} ` : ""}{p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="muted">Assist 2</div>
                <select className="input" value={assist2} onChange={(e) => setAssist2(e.target.value)}>
                  <option value="">—</option>
                  {assistChoices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.number ? `#${p.number} ` : ""}{p.name}
                    </option>
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

/* ========================== small components ========================== */

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

function ToolRail({ onStartStop, running, onUndo, onSwap, onClear }) {
  const btn = { display: "flex", alignItems: "center", gap: 8, width: "100%", marginBottom: 8 };
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <button className="btn btn-grey" style={btn} onClick={onStartStop}>
        {running ? "Pause ⏸" : "Start ▶"}
      </button>
      <button className="btn btn-grey" style={btn} onClick={onUndo}>Undo ⤺</button>
      <button className="btn btn-grey" style={btn} onClick={onSwap}>Swap Sides ⇄</button>
      <button className="btn btn-grey" style={btn} onClick={onClear}>Clear On-Ice ⌫</button>
    </div>
  );
}

function Bench({ title, players, color, onTokenDragStart }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {players.map((p) => (
          <div
            key={p.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", onTokenDragStart(p))}
            className="chip"
            style={{
              background: "#fff",
              border: `2px solid ${color}`,
              color: "#222",
              cursor: "grab",
            }}
            title={`Drag #${p.number || "?"} ${p.name} onto the rink`}
          >
            {(p.number != null ? `#${p.number} ` : "") + p.name}
          </div>
        ))}
      </div>
    </div>
  );
}

function IceToken({ player, teamId, x, y, color, onDragEnd, onSendToBench }) {
  const ref = useRef(null);
  function onDragStart(e) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ id: player.id, team_id: teamId, from: "ice" }));
    // Set drag image for nicer UX (fallback to default)
  }
  function onDrag(e) {
    // noop
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
      onDrag={onDrag}
      onDragEnd={onDragEndHandler}
      onDoubleClick={onSendToBench}
      style={{
        position: "absolute",
        left: `calc(${x}% - 20px)`,
        top: `calc(${y}% - 20px)`,
        width: 40,
        height: 40,
        borderRadius: 999,
        background: "#fff",
        border: `3px solid ${color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        cursor: "grab",
        boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
      }}
      title="Drag to move • Double-click to send back to bench"
    >
      {player.number ?? "•"}
    </div>
  );
}

function GoalCrease({ top, bottom, flipped, label, onDrop }) {
  const place =
    top ? (flipped ? { bottom: 10 } : { top: 10 }) : bottom ? (flipped ? { top: 10 } : { bottom: 10 }) : {};
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      title="Drop scorer here to arm a goal"
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        width: 160,
        height: 70,
        borderRadius: 12,
        border: "2px dashed #e33",
        background: "rgba(255,0,0,0.05)",
        ...place,
      }}
    />
  );
}

function GoaliePicker({ position, team, value, options, onChange }) {
  const place = position === "top"
    ? { top: 12, left: 12 }
    : { bottom: 12, right: 12 };
  return (
    <div style={{ position: "absolute", ...place }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
        {team.short_name || team.name} Goalie
      </div>
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
  const src = teamId === (benchHome[0]?.team_id ?? -1) ? benchHome : benchAway;
  const p = src.find((pp) => pp.id === pid);
  if (!p) return `#${pid}`;
  return `${p.number ? `#${p.number} ` : ""}${p.name}`;
}

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
