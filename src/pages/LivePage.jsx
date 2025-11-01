import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

/* ---------- utils ---------- */
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
const teamColor = (team) => {
  const n = (team?.short_name || team?.name || "").toLowerCase();
  if (n.includes("black") || n.includes("rln")) return "#111111"; // RLN black
  if (n.includes("blue")  || n.includes("rlb")) return "#2f7bf5";  // RLB blue
  if (n.includes("red")   || n.includes("rlr")) return "#ff2828";  // RLR red
  return "#333";
};
const textOn = () => "#fff";

/* ---------- page ---------- */
export default function LivePage() {
  const { slug } = useParams();

  const [game, setGame] = useState(null);
  const [home, setHome] = useState(null);
  const [away, setAway] = useState(null);

  const [homeDressed, setHomeDressed] = useState([]);
  const [awayDressed, setAwayDressed] = useState([]);

  // goalie selections persisted with game_goalies
  const [goalieOnIce, setGoalieOnIce] = useState({});

  // on-ice tokens: [{id, team_id, x, y}]
  const [onIce, setOnIce] = useState([]);

  // events (grouped)
  const [rows, setRows] = useState([]);

  // clock
  const [period, setPeriod] = useState(1);
  const [lenMin, setLenMin] = useState(15);
  const [clock, setClock] = useState("15:00");
  const [running, setRunning] = useState(false);
  const tickTimer = useRef(null);
  const lastTs = useRef(0);
  const remainingMs = useRef(0);

  // stamped time
  const [stamped, setStamped] = useState("");

  // goal modal
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
      const [{ data: hr }, { data: ar }] = await Promise.all([
        supabase.from("game_rosters").select("players:player_id(id,name,number,position)")
          .eq("game_id", g.id).eq("team_id", g.home_team_id).eq("dressed", true),
        supabase.from("game_rosters").select("players:player_id(id,name,number,position)")
          .eq("game_id", g.id).eq("team_id", g.away_team_id).eq("dressed", true),
      ]);
      const { data: gg } = await supabase
        .from("game_goalies").select("team_id, player_id").eq("game_id", g.id);

      if (dead) return;
      setGame(g);
      setHome(ht);
      setAway(at);
      setHomeDressed((hr || []).map((r) => r.players).sort((a,b)=>(a.number||0)-(b.number||0)));
      setAwayDressed((ar || []).map((r) => r.players).sort((a,b)=>(a.number||0)-(b.number||0)));
      const baseLen = g.period_seconds ? Math.round(g.period_seconds / 60) : 15;
      setLenMin(baseLen);
      setClock(msToMMSS(baseLen * 60 * 1000));
      const map = {};
      (gg || []).forEach((row) => (map[row.team_id] = row.player_id));
      setGoalieOnIce(map);
      await refreshEvents(g.id);
    })();
    return () => { dead = true; clearInterval(tickTimer.current); };
  }, [slug]);

  // realtime events refresh
  useEffect(() => {
    if (!game?.id) return;
    const ch = supabase
      .channel(`rt-live-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => refreshEvents(game.id))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [slug, game?.id]);

  async function refreshEvents(gameId) {
    const { data: ev } = await supabase
      .from("events")
      .select(`
        id, game_id, team_id, player_id, period, time_mmss, event,
        players!events_player_id_fkey ( id, name, number ),
        teams!events_team_id_fkey ( id, name, short_name )
      `)
      .eq("game_id", gameId)
      .order("period", { ascending: true })
      .order("time_mmss", { ascending: false });

    const key = (e) => `${e.period}|${e.time_mmss}|${e.team_id}|goal`;
    const gmap = new Map();
    (ev || []).forEach((e) => { if (e.event === "goal") gmap.set(key(e), { goal:e, assists:[] }); });
    (ev || []).forEach((e) => { if (e.event === "assist" && gmap.has(key(e))) gmap.get(key(e)).assists.push(e); });
    const others = (ev || []).filter((e)=>e.event!=="goal"&&e.event!=="assist").map((single)=>({single}));
    const grouped = [...gmap.values(), ...others].sort((a,b)=>{
      const ap = a.goal ? a.goal.period : a.single.period;
      const bp = b.goal ? b.goal.period : b.single.period;
      if (ap!==bp) return ap-bp;
      const at = a.goal ? a.goal.time_mmss : a.single.time_mmss;
      const bt = b.goal ? b.goal.time_mmss : b.single.time_mmss;
      return bt.localeCompare(at);
    });
    setRows(grouped);
  }

  /* -------- clock -------- */
  function startClock() {
    if (running) return;
    remainingMs.current = mmssToMs(clock);     // start from what’s showing
    lastTs.current = Date.now();
    setRunning(true);
    clearInterval(tickTimer.current);
    tickTimer.current = setInterval(() => {
      const now = Date.now();
      const d = now - lastTs.current;
      lastTs.current = now;
      remainingMs.current = Math.max(0, remainingMs.current - d);
      setClock(msToMMSS(remainingMs.current));
      if (remainingMs.current <= 0) {
        clearInterval(tickTimer.current);
        setRunning(false);
      }
    }, 200);
  }
  function stopClock() {
    clearInterval(tickTimer.current);
    setRunning(false);
  }
  function resetClock() {
    stopClock();
    const ms = (Number(lenMin) || 15) * 60 * 1000;
    remainingMs.current = ms;
    setClock(msToMMSS(ms));
  }

  /* -------- rink drop logic --------
     NOTE: per your request, mapping is INVERTED vs earlier:
       TOP net  -> HOME scorers
       BOTTOM net -> AWAY scorers
  ----------------------------------- */
  function dropOnTopNet(e) {
    e.preventDefault(); e.stopPropagation();
    const payload = readPayload(e);
    if (!payload) return;
    if (payload.team_id !== home.id) return; // top = HOME
    openGoalFor(payload.id, home.id);
  }
  function dropOnBottomNet(e) {
    e.preventDefault(); e.stopPropagation();
    const payload = readPayload(e);
    if (!payload) return;
    if (payload.team_id !== away.id) return; // bottom = AWAY
    openGoalFor(payload.id, away.id);
  }
  function rinkDrop(e) {
    e.preventDefault();
    const payload = readPayload(e);
    if (!payload) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
    setOnIce((cur) => {
      const copy = cur.filter((t) => t.id !== payload.id);
      copy.push({ id: payload.id, team_id: payload.team_id, x:+x.toFixed(2), y:+y.toFixed(2) });
      return copy;
    });
  }
  function readPayload(e) {
    try { const t = JSON.parse(e.dataTransfer.getData("text/plain")||"{}"); return t.id ? t : null; }
    catch { return null; }
  }
  function openGoalFor(playerId, teamId) {
    if (!stamped) setStamped(clock);
    setAssist1(""); setAssist2("");
    setGoalPick({ scorer: playerId, team_id: teamId });
  }

  const assistChoices = useMemo(() => {
    if (!goalPick) return [];
    const src = goalPick.team_id === home?.id ? homeDressed : awayDressed;
    return onIce
      .filter((t) => t.team_id === goalPick.team_id && t.id !== goalPick.scorer)
      .map((t) => src.find((p) => p.id === t.id))
      .filter(Boolean);
  }, [goalPick, onIce, home?.id, homeDressed, awayDressed]);

  async function confirmGoal() {
    if (!goalPick) return;
    const per = Number(period) || 1;
    const tm = (stamped || clock).trim();
    const tid = Number(goalPick.team_id);

    const { error: eg } = await supabase
      .from("events")
      .insert([{ game_id: game.id, team_id: tid, player_id: goalPick.scorer, period: per, time_mmss: tm, event: "goal" }]);
    if (eg) return alert(eg.message);

    for (const a of [assist1, assist2]) {
      if (!a) continue;
      const { error: ea } = await supabase
        .from("events")
        .insert([{ game_id: game.id, team_id: tid, player_id: Number(a), period: per, time_mmss: tm, event: "assist" }]);
      if (ea) return alert(ea.message);
    }

    // update score immediately in local state
    setGame((g) => g ? ({
      ...g,
      home_score: tid === g.home_team_id ? (g.home_score || 0) + 1 : g.home_score,
      away_score: tid === g.home_team_id ? g.away_score : (g.away_score || 0) + 1
    }) : g);

    // also persist
    const isHome = tid === game.home_team_id;
    await supabase.from("games")
      .update(isHome ? { home_score: (game.home_score || 0) + 1 } : { away_score: (game.away_score || 0) + 1 })
      .eq("id", game.id);

    setGoalPick(null);
  }

  async function deleteRow(r) {
    if (r.goal) {
      const ids = [r.goal.id, ...r.assists.map((a) => a.id)];
      await supabase.from("events").delete().in("id", ids);
      // decrease score locally + persist
      const isHome = r.goal.team_id === game.home_team_id;
      setGame((g) => g ? ({
        ...g,
        home_score: isHome ? Math.max(0, (g.home_score || 0) - 1) : g.home_score,
        away_score: isHome ? g.away_score : Math.max(0, (g.away_score || 0) - 1)
      }) : g);
      await supabase.from("games")
        .update(isHome ? { home_score: Math.max(0, (game.home_score || 0) - 1) }
                       : { away_score: Math.max(0, (game.away_score || 0) - 1) })
        .eq("id", game.id);
    } else if (r.single) {
      await supabase.from("events").delete().eq("id", r.single.id);
    }
  }

  // persist goalies
  async function setGoalie(teamId, playerId) {
    setGoalieOnIce((m) => ({ ...m, [teamId]: playerId || "" }));
    const { data: ex } = await supabase
      .from("game_goalies").select("id").eq("game_id", game.id).eq("team_id", teamId).maybeSingle();
    if (ex?.id) {
      await supabase.from("game_goalies").update({ player_id: playerId || null }).eq("id", ex.id);
    } else {
      await supabase.from("game_goalies").insert([{ game_id: game.id, team_id: teamId, player_id: playerId || null }]);
    }
  }

  if (!game || !home || !away) return null;

  const homeColor = teamColor(home);
  const awayColor = teamColor(away);
  const RINK_H = 560;

  return (
    <div className="container">
      <div className="button-group" style={{ marginBottom: 8 }}>
        <Link className="btn btn-grey" to={`/games/${slug}/roster`}>Roster</Link>
        <Link className="btn btn-grey" to={`/games/${slug}`}>Boxscore</Link>
        <Link className="btn btn-grey" to="/games">Back to Games</Link>
      </div>

      {/* header */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center" }}>
        <ScoreCard team={away} score={game.away_score || 0} side="left" />
        <ClockBlock
          running={running}
          clock={clock}
          onClockChange={(v)=>{ setClock(v); remainingMs.current = mmssToMs(v); }}
          onStart={() => (running ? stopClock() : startClock())}
          onReset={resetClock}
          stamped={stamped}
          onStamp={() => setStamped(clock)}
          onClearStamp={() => setStamped("")}
          period={period}
          setPeriod={(v) => setPeriod(clamp(v,1,9))}
          lenMin={lenMin}
          setLenMin={(v)=>setLenMin(clamp(v,1,30))}
        />
        <ScoreCard team={home} score={game.home_score || 0} side="right" />
      </div>

      {/* benches + rink */}
      <div style={{ display: "grid", gridTemplateColumns: "190px 1fr 190px", gap: 12, marginTop: 10 }}>
        <Bench
          title={away.short_name || away.name}
          players={awayDressed}
          color={awayColor}
          height={RINK_H}
          benchTeamId={away.id}
          onDropBack={(pid, teamId) => teamId===away.id && setOnIce((cur)=>cur.filter(t=>t.id!==pid))}
        />
        <Rink
          height={RINK_H}
          onDrop={rinkDrop}
          onDropTopNet={dropOnTopNet}      // HOME on top
          onDropBottomNet={dropOnBottomNet} // AWAY on bottom
          home={home}
          away={away}
          homeDressed={homeDressed}
          awayDressed={awayDressed}
          onIce={onIce}
          setOnIce={setOnIce}
          goalieOnIce={goalieOnIce}
          setGoalie={setGoalie}
          homeColor={homeColor}
          awayColor={awayColor}
        />
        <Bench
          title={home.short_name || home.name}
          players={homeDressed}
          color={homeColor}
          height={RINK_H}
          benchTeamId={home.id}
          onDropBack={(pid, teamId) => teamId===home.id && setOnIce((cur)=>cur.filter(t=>t.id!==pid))}
        />
      </div>

      {/* events */}
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Events</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#666" }}>
              <th style={{ padding: 8 }}>Period</th>
              <th style={{ padding: 8 }}>Time</th>
              <th style={{ padding: 8 }}>Team</th>
              <th style={{ padding: 8 }}>Type</th>
              <th style={{ padding: 8 }}>Player / Assists</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 10, color: "#8a8a8a" }}>—</td></tr>
            )}
            {rows.map((r, i) => {
              if (r.goal) {
                const aTxt = r.assists.map((a)=>a.players?.name || (a.players?.number?`#${a.players.number}`:"—")).join(", ");
                return (
                  <tr key={`g${i}`} style={{ borderTop: "1px solid #f0f0f0" }}>
                    <td style={{ padding: 8 }}>{r.goal.period}</td>
                    <td style={{ padding: 8 }}>{r.goal.time_mmss}</td>
                    <td style={{ padding: 8 }}>{r.goal.teams?.short_name || r.goal.teams?.name || ""}</td>
                    <td style={{ padding: 8 }}>goal</td>
                    <td style={{ padding: 8 }}>
                      <strong>{r.goal.players?.name || (r.goal.players?.number?`#${r.goal.players.number}`:"—")}</strong>
                      {aTxt && <span style={{ color:"#666" }}> (A: {aTxt})</span>}
                    </td>
                    <td style={{ padding: 8, textAlign: "right" }}>
                      <button className="btn btn-grey" onClick={() => deleteRow(r)}>Delete</button>
                    </td>
                  </tr>
                );
              }
              const e = r.single;
              return (
                <tr key={`o${e.id}`} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: 8 }}>{e.period}</td>
                  <td style={{ padding: 8 }}>{e.time_mmss}</td>
                  <td style={{ padding: 8 }}>{e.teams?.short_name || e.teams?.name || ""}</td>
                  <td style={{ padding: 8 }}>{e.event}</td>
                  <td style={{ padding: 8 }}>{e.players?.name || (e.players?.number?`#${e.players.number}`:"—")}</td>
                  <td style={{ padding: 8, textAlign: "right" }}>
                    <button className="btn btn-grey" onClick={() => deleteRow(r)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* confirm goal */}
      {goalPick && (
        <Modal>
          <div className="card" style={{ width: 520, maxWidth: "calc(100vw - 24px)" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Confirm Goal</div>
            <div className="muted" style={{ marginBottom: 8 }}>
              {(goalPick.team_id === home.id ? (home.short_name || home.name) : (away.short_name || away.name))}
              {" • "}{(stamped || clock)} • Period {period}
            </div>
            <div style={{ marginBottom: 10 }}>
              <div className="muted">Scorer</div>
              <div style={{ fontWeight: 700, marginTop: 2 }}>
                {displayName(goalPick.scorer, goalPick.team_id, homeDressed, awayDressed)}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div className="muted">Assist 1</div>
                <select className="input" value={assist1} onChange={(e)=>setAssist1(e.target.value)}>
                  <option value="">—</option>
                  {assistChoices.map((p)=>(
                    <option key={p.id} value={p.id}>{p.number?`#${p.number} `:""}{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="muted">Assist 2</div>
                <select className="input" value={assist2} onChange={(e)=>setAssist2(e.target.value)}>
                  <option value="">—</option>
                  {assistChoices.map((p)=>(
                    <option key={p.id} value={p.id}>{p.number?`#${p.number} `:""}{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn btn-grey" onClick={()=>setGoalPick(null)}>Cancel</button>
              <button className="btn btn-blue" onClick={confirmGoal}>Confirm Goal</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- subcomponents ---------- */

function ScoreCard({ team, score, side }) {
  return (
    <div className="card" style={{ padding: 10, display: "flex", alignItems: "center", gap: 12, justifyContent: side==="left" ? "flex-start" : "flex-end" }}>
      {side === "left" && <TeamLogoLarge team={team} />}
      <div style={{ background:"#0d2a66", color:"#fff", fontWeight:900, fontSize:28, borderRadius:12, minWidth:76, textAlign:"center", padding:"10px 16px" }}>
        {score}
      </div>
      {side === "right" && <TeamLogoLarge team={team} />}
    </div>
  );
}

function TeamLogoLarge({ team }) {
  const src = team?.logo_url;
  const name = team?.short_name || team?.name || "";
  return src ? (
    <img src={src} alt={name} style={{ width: 84, height: 48, objectFit: "contain" }} />
  ) : (
    <div style={{ width: 84, height: 48, borderRadius: 10, background: "#f4f7ff",
      display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:20 }}>
      {name.split(" ").map((w)=>w[0]).join("").slice(0,3)}
    </div>
  );
}

function ClockBlock({ running, clock, onClockChange, onStart, onReset, stamped, onStamp, onClearStamp, period, setPeriod, lenMin, setLenMin }) {
  return (
    <div className="card" style={{ padding: 12, textAlign: "center", minWidth: 340 }}>
      <input
        className="input"
        value={clock}
        onChange={(e)=>onClockChange(e.target.value.replace(/[^\d:]/g,""))}
        style={{ fontWeight: 900, fontSize: 34, textAlign: "center" }}
      />
      <div style={{ display:"flex", gap:8, justifyContent:"center", marginTop:8, flexWrap:"wrap" }}>
        <button className="btn btn-grey" onClick={onStart}>{running ? "Stop" : "Start"}</button>
        <button className="btn btn-grey" onClick={onStamp}>Stamp</button>
        {stamped && <span className="chip" style={{ background:"#eaf1ff" }}>Stamped {stamped} <button onClick={onClearStamp} className="link" style={{ marginLeft:6 }}>×</button></span>}
        <button className="btn btn-grey" onClick={onReset}>Reset</button>
      </div>
      <div style={{ display:"flex", gap:8, justifyContent:"center", marginTop:8 }}>
        <span className="muted">Period</span>
        <input className="input" type="number" min={1} value={period} onChange={(e)=>setPeriod(parseInt(e.target.value||"1",10))} style={{ width: 70 }} />
        <span className="muted">Len</span>
        <input className="input" type="number" min={1} max={30} value={lenMin} onChange={(e)=>setLenMin(parseInt(e.target.value||"15",10))} style={{ width: 70 }} />
        <span className="muted">min</span>
      </div>
    </div>
  );
}

function Bench({ title, players, color, height, benchTeamId, onDropBack }) {
  const txt = textOn(color);
  return (
    <div
      className="card"
      style={{ height }}
      onDragOver={(e)=>e.preventDefault()}
      onDrop={(e)=>{ e.preventDefault(); try{
        const p = JSON.parse(e.dataTransfer.getData("text/plain")||"{}");
        if (p?.id) onDropBack?.(p.id, p.team_id);
      }catch{} }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 56px)",
          gap: 8,
          height: height - 48,
          overflow: "auto",
          alignContent: "start",
        }}
      >
        {players.map((p) => (
          <div
            key={p.id}
            draggable
            onDragStart={(e)=>e.dataTransfer.setData("text/plain", JSON.stringify({ id:p.id, team_id: benchTeamId }))}
            className="chip"
            title={`Drag #${p.number ?? "?"} onto the rink`}
            style={{
              width: 56, height: 56, borderRadius: 999,
              background: color, color: txt,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontWeight: 900, fontSize: 18, cursor: "grab",
              boxShadow: "0 2px 6px rgba(0,0,0,0.25)"
            }}
          >
            {p.number ?? "•"}
          </div>
        ))}
      </div>
    </div>
  );
}

function Rink({
  height,
  onDrop, onDropTopNet, onDropBottomNet,
  home, away, homeDressed, awayDressed,
  onIce, setOnIce, goalieOnIce, setGoalie, homeColor, awayColor
}) {
  return (
    <div
      style={{
        position:"relative", height,
        borderRadius:16, border:"1px solid #d6e2ff", overflow:"hidden",
        background:`repeating-linear-gradient(0deg,#1c5fe0,#1c5fe0 10px,#1a59d2 10px,#1a59d2 20px)`,
        boxShadow:"inset 0 0 0 2px rgba(255,255,255,0.05)", userSelect:"none",
      }}
      onDragOver={(e)=>e.preventDefault()}
      onDrop={onDrop}
    >
      {/* yellow bands */}
      <div style={{ position:"absolute", left:0, right:0, height:10, background:"#ffd400", top:0 }} />
      <div style={{ position:"absolute", left:0, right:0, height:10, background:"#ffd400", bottom:0 }} />
      <div style={{ position:"absolute", left:0, right:0, height:10, background:"#ffd400", top:"50%", transform:"translateY(-50%)" }} />

      {/* creases (top=HOME, bottom=AWAY) */}
      <div
        onDragOver={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
        onDrop={onDropTopNet}
        title="Drop HOME scorer here"
        style={{
          position:"absolute", left:"50%", transform:"translateX(-50%)",
          width:"28%", height:"14%", top:"5%",
          borderRadius:12, border:"3px solid #ffd400", background:"rgba(255,212,0,0.10)",
        }}
      />
      <div
        onDragOver={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
        onDrop={onDropBottomNet}
        title="Drop AWAY scorer here"
        style={{
          position:"absolute", left:"50%", transform:"translateX(-50%)",
          width:"28%", height:"14%", bottom:"5%",
          borderRadius:12, border:"3px solid #ffd400", background:"rgba(255,212,0,0.10)",
        }}
      />

      {/* goalie selectors (white text) */}
      <div style={{ position:"absolute", top:10, left:10, color:"#fff", textShadow:"0 1px 2px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize:12, marginBottom:4 }}>{away.short_name || away.name} Goalie</div>
        <select className="input" value={goalieOnIce[away.id] || ""} onChange={(e)=>setGoalie(away.id, Number(e.target.value)||null)}>
          <option value="">—</option>
          {awayDressed.filter((p)=> (p.position||"").toLowerCase().includes("g")).map((g)=>(
            <option key={g.id} value={g.id}>{g.number?`#${g.number} `:""}{g.name}</option>
          ))}
        </select>
      </div>
      <div style={{ position:"absolute", bottom:10, right:10, color:"#fff", textShadow:"0 1px 2px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize:12, marginBottom:4 }}>{home.short_name || home.name} Goalie</div>
        <select className="input" value={goalieOnIce[home.id] || ""} onChange={(e)=>setGoalie(home.id, Number(e.target.value)||null)}>
          <option value="">—</option>
          {homeDressed.filter((p)=> (p.position||"").toLowerCase().includes("g")).map((g)=>(
            <option key={g.id} value={g.id}>{g.number?`#${g.number} `:""}{g.name}</option>
          ))}
        </select>
      </div>

      {/* tokens */}
      {onIce.map((t) => {
        const src = t.team_id === home.id ? homeDressed : awayDressed;
        const p = src.find((pp) => pp.id === t.id) || { id: t.id, number: "•" };
        const col = t.team_id === home.id ? homeColor : awayColor;
        return (
          <IceToken
            key={`${t.team_id}-${t.id}`}
            player={p} teamId={t.team_id} x={t.x} y={t.y} color={col}
            onMove={(nx,ny)=>setOnIce((cur)=>cur.map((it)=>it.id===t.id?{...it,x:nx,y:ny}:it))}
            onRemove={()=>setOnIce((cur)=>cur.filter((it)=>it.id!==t.id))}
          />
        );
      })}
    </div>
  );
}

function IceToken({ player, teamId, x, y, color, onMove, onRemove }) {
  const ref = useRef(null);
  function onDragStart(e){ e.dataTransfer.setData("text/plain", JSON.stringify({ id:player.id, team_id: teamId })); }
  function onDragEnd(e){
    const parent = ref.current?.parentElement?.getBoundingClientRect();
    if (!parent) return;
    const nx = clamp(((e.clientX - parent.left) / parent.width) * 100, 0, 100);
    const ny = clamp(((e.clientY - parent.top) / parent.height) * 100, 0, 100);
    onMove(+nx.toFixed(2), +ny.toFixed(2));
  }
  return (
    <div
      ref={ref}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDoubleClick={onRemove}
      style={{
        position:"absolute", left:`calc(${x}% - 22px)`, top:`calc(${y}% - 22px)`,
        width:44, height:44, borderRadius:999,
        background: color, color: textOn(color),
        display:"flex", alignItems:"center", justifyContent:"center",
        fontWeight:900, fontSize:18, cursor:"grab",
        boxShadow:"0 2px 6px rgba(0,0,0,0.25)"
      }}
      title="Drag to move • Drag onto your bench (or double-click) to send back"
    >
      {player.number ?? "•"}
    </div>
  );
}

function displayName(pid, teamId, homeBench, awayBench){
  const p = homeBench.find((x)=>x.id===pid) || awayBench.find((x)=>x.id===pid);
  if (!p) return `#${pid}`;
  return `${p.number?`#${p.number} `:""}${p.name}`;
}

function Modal({ children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", padding:12, zIndex:50 }}>
      {children}
    </div>
  );
}
