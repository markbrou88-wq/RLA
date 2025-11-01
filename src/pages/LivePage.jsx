// src/pages/LivePage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

// ---------- tiny utils ----------
const pad2 = (n) => String(n).padStart(2, "0");
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const msToMMSS = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${pad2(mm)}:${pad2(ss)}`;
};
const mmssToMs = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
  if (!m) return 0;
  return (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000;
};

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
      .update({
        goalie_shots_against: Math.max(0, (data.goalie_shots_against || 0) + deltaSA),
      })
      .eq("id", data.id);
  }
}

function colorForTeam(team) {
  const n = (team?.short_name || team?.name || "").toLowerCase();
  if (n.includes("black") || n.includes("rln")) return "#111111"; // RLN
  if (n.includes("blue") || n.includes("rlb")) return "#2d7ef7";  // RLB
  if (n.includes("red")  || n.includes("rlr")) return "#ff2a2a";  // RLR
  return "#444";
}
const textOn = (hex) => "#fff";

// ---------- page ----------
export default function LivePage() {
  const { slug } = useParams();

  const [game, setGame] = useState(null);
  const [home, setHome] = useState(null);
  const [away, setAway] = useState(null);

  const [dressedHome, setDressedHome] = useState([]);
  const [dressedAway, setDressedAway] = useState([]);

  // goalie on ice {teamId: playerId}
  const [goalieOnIce, setGoalieOnIce] = useState({});

  // on-ice tokens: [{id, team_id, x, y}]
  const [onIce, setOnIce] = useState([]);

  // clock
  const [period, setPeriod] = useState(1);
  const [periodLen, setPeriodLen] = useState(15);
  const [clock, setClock] = useState("15:00");
  const [running, setRunning] = useState(false);
  const tickRef = useRef(null);
  const lastRef = useRef(null);

  // stamped time for next event
  const [stamped, setStamped] = useState("");

  // events (grouped)
  const [rows, setRows] = useState([]);
  const [lastGroupIds, setLastGroupIds] = useState([]);

  // pending goal modal
  const [goalPick, setGoalPick] = useState(null);
  const [assist1, setAssist1] = useState("");
  const [assist2, setAssist2] = useState("");

  useEffect(() => {
    let dead = false;
    (async () => {
      const { data: g } = await supabase.from("games").select("*").eq("slug", slug).single();
      if (!g) return;
      const [{ data: ht }, { data: at }] = await Promise.all([
        supabase.from("teams").select("*").eq("id", g.home_team_id).single(),
        supabase.from("teams").select("*").eq("id", g.away_team_id).single(),
      ]);

      const [{ data: hRoster }, { data: aRoster }] = await Promise.all([
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
      setHome(ht);
      setAway(at);
      setDressedHome((hRoster || []).map((r) => r.players).sort((a,b)=> (a.number||0)-(b.number||0)));
      setDressedAway((aRoster || []).map((r) => r.players).sort((a,b)=> (a.number||0)-(b.number||0)));
      setClock(msToMMSS((g.period_seconds || 15 * 60) * 1000));
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

    // group goal + assists
    const key = (e) => `${e.period}|${e.time_mmss}|${e.team_id}|goal`;
    const goals = new Map();
    for (const e of ev || []) if (e.event === "goal") goals.set(key(e), { goal: e, assists: [] });
    for (const e of ev || []) if (e.event === "assist" && goals.has(key(e))) goals.get(key(e)).assists.push(e);
    const others = (ev || []).filter((e) => e.event !== "goal" && e.event !== "assist");
    const r = [...goals.values(), ...others.map((o) => ({ single: o }))];
    r.sort((a, b) => {
      const aP = a.goal ? a.goal.period : a.single.period;
      const bP = b.goal ? b.goal.period : b.single.period;
      if (aP !== bP) return aP - bP;
      const aT = a.goal ? a.goal.time_mmss : a.single.time_mmss;
      const bT = b.goal ? b.goal.time_mmss : b.single.time_mmss;
      return bT.localeCompare(aT);
    });
    setRows(r);
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

  // drag/drop
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

  // fixed nets: top = away, bottom = home
  function onDropTopNet(e) {
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
    if (!data.id) return;
    if (data.team_id !== away.id) return; // scorer must be away for top net
    setGoalPick({ scorer: data.id, team_id: away.id, net: "top" });
    if (!stamped) setStamped(clock);
    setAssist1("");
    setAssist2("");
  }
  function onDropBottomNet(e) {
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
    if (!data.id) return;
    if (data.team_id !== home.id) return; // scorer must be home for bottom net
    setGoalPick({ scorer: data.id, team_id: home.id, net: "bottom" });
    if (!stamped) setStamped(clock);
    setAssist1("");
    setAssist2("");
  }

  // confirm goal at stamped or current time
  async function confirmGoal() {
    if (!goalPick) return;
    const tm = (stamped || clock).trim();
    const per = Number(period) || 1;
    const tId = Number(goalPick.team_id);

    const groupIds = [];
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

    // update score
    const isHome = tId === home.id;
    await supabase
      .from("games")
      .update(isHome ? { home_score: (game.home_score || 0) + 1 } : { away_score: (game.away_score || 0) + 1 })
      .eq("id", game.id);

    // bump opponent goalie SA
    const oppTeam = isHome ? away.id : home.id;
    const oppGoalie = goalieOnIce[oppTeam];
    if (oppGoalie) {
      await bumpGoalieSA({ game_id: game.id, team_id: oppTeam, player_id: oppGoalie, deltaSA: 1 });
    }

    setGoalPick(null);
    setLastGroupIds(groupIds);
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

  // delete (row-level or grouped for a goal)
  async function deleteRow(r) {
    if (r.goal) {
      const per = r.goal.period;
      const tm = r.goal.time_mmss;
      const tid = r.goal.team_id;
      const ids = [r.goal.id, ...r.assists.map((a) => a.id)];
      await supabase.from("events").delete().in("id", ids);
      const isHome = tid === home.id;
      await supabase
        .from("games")
        .update(isHome ? { home_score: Math.max(0, (game.home_score || 0) - 1) } : { away_score: Math.max(0, (game.away_score || 0) - 1) })
        .eq("id", game.id);
      const oppTeam = isHome ? away.id : home.id;
      const oppGoalie = goalieOnIce[oppTeam];
      if (oppGoalie) await bumpGoalieSA({ game_id: game.id, team_id: oppTeam, player_id: oppGoalie, deltaSA: -1 });
    } else if (r.single) {
      await supabase.from("events").delete().eq("id", r.single.id);
    }
  }

  const assistChoices = useMemo(() => {
    if (!goalPick) return [];
    const src = goalPick.team_id === home?.id ? dressedHome : dressedAway;
    return onIce
      .filter((t) => t.team_id === goalPick.team_id && t.id !== goalPick.scorer)
      .map((t) => src.find((p) => p.id === t.id) || { id: t.id, name: `#${t.id}` });
  }, [goalPick, onIce, dressedHome, dressedAway, home?.id]);

  if (!game || !home || !away) return null;

  const homeColor = colorForTeam(home);
  const awayColor = colorForTeam(away);

  // unified heights
  const RINK_HEIGHT = 560; // px

  return (
    <div className="container">
      {/* Top links */}
      <div className="button-group" style={{ marginBottom: 8 }}>
        <Link className="btn btn-grey" to={`/games/${slug}/roster`}>Roster</Link>
        <Link className="btn btn-grey" to={`/games/${slug}`}>Boxscore</Link>
        <Link className="btn btn-grey" to="/games">Back to Games</Link>
      </div>

      {/* Score header */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
        <TeamScoreCard team={away} score={game.away_score || 0} align="left" />
        <ClockBlock
          running={running}
          clock={clock}
          onClockChange={(v) => setClock(v)}
          onStart={() => (running ? stopClock() : startClock())}
          onReset={resetClock}
          period={period}
          setPeriod={(v) => setPeriod(clamp(v, 1, 9))}
          len={periodLen}
          setLen={(v) => setPeriodLen(clamp(v, 1, 30))}
          stamped={stamped}
          onStamp={() => setStamped(clock)}
          onClearStamp={() => setStamped("")}
          onUndo={undoLast}
        />
        <TeamScoreCard team={home} score={game.home_score || 0} align="right" />
      </div>

      {/* Benches + Rink */}
      <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 170px", gap: 12, marginTop: 10 }}>
        <Bench title={away.short_name || away.name} players={dressedAway} color={awayColor} height={RINK_HEIGHT} />
        <Rink
          height={RINK_HEIGHT}
          onDropRink={handleDropOnRink}
          onDropTopNet={onDropTopNet}
          onDropBottomNet={onDropBottomNet}
          home={home}
          away={away}
          dressedHome={dressedHome}
          dressedAway={dressedAway}
          onIce={onIce}
          setOnIce={setOnIce}
          goalieOnIce={goalieOnIce}
          setGoalieOnIce={setGoalieOnIce}
          homeColor={homeColor}
          awayColor={awayColor}
          removeFromIce={removeFromIce}
        />
        <Bench title={home.short_name || home.name} players={dressedHome} color={homeColor} height={RINK_HEIGHT} />
      </div>

      {/* Events table */}
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
              <th style={{ padding: 8 }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 10, color: "#8a8a8a" }}>—</td></tr>
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
                    <td style={{ padding: 8, textAlign: "right" }}>
                      <button className="btn btn-grey" onClick={() => deleteRow(r)}>Delete</button>
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
                  <td style={{ padding: 8, textAlign: "right" }}>
                    <button className="btn btn-grey" onClick={() => deleteRow(r)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Goal confirm */}
      {goalPick && (
        <div style={modalWrapS}>
          <div className="card" style={{ width: 520, maxWidth: "calc(100vw - 24px)" }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Confirm Goal</div>
            <div className="muted" style={{ marginBottom: 8 }}>
              {(home.id === goalPick.team_id ? (home.short_name || home.name) : (away.short_name || away.name))} • {(stamped || clock)} • Period {period}
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

/* ---------- sub-components ---------- */

function TeamScoreCard({ team, score, align = "left" }) {
  return (
    <div className="card" style={{ padding: 10, display: "flex", alignItems: "center", gap: 10, justifyContent: align === "left" ? "flex-start" : "flex-end" }}>
      {align === "left" && <TeamLogo team={team} />}
      <div style={{ fontSize: 28, fontWeight: 800, padding: "6px 14px", borderRadius: 10, background: "#0d2a66", color: "#fff", minWidth: 60, textAlign: "center" }}>
        {score}
      </div>
      {align === "right" && <TeamLogo team={team} />}
    </div>
  );
}

function TeamLogo({ team }) {
  const name = team?.short_name || team?.name || "";
  const src = team?.logo_url || "";
  return src ? (
    <img src={src} alt={name} style={{ width: 52, height: 52, objectFit: "contain" }} />
  ) : (
    <div style={{ width: 52, height: 52, borderRadius: 12, background: "#f2f5ff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
      {name.split(" ").map((w) => w[0]).join("").slice(0, 3)}
    </div>
  );
}

function ClockBlock({
  running, clock, onClockChange, onStart, onReset,
  period, setPeriod, len, setLen,
  stamped, onStamp, onClearStamp, onUndo
}) {
  return (
    <div className="card" style={{ padding: 12, textAlign: "center", minWidth: 320 }}>
      <input
        className="input"
        value={clock}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d:]/g, "");
          onClockChange(v);
        }}
        style={{ fontWeight: 800, fontSize: 36, textAlign: "center" }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 8 }}>
        <button className="btn btn-grey" onClick={onStart}>{running ? "Stop" : "Start"}</button>
        <button className="btn btn-grey" onClick={onUndo}>Undo</button>
        <button className="btn btn-grey" onClick={onStamp}>Stamp</button>
        {stamped && <span className="chip" style={{ background: "#e8f0ff" }}>Stamped {stamped} <button onClick={onClearStamp} className="link" style={{ marginLeft: 6 }}>×</button></span>}
        <button className="btn btn-grey" onClick={onReset}>Reset</button>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
        <span className="muted">Period</span>
        <input className="input" type="number" min={1} step={1} value={period} onChange={(e) => setPeriod(parseInt(e.target.value || "1", 10))} style={{ width: 70 }} />
        <span className="muted">Len</span>
        <input className="input" type="number" min={1} max={30} value={len} onChange={(e) => setLen(parseInt(e.target.value || "15", 10))} style={{ width: 70 }} />
        <span className="muted">min</span>
      </div>
    </div>
  );
}

function Bench({ title, players, color, height = 560 }) {
  const txt = textOn(color);
  return (
    <div className="card" style={{ height }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 8, overflow: "auto", height: height - 48 }}>
        {players.map((p) => (
          <div
            key={p.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ id: p.id, team_id: p.team_id || 0 }))}
            className="chip"
            style={{
              width: 54, height: 54, borderRadius: 999,
              background: color, color: txt,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: 18, cursor: "grab",
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

function Rink({
  height, onDropRink, onDropTopNet, onDropBottomNet,
  home, away, dressedHome, dressedAway, onIce, setOnIce,
  goalieOnIce, setGoalieOnIce, homeColor, awayColor, removeFromIce
}) {
  return (
    <div
      style={{
        position: "relative",
        height,
        borderRadius: 16,
        border: "1px solid #d6e2ff",
        overflow: "hidden",
        background: `repeating-linear-gradient(0deg,#1b5fd6,#1b5fd6 10px,#1a59ca 10px,#1a59ca 20px)`,
        boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.05)",
        userSelect: "none",
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropRink}
    >
      {/* yellow lines */}
      <div style={{ position: "absolute", left: 0, right: 0, height: 10, background: "#ffd400", top: 0 }} />
      <div style={{ position: "absolute", left: 0, right: 0, height: 10, background: "#ffd400", bottom: 0 }} />
      <div style={{ position: "absolute", left: 0, right: 0, height: 10, background: "#ffd400", top: "50%", transform: "translateY(-50%)" }} />

      {/* creases */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDropTopNet}
        title="Drop scorer here (AWAY net)"
        style={{
          position: "absolute", left: "50%", transform: "translateX(-50%)",
          width: "26%", height: "14%", top: "5%",
          borderRadius: 12, border: "3px solid #ffd400", background: "rgba(255,212,0,0.10)",
        }}
      />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDropBottomNet}
        title="Drop scorer here (HOME net)"
        style={{
          position: "absolute", left: "50%", transform: "translateX(-50%)",
          width: "26%", height: "14%", bottom: "5%",
          borderRadius: 12, border: "3px solid #ffd400", background: "rgba(255,212,0,0.10)",
        }}
      />

      {/* goalie pickers */}
      <div style={{ position: "absolute", top: 10, left: 10 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{away.short_name || away.name} Goalie</div>
        <select className="input" value={goalieOnIce[away.id] || ""} onChange={(e) => setGoalieOnIce((m) => ({ ...m, [away.id]: Number(e.target.value) || "" }))}>
          <option value="">—</option>
          {dressedAway.filter((p) => (p.position || "").toLowerCase().includes("g")).map((g) => (
            <option key={g.id} value={g.id}>{g.number ? `#${g.number} ` : ""}{g.name}</option>
          ))}
        </select>
      </div>
      <div style={{ position: "absolute", bottom: 10, right: 10 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{home.short_name || home.name} Goalie</div>
        <select className="input" value={goalieOnIce[home.id] || ""} onChange={(e) => setGoalieOnIce((m) => ({ ...m, [home.id]: Number(e.target.value) || "" }))}>
          <option value="">—</option>
          {dressedHome.filter((p) => (p.position || "").toLowerCase().includes("g")).map((g) => (
            <option key={g.id} value={g.id}>{g.number ? `#${g.number} ` : ""}{g.name}</option>
          ))}
        </select>
      </div>

      {/* on-ice tokens */}
      {onIce.map((t) => {
        const src = t.team_id === home.id ? dressedHome : dressedAway;
        const p = src.find((pp) => pp.id === t.id);
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
        position: "absolute", left: `calc(${x}% - 22px)`, top: `calc(${y}% - 22px)`,
        width: 44, height: 44, borderRadius: 999, background: color, color: textOn(color),
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: 18, cursor: "grab", boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
      }}
      title="Drag to move • Double-click to send back to bench"
    >{player.number ?? "•"}</div>
  );
}

function displayPlayer(pid, teamId, benchHome, benchAway) {
  const src = teamId === (benchHome[0]?.team_id) ? benchHome : benchAway;
  const p = src.find((pp) => pp.id === pid) || benchHome.find(p=>p.id===pid) || benchAway.find(p=>p.id===pid);
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
