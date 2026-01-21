// LiveQuickPage.jsx — Click-based live stats entry (no rink)
// Builds on LivePage logic, optimized for speed

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

async function persistGoalie(gameId, teamId, playerId) {
  const { data: existing } = await supabase
    .from("game_goalies")
    .select("id")
    .eq("game_id", gameId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("game_goalies")
      .update({ player_id: playerId || null })
      .eq("id", existing.id);
  } else {
    await supabase.from("game_goalies").insert([
      {
        game_id: gameId,
        team_id: teamId,
        player_id: playerId || null,
        shots_against: 0,
        goals_against: 0,
      },
    ]);
  }
}

async function loadDressedRoster(gameId, teamId) {
  const { data } = await supabase
    .from("game_rosters")
    .select("players:player_id(id,name,position), number")
    .eq("game_id", gameId)
    .eq("team_id", teamId)
    .eq("is_dressed", true);

  return (data || [])
    .map((r) => ({ ...r.players, number: r.number }))
    .filter(Boolean)
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
}

/* ---------- helpers ---------- */
const pad2 = (n) => String(n).padStart(2, "0");
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const msToMMSS = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
};

const mmssToMs = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
  if (!m) return 0;
  return (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000;
};

/* =============================================== */

export default function LiveQuickPage() {
  const { slug } = useParams();

  const [game, setGame] = useState(null);
  const [home, setHome] = useState(null);
  const [away, setAway] = useState(null);

  const [homeDressed, setHomeDressed] = useState([]);
  const [awayDressed, setAwayDressed] = useState([]);

  const [goalieOnIce, setGoalieOnIce] = useState({});

  const [homeShots, setHomeShots] = useState(0);
  const [awayShots, setAwayShots] = useState(0);

  const [period, setPeriod] = useState(1);
  const [clock, setClock] = useState("15:00");
  const [running, setRunning] = useState(false);

  const tickTimer = useRef(null);
  const remainingMs = useRef(0);
  const lastTs = useRef(0);

  const [rows, setRows] = useState([]);

  /* ---------- quick picker ---------- */
  const [quickPick, setQuickPick] = useState(null);

  /* ---------- goal modal ---------- */
  const [goalPick, setGoalPick] = useState(null);
  const [assist1, setAssist1] = useState("");
  const [assist2, setAssist2] = useState("");
  const [goalTime, setGoalTime] = useState("");
  const [goalPeriod, setGoalPeriod] = useState(1);

  /* ---------- shot modal ---------- */
  const [shotPick, setShotPick] = useState(null);
  const [shotShooter, setShotShooter] = useState("");
  const [shotTime, setShotTime] = useState("");
  const [shotPeriod, setShotPeriod] = useState(1);

  /* ---------- initial load ---------- */
  useEffect(() => {
    let dead = false;

    (async () => {
      const { data: g } = await supabase.from("games").select("*").eq("slug", slug).single();
      if (!g || dead) return;

      const [{ data: ht }, { data: at }] = await Promise.all([
        supabase.from("teams").select("*").eq("id", g.home_team_id).single(),
        supabase.from("teams").select("*").eq("id", g.away_team_id).single(),
      ]);

      setGame(g);
      setHome(ht);
      setAway(at);

const { data: gg } = await supabase
  .from("game_goalies")
  .select("team_id, player_id")
  .eq("game_id", g.id);

const goalieMap = {};
(gg || []).forEach((r) => {
  goalieMap[r.team_id] = r.player_id;
});
setGoalieOnIce(goalieMap);

      
      setHomeShots(g.home_shots || 0);
      setAwayShots(g.away_shots || 0);
      setClock("15:00");

     

     setHomeDressed(await loadDressedRoster(g.id, g.home_team_id));
setAwayDressed(await loadDressedRoster(g.id, g.away_team_id));


      refreshEvents(g.id);
    })();

    return () => {
      dead = true;
      clearInterval(tickTimer.current);
    };
  }, [slug]);

  /* ---------- roster realtime sync (ADD THIS BLOCK) ---------- */
useEffect(() => {
  if (!game?.id) return;

  let dead = false;

  async function reload() {
    if (dead) return;

    setHomeDressed(
      await loadDressedRoster(game.id, game.home_team_id)
    );

    setAwayDressed(
      await loadDressedRoster(game.id, game.away_team_id)
    );
  }

  // load immediately
  reload();

  // subscribe to roster changes
  const ch = supabase
    .channel(`rt-quick-rosters-${game.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_rosters",
        filter: `game_id=eq.${game.id}`,
      },
      reload
    )
    .subscribe();

  return () => {
    dead = true;
    supabase.removeChannel(ch);
  };
}, [game?.id]);
/* ---------- end roster sync ---------- */

  /* ---------- events ---------- */
  async function refreshEvents(gameId) {
    const { data } = await supabase
      .from("events")
      .select(`
        id, team_id, player_id, period, time_mmss, event,
        players(id,name), teams(short_name)
      `)
      .eq("game_id", gameId)
      .order("period", { ascending: true })
      .order("time_mmss", { ascending: false });

    setRows(data || []);
  }

  /* ---------- clock ---------- */
  function startClock() {
    if (running) return;
    remainingMs.current = mmssToMs(clock);
    lastTs.current = Date.now();
    setRunning(true);

    tickTimer.current = setInterval(() => {
      const now = Date.now();
      const d = now - lastTs.current;
      lastTs.current = now;
      remainingMs.current = Math.max(0, remainingMs.current - d);
      setClock(msToMMSS(remainingMs.current));
    }, 200);
  }

  function stopClock() {
    clearInterval(tickTimer.current);
    setRunning(false);
  }

  /* ---------- click actions ---------- */
  function openQuick(player, teamId) {
    setQuickPick({ player, team_id: teamId });
  }

  function openGoalFor(playerId, teamId) {
    setGoalPick({ scorer: playerId, team_id: teamId });
    setGoalPeriod(period);
    setGoalTime(clock);
  }

  function openShotFor(playerId, teamId) {
    setShotPick({ team_id: teamId });
    setShotShooter(playerId);
    setShotPeriod(period);
    setShotTime(clock);
  }

  if (!game || !home || !away) return null;

  return (
    <div className="container">
      <div className="button-group" style={{ marginBottom: 8 }}>
  <Link className="btn btn-blue" to={`/live/${slug}`}>
    🏒 Live Rink
  </Link>

  <Link className="btn btn-grey" to="/games">
    Back to Games
  </Link>
</div>

      {/* header */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12 }}>
        <ScoreBlock team={away} score={game.away_score || 0} />
        <ClockBlock
          clock={clock}
          running={running}
          onStart={() => (running ? stopClock() : startClock())}
        />
        <ScoreBlock team={home} score={game.home_score || 0} />
      </div>

      {/* goalies */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>

        
     <GoalieSelect
  team={away}
  players={awayDressed}
  value={goalieOnIce[away.id]}
  onChange={async (v) => {
    setGoalieOnIce((m) => ({ ...m, [away.id]: v }));
    await persistGoalie(game.id, away.id, v);
  }}
/>

        
     <GoalieSelect
  team={home}
  players={homeDressed}
  value={goalieOnIce[home.id]}
  onChange={async (v) => {
    setGoalieOnIce((m) => ({ ...m, [home.id]: v }));
    await persistGoalie(game.id, home.id, v);
  }}
/>
      </div>

      {/* players */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <PlayerGrid title={away.short_name} players={awayDressed} onPick={(p) => openQuick(p, away.id)} />
        <PlayerGrid title={home.short_name} players={homeDressed} onPick={(p) => openQuick(p, home.id)} />
      </div>

      {/* quick modal */}
      {quickPick && (
        <Modal>
          <div className="card" style={{ width: 360 }}>
            <strong>#{quickPick.player.number} {quickPick.player.name}</strong>
            <div className="row gap" style={{ marginTop: 12 }}>
              <button className="btn btn-blue" onClick={() => { openGoalFor(quickPick.player.id, quickPick.team_id); setQuickPick(null); }}>
                Goal
              </button>
              <button className="btn btn-grey" onClick={() => { openShotFor(quickPick.player.id, quickPick.team_id); setQuickPick(null); }}>
                Shot
              </button>
              <button className="btn btn-grey" onClick={() => setQuickPick(null)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- subcomponents ---------- */

function PlayerGrid({ title, players, onPick }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 56px)", gap: 10 }}>
        {players.map((p) => (
          <button key={p.id} className="chip" onClick={() => onPick(p)}>
            {p.number ?? "•"}
          </button>
        ))}
      </div>
    </div>
  );
}

function GoalieSelect({ team, players, value, onChange }) {
  return (
    <div className="card">
      <div className="muted">{team.short_name} Goalie</div>
      <select className="input" value={value || ""} onChange={(e) => onChange(Number(e.target.value) || null)}>
        <option value="">—</option>
        {players.filter((p) => p.position === "G").map((g) => (
          <option key={g.id} value={g.id}>#{g.number} {g.name}</option>
        ))}
      </select>
    </div>
  );
}

function ScoreBlock({ team, score }) {
  return (
    <div className="card" style={{ textAlign: "center", fontWeight: 900, fontSize: 24 }}>
      {team.short_name}<br />{score}
    </div>
  );
}

function ClockBlock({ clock, running, onStart }) {
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <div style={{ fontSize: 32, fontWeight: 900 }}>{clock}</div>
      <button className="btn btn-grey" onClick={onStart}>
        {running ? "Stop" : "Start"}
      </button>
    </div>
  );
}

function Modal({ children }) {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.4)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 50,
    }}>
      {children}
    </div>
  );
}
