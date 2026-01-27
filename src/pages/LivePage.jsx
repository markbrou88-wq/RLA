// ============================================================================
// LivePage.jsx
// PURPOSE:
// - Live game management (scores, shots, goals, clock, rosters)
// - This file is the SINGLE SOURCE OF TRUTH for live stats
// - UI layouts (rink / quick) should ONLY reuse logic from here
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

// ============================================================================
// SECTION 0 — TINY PURE HELPERS (NO STATE, NO SIDE EFFECTS)
// Safe to reuse anywhere (Live / Quick / Summary)
// ============================================================================

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
const teamColor = (team) => {
  const n = (team?.short_name || team?.name || "").toLowerCase();
  if (n.includes("black") || n.includes("rln")) return "#111111";
  if (n.includes("blue") || n.includes("rlb")) return "#2f7bf5";
  if (n.includes("red") || n.includes("rlr")) return "#ff2828";
  return "#333";
};
const textOn = () => "#fff";

// ============================================================================
// SECTION 1 — MAIN COMPONENT + CORE STATE
// This is the SINGLE SOURCE OF TRUTH for the live game
// ============================================================================

// ============================================================================
// GLOBAL MEDIA FLAGS (SAFE FOR ALL SUBCOMPONENTS)
// ============================================================================

const isCompact = window.matchMedia("(max-width: 900px)").matches;
const isPhone = window.matchMedia("(max-width: 600px)").matches;


export default function LivePage() {
  const { slug } = useParams();
  


// --------------------------------------------------------------------------
  // 1A. GAME & TEAM STATE (loaded once, then reused everywhere)
  // --------------------------------------------------------------------------

  const [game, setGame] = useState(null);
  const [home, setHome] = useState(null);
  const [away, setAway] = useState(null);

  // --------------------------------------------------------------------------
  // 1B. ROSTERS (dressed players only)
  // IMPORTANT: both Live & Quick MUST use these
  // --------------------------------------------------------------------------

  const [homeDressed, setHomeDressed] = useState([]);
  const [awayDressed, setAwayDressed] = useState([]);
  const [teamPlayerNumberMap, setTeamPlayerNumberMap] = useState({});

  // --------------------------------------------------------------------------
  // 1C. ON-ICE STATE (UI positioning only)
  // NOT persisted — visual aid only
  // --------------------------------------------------------------------------

  const [goalieOnIce, setGoalieOnIce] = useState({});
  const [onIce, setOnIce] = useState([]);

// --------------------------------------------------------------------------
  // 1D. EVENTS TABLE (goals, assists, shots)
  // --------------------------------------------------------------------------  

  const [rows, setRows] = useState([]);

  // --------------------------------------------------------------------------
  // 1E. SHOTS (persisted to DB + LS)
  // --------------------------------------------------------------------------

  const [homeShots, setHomeShots] = useState(0);
  const [awayShots, setAwayShots] = useState(0);

  // --------------------------------------------------------------------------
  // 1F. CLOCK ENGINE STATE
  // --------------------------------------------------------------------------

  const [period, setPeriod] = useState(1);
  const [lenMin, setLenMin] = useState(15);
  const [clock, setClock] = useState("15:00");
  const [running, setRunning] = useState(false);

   // internal clock refs (NOT React state)
  const tickTimer = useRef(null);
  const lastTs = useRef(0);
  const remainingMs = useRef(0);

// --------------------------------------------------------------------------
  // 1G. MODAL STATE (goal / shot)
  // --------------------------------------------------------------------------

  // goal modal / edit
  const [goalPick, setGoalPick] = useState(null); // { scorer, team_id, editKey? }
  const [assist1, setAssist1] = useState("");
  const [assist2, setAssist2] = useState("");
  const [goalTime, setGoalTime] = useState("");
  const [goalPeriod, setGoalPeriod] = useState(1);

  // shot modal
  const [shotPick, setShotPick] = useState(null); // { team_id }
  const [shotShooter, setShotShooter] = useState("");
  const [shotTime, setShotTime] = useState("");
  const [shotPeriod, setShotPeriod] = useState(1);

  // QUICK MODE assist picker (tap-based)
const [quickAssists, setQuickAssists] = useState([]);
// array of playerIds (max 2)


// ============================================================================
// SECTION 1H — LAYOUT MODE (UI ONLY)
// "rink" = current live page
// "quick" = fast clickable mode
// ============================================================================

const [layoutMode, setLayoutMode] = useState("rink"); 
// values: "rink" | "quick"

// ============================================================================
// SECTION 1I — QUICK MODE ACTION PICKER (UI ONLY)
// ============================================================================

// When clicking a player bubble in QUICK mode,
// we open a small "action menu" for that player.
const [quickPick, setQuickPick] = useState(null);
// shape:
// {
//   playerId,
//   teamId,
//   number,
//   name
// }

  
  
  // ============================================================================
// SECTION 2 — LOCAL STORAGE (UI STATE RECOVERY ONLY)
// NOT stats, NOT authoritative
// ============================================================================

  const lsKey = (id) => `live:${id}`;
  const loadLS = (id) => {
    try {
      const raw = localStorage.getItem(lsKey(id));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };
  const saveLS = (id, patch) => {
    try {
      const cur = loadLS(id);
      localStorage.setItem(lsKey(id), JSON.stringify({ ...cur, ...patch }));
    } catch {}
  };

  // ============================================================================
// SECTION 3 — ROSTER SYSTEM (CRITICAL FOR PARALLEL PAGES)
// If something is wrong in Quick Mode, it’s usually here
// ============================================================================
 
   // Load jersey numbers from team_players
  
   async function loadTeamPlayerNumbers(seasonId, categoryId, teamIds) {
    if (!seasonId || !categoryId || !Array.isArray(teamIds) || teamIds.length === 0) return {};
    const { data, error } = await supabase
      .from("team_players")
      .select("team_id, player_id, number")
      .eq("season_id", seasonId)
      .eq("category_id", categoryId)
      .in("team_id", teamIds);

    if (error) {
      console.error("loadTeamPlayerNumbers error:", error);
      return {};
    }

    const map = {};
    (data || []).forEach((r) => {
      map[`${r.team_id}:${r.player_id}`] = r.number ?? null;
    });
    return map;
  }

  // Reads dressed players from game_rosters
  
 async function fetchGameRosterDressed(gameId, teamId, numberMap = {}) {
  // Try "dressed" first (your current code)
  let data = null;

  // Helper to map -> roster with jersey numbers from team_players map
  const buildRoster = (rows) =>
    (rows || [])
      .map((r) => {
        const p = r.players;
        if (!p) return null;
        const num = numberMap[`${teamId}:${p.id}`] ?? null;
        return { ...p, number: num };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const an = a.number ?? 9999;
        const bn = b.number ?? 9999;
        if (an !== bn) return an - bn;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });

  // 1) Attempt with column "dressed"
  {
    const res = await supabase
      .from("game_rosters")
      .select("player_id, dressed, players:player_id(id,name,position)")
      .eq("game_id", gameId)
      .eq("team_id", teamId)
      .eq("dressed", true);

    if (!res.error) {
      data = res.data || [];
      return buildRoster(data);
    }

    // If the column doesn't exist, we'll try the alternate name below.
    // Otherwise, throw the real error.
    const msg = String(res.error?.message || "");
    if (!msg.toLowerCase().includes("column") || !msg.toLowerCase().includes("dressed")) {
      throw res.error;
    }
  }

  // 2) Fallback: attempt with column "is_dressed"
  {
    const res = await supabase
      .from("game_rosters")
      .select("player_id, is_dressed, players:player_id(id,name,position)")
      .eq("game_id", gameId)
      .eq("team_id", teamId)
      .eq("is_dressed", true);

    if (res.error) throw res.error;

    data = res.data || [];
    return buildRoster(data);
  }
}


  async function ensureAndLoadDressed(gameRow, teamId) {
    // Load jersey numbers (season/category scoped) for this team so roster rows can display '#'
    const numberMap = await loadTeamPlayerNumbers(
      gameRow.season_id,
      gameRow.category_id,
      [teamId]
    );

    // Prefer existing game_rosters
    let dressed = await fetchGameRosterDressed(gameRow.id, teamId, numberMap);

    // If none, auto-initialize from team_players, then re-read
    if (!dressed.length) {
      await initGameRostersFromTeamPlayers(
        gameRow.id,
        gameRow.season_id,
        gameRow.category_id,
        teamId
      );

      // reload numbers (in case team_players was backfilled/edited)
      const numberMap2 = await loadTeamPlayerNumbers(
        gameRow.season_id,
        gameRow.category_id,
        [teamId]
      );
      dressed = await fetchGameRosterDressed(gameRow.id, teamId, numberMap2);
    }

    return dressed;
  }

 
  
 // ============================================================================
// SECTION 4 — INITIAL LOAD (BOOT SEQUENCE)
// Runs ONCE per page load
// ============================================================================
  
  useEffect(() => {
    let dead = false;
    (async () => {
// 1) Load game
      const { data: g, error: gErr } = await supabase
        .from("games")
        .select("*")
        .eq("slug", slug)
        .single();

      if (gErr || !g) {
        console.error("Error loading game:", gErr);
        return;
      }
 // 2) Load teams
      const [{ data: ht, error: htErr }, { data: at, error: atErr }] = await Promise.all([
        supabase.from("teams").select("*").eq("id", g.home_team_id).single(),
        supabase.from("teams").select("*").eq("id", g.away_team_id).single(),
      ]);

      if (htErr) console.error("Error loading home team:", htErr);
      if (atErr) console.error("Error loading away team:", atErr);

      const { data: gg } = await supabase
        .from("game_goalies")
        .select("team_id, player_id")
        .eq("game_id", g.id);

      if (dead) return;

      setGame(g);
      setHome(ht);
      setAway(at);

// 3) Ensure rosters exist (auto-create if missing)
      
      const [homeDress, awayDress] = await Promise.all([
        ensureAndLoadDressed(g, g.home_team_id),
        ensureAndLoadDressed(g, g.away_team_id),
      ]);

      if (dead) return;
      setHomeDressed(homeDress);
      setAwayDressed(awayDress);

      // length from DB or default
      const baseLen = g.period_seconds ? Math.round(g.period_seconds / 60) : 15;

// 4) Restore clock + shots
      
      const ls = loadLS(g.id);

      setLenMin(ls.lenMin ?? baseLen);
      const startMs = mmssToMs(ls.clock ?? msToMMSS((ls.lenMin ?? baseLen) * 60 * 1000));
      remainingMs.current = startMs;
      setClock(ls.clock ?? msToMMSS(startMs));
      setPeriod(ls.period ?? 1);
      setRunning(false); // not running on return

      const map = {};
      (gg || []).forEach((row) => (map[row.team_id] = row.player_id));
      setGoalieOnIce(map);

      // shots: DB if present, else fallback to LS
      setHomeShots(
        typeof g.home_shots === "number"
          ? g.home_shots
          : typeof ls.homeShots === "number"
          ? ls.homeShots
          : 0
      );
      setAwayShots(
        typeof g.away_shots === "number"
          ? g.away_shots
          : typeof ls.awayShots === "number"
          ? ls.awayShots
          : 0
      );

// 5) Load events
 
      await refreshEvents(g.id);
    })();

    return () => {
      dead = true;
      clearInterval(tickTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

 
  // ============================================================================
// SECTION 5 — REALTIME SUBSCRIPTIONS
// This is why Live & Quick stay in sync
// ============================================================================

 
  useEffect(() => {
    if (!game?.id) return;
    const ch = supabase
      .channel(`rt-live-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () =>
        refreshEvents(game.id)
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [slug, game?.id]);

  

  useEffect(() => {
  if (!game?.id || !home?.id || !away?.id) return;

  let dead = false;

  async function reloadDressed() {
    try {
      // Load numbers for both teams (season/category scoped)
      const numMap = await loadTeamPlayerNumbers(game.season_id, game.category_id, [home.id, away.id]);
      if (dead) return;

      setTeamPlayerNumberMap(numMap);

      const [hd, ad] = await Promise.all([
        fetchGameRosterDressed(game.id, home.id, numMap),
        fetchGameRosterDressed(game.id, away.id, numMap),
      ]);
      if (dead) return;

      setHomeDressed(hd);
      setAwayDressed(ad);
    } catch (e) {
      console.warn("reloadDressed failed:", e);
    }
  }

  // load once immediately
  reloadDressed();

  // realtime subscribe: any change to game_rosters should refresh dressed lists
  const ch = supabase
    .channel(`rt-rosters-${game.id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "game_rosters", filter: `game_id=eq.${game.id}` },
      () => reloadDressed()
    )
    .subscribe();

  return () => {
    dead = true;
    supabase.removeChannel(ch);
  };
}, [game?.id, game?.season_id, game?.category_id, home?.id, away?.id]);


  /* realtime roster (dressed players) */
useEffect(() => {
  if (!game?.id) return;

  const ch = supabase
    .channel(`rt-roster-${game.id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "game_rosters", filter: `game_id=eq.${game.id}` },
      async () => {
        try {
          const [homeDress, awayDress] = await Promise.all([
            ensureAndLoadDressed(game, game.home_team_id),
            ensureAndLoadDressed(game, game.away_team_id),
          ]);
          setHomeDressed(homeDress);
          setAwayDressed(awayDress);
        } catch (e) {
          console.error("Failed to refresh dressed rosters:", e);
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(ch);
}, [game?.id]);

// ============================================================================
// SECTION 6 — EVENTS & STATS ENGINE (THE HEART ❤️)
// All goals/shots MUST go through these functions
// ============================================================================

   async function refreshEvents(gameId) {
    const { data: ev } = await supabase
      .from("events")
      .select(
        `
        id, game_id, team_id, player_id, period, time_mmss, event, goalie_id,
        players!events_player_id_fkey ( id, name, position ),
        teams!events_team_id_fkey ( id, name, short_name )
      `
      )
      .eq("game_id", gameId)
      .order("period", { ascending: true })
      .order("time_mmss", { ascending: false });

    const events = ev || [];

    // Attach jersey numbers from team_players (season/category scoped)
    try {
      const seasonId = game?.season_id;
      const categoryId = game?.category_id;
      if (seasonId && categoryId && events.length) {
        const teamIds = Array.from(new Set(events.map((e) => e.team_id).filter(Boolean)));
        const numMap = await loadTeamPlayerNumbers(seasonId, categoryId, teamIds);
        setTeamPlayerNumberMap(numMap);
        events.forEach((e) => {
          if (e.players) e.players.number = numMap[`${e.team_id}:${e.player_id}`] ?? null;
        });
      }
    } catch (e) {
      console.warn("Unable to attach jersey numbers to events", e);
    }

    const key = (e) => `${e.period}|${e.time_mmss}|${e.team_id}|goal`;
    const gmap = new Map();
    events.forEach((e) => {
      if (e.event === "goal") gmap.set(key(e), { goal: e, assists: [] });
    });
    events.forEach((e) => {
      if (e.event === "assist" && gmap.has(key(e))) gmap.get(key(e)).assists.push(e);
    });
    const others = events
      .filter((e) => e.event !== "goal" && e.event !== "assist")
      .map((x) => ({ single: x }));
    const grouped = [...gmap.values(), ...others].sort((a, b) => {
      const ap = a.goal ? a.goal.period : a.single.period;
      const bp = b.goal ? b.goal.period : b.single.period;
      if (ap !== bp) return ap - bp;
      const at = a.goal ? a.goal.time_mmss : a.single.time_mmss;
      const bt = b.goal ? b.goal.time_mmss : b.single.time_mmss;
      return bt.localeCompare(at);
    });
    setRows(grouped);
  }

function toggleQuickAssist(playerId) {
  setQuickAssists((cur) => {
    // deselect if already selected
    if (cur.includes(playerId)) {
      return cur.filter((id) => id !== playerId);
    }

    // max 2 assists
    if (cur.length >= 2) return cur;

    return [...cur, playerId];
  });
}

  
   // (confirmGoal, confirmShot, bumpGoalieSA, bumpGoalieGA live here)
  // These functions mutate DB AND trigger realtime updates
  // UI layouts must CALL them, never re-implement logic

// ============================================================================
// SECTION 7 — CLOCK ENGINE
// Pure UI timing, not authoritative
// ============================================================================

  useEffect(() => {
    if (!game?.id) return;
    // persist UI clock/period/len to LS whenever they change
    saveLS(game.id, { clock, period, lenMin, running });
  }, [game?.id, clock, period, lenMin, running]);

  function startClock() {
    if (running) return;
    remainingMs.current = mmssToMs(clock);
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

  // ============================================================================
// SECTION 8 — UI INTERACTIONS (RINK / BENCH)
// Safe to REMOVE for Quick Mode
// ============================================================================

  function readPayload(e) {
    try {
      return JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
    } catch {
      return null;
    }
  }
  function rinkDrop(e) {
    e.preventDefault();
    const p = readPayload(e);
    if (!p?.id) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100);
    const y = clamp(((e.clientY - r.top) / r.height) * 100, 0, 100);
    setOnIce((cur) => {
      const copy = cur.filter((t) => t.id !== p.id);
      copy.push({ id: p.id, team_id: p.team_id, x: +x.toFixed(2), y: +y.toFixed(2) });
      return copy;
    });
  }
  // top net => HOME, bottom net => AWAY
  function dropOnTopNet(e) {
    e.preventDefault();
    e.stopPropagation();
    const p = readPayload(e);
    if (!p?.id) return;
    if (p.team_id !== home.id) return;
    openGoalFor(p.id, home.id);
  }
  function dropOnBottomNet(e) {
    e.preventDefault();
    e.stopPropagation();
    const p = readPayload(e);
    if (!p?.id) return;
    if (p.team_id !== away.id) return;
    openGoalFor(p.id, away.id);
  }

  /* ---------- goalie selection persist ---------- */
  async function setGoalie(teamId, playerId) {
    setGoalieOnIce((m) => ({ ...m, [teamId]: playerId || "" }));
    const { data: ex } = await supabase
      .from("game_goalies")
      .select("id")
      .eq("game_id", game.id)
      .eq("team_id", teamId)
      .maybeSingle();
    if (ex?.id) {
      await supabase.from("game_goalies").update({ player_id: playerId || null }).eq("id", ex.id);
    } else {
      await supabase
        .from("game_goalies")
        .insert([{ game_id: game.id, team_id: teamId, player_id: playerId || null }]);
    }
  }

  /* ---------- helpers to upsert goalie rows ---------- */
  async function upsertGoalieGameStats(teamId, playerId) {
    // game_stats (is_goalie row)
    const { data: gs } = await supabase
      .from("game_stats")
      .select("id, goalie_shots_against")
      .eq("game_id", game.id)
      .eq("team_id", teamId)
      .eq("player_id", playerId)
      .eq("is_goalie", true)
      .maybeSingle();
    return (
      gs?.id ||
      (
        await supabase
          .from("game_stats")
          .insert([
            { game_id: game.id, team_id: teamId, player_id: playerId, is_goalie: true, goalie_shots_against: 0 },
          ])
          .select("id")
          .single()
      )?.data?.id
    );
  }
  async function upsertGameGoalieRow(teamId, playerId) {
    const { data: gg } = await supabase
      .from("game_goalies")
      .select("id, shots_against, goals_against")
      .eq("game_id", game.id)
      .eq("team_id", teamId)
      .maybeSingle();
    if (gg?.id) return gg;
    const { data: created } = await supabase
      .from("game_goalies")
      .insert([{ game_id: game.id, team_id: teamId, player_id: playerId, shots_against: 0, goals_against: 0 }])
      .select("id, shots_against, goals_against")
      .single();
    return created;
  }

  /* ---------- SHOTS: persist + push SA to opposing goalie ---------- */
  useEffect(() => {
    if (!game?.id) return;
    saveLS(game.id, { homeShots });
  }, [game?.id, homeShots]);

  useEffect(() => {
    if (!game?.id) return;
    saveLS(game.id, { awayShots });
  }, [game?.id, awayShots]);

  // UPDATED: always keep team SA (game_goalies.shots_against) in sync with the shot totals.
  async function bumpGoalieSA(goalieTeamId, delta) {
    if (!delta || !game?.id) return;

    const goalieId = goalieOnIce[goalieTeamId];

    // --- 1) Per-goalie row in game_stats (only if we know the goalie) ---
    if (goalieId) {
      const gsId = await upsertGoalieGameStats(goalieTeamId, goalieId);
      if (gsId) {
        const { data: cur } = await supabase
          .from("game_stats")
          .select("goalie_shots_against")
          .eq("id", gsId)
          .single();

        const next = Math.max(0, (cur?.goalie_shots_against || 0) + delta);

        await supabase.from("game_stats").update({ goalie_shots_against: next }).eq("id", gsId);
      }
    }

    // --- 2) Team-level SA in game_goalies (always sync with shots) ---
    const { data: existing } = await supabase
      .from("game_goalies")
      .select("id, shots_against, player_id")
      .eq("game_id", game.id)
      .eq("team_id", goalieTeamId)
      .maybeSingle();

    let row = existing;

    // If there's no row yet, create one (attach goalie if we know him).
    if (!row) {
      const { data: created } = await supabase
        .from("game_goalies")
        .insert([
          { game_id: game.id, team_id: goalieTeamId, player_id: goalieId || null, shots_against: 0, goals_against: 0 },
        ])
        .select("id, shots_against, player_id")
        .single();
      row = created;
    } else if (!row.player_id && goalieId) {
      // Back-fill goalie on existing row if it was missing.
      await supabase.from("game_goalies").update({ player_id: goalieId }).eq("id", row.id);
    }

    if (!row?.id) return;

    const nextSA = Math.max(0, (row.shots_against || 0) + delta);

    await supabase.from("game_goalies").update({ shots_against: nextSA }).eq("id", row.id);
  }

  // NOTE: increases are blocked if no opposing goalie is selected; decreases are allowed
  async function changeHomeShots(nextVal) {
    const v = clamp(Number(nextVal || 0), 0, 999);
    const cur = homeShots || 0;
    const delta = v - cur;

   if (delta > 0) {
  const gId = goalieOnIce[away?.id];
  if (!gId) {
    alert("Select the AWAY goalie before recording shots.");
    return;
  }

  // ensure goalie is bound to game_goalies BEFORE bulk apply
  await upsertGameGoalieRow(away.id, gId);
}

    setHomeShots(v);
    try {
      await supabase.from("games").update({ home_shots: v }).eq("id", game.id);
    } catch {}
    await bumpGoalieSA(away.id, delta);
  }
  async function changeAwayShots(nextVal) {
    const v = clamp(Number(nextVal || 0), 0, 999);
    const cur = awayShots || 0;
    const delta = v - cur;

    if (delta > 0) {
  const gId = goalieOnIce[home?.id];
  if (!gId) {
    alert("Select the HOME goalie before recording shots.");
    return;
  }

  // ensure goalie is bound to game_goalies BEFORE bulk apply
  await upsertGameGoalieRow(away.id, gId);
}

    setAwayShots(v);
    try {
      await supabase.from("games").update({ away_shots: v }).eq("id", game.id);
    } catch {}
    await bumpGoalieSA(home.id, delta);
  }

async function handleShotMinus(teamId) {
  if (!game) return;
  const isHome = teamId === home?.id;
  const cur = isHome ? homeShots : awayShots;
  if (cur <= 0) return;

  // 1️⃣ Decrement shots + goalie SA
  if (isHome) {
    await changeHomeShots(cur - 1);
  } else {
    await changeAwayShots(cur - 1);
  }

  // 2️⃣ Count how many real shot EVENTS exist
  const { count: shotEventCount } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("game_id", game.id)
    .eq("team_id", teamId)
    .eq("event", "shot");

  // 3️⃣ Only delete an event if it matches reality
  // (prevents bulk/manual shots from eating real events)
  if (shotEventCount >= cur) {
    const { data: lastShot } = await supabase
      .from("events")
      .select("id")
      .eq("game_id", game.id)
      .eq("team_id", teamId)
      .eq("event", "shot")
      .order("period", { ascending: false })
      .order("time_mmss", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastShot?.id) {
      await supabase.from("events").delete().eq("id", lastShot.id);
    }
  }
}

  

  /* ---------- GA: bump goals_against on opposing goalie (game_goalies) ---------- */
  async function bumpGoalieGA(opposingTeamId, delta) {
    if (!delta) return;
    const goalieId = goalieOnIce[opposingTeamId];
    if (!goalieId) return;
    const gg = await upsertGameGoalieRow(opposingTeamId, goalieId);
    const nextGA = Math.max(0, (gg?.goals_against || 0) + delta);
    await supabase.from("game_goalies").update({ goals_against: nextGA }).eq("id", gg.id);
  }

  /* ---------- goal modal ---------- */
  function openGoalFor(playerId, teamId, existing = null) {
    setAssist1("");
    setAssist2("");
    setGoalPeriod(period);
    setGoalTime(clock);
    if (existing) {
      setGoalPick({
        scorer: existing.goal.player_id,
        team_id: existing.goal.team_id,
        editKey: existing,
      });
      setGoalPeriod(existing.goal.period);
      setGoalTime(existing.goal.time_mmss);
      setAssist1(existing.assists?.[0]?.player_id || "");
      setAssist2(existing.assists?.[1]?.player_id || "");
    } else {
      setGoalPick({ scorer: playerId, team_id: teamId });
    }
  }

  // Assist choices: new goal => only tokens on ice; edit => full roster
  const assistChoices = useMemo(() => {
    if (!goalPick) return [];
    const roster = goalPick.team_id === home?.id ? homeDressed : awayDressed;
    if (goalPick.editKey) return roster; // edit = allow all
    const idsOnIceSameTeam = new Set(
      onIce.filter((t) => t.team_id === goalPick.team_id).map((t) => t.id)
    );
    return roster.filter((p) => idsOnIceSameTeam.has(p.id) && p.id !== goalPick.scorer);
  }, [goalPick, home?.id, homeDressed, awayDressed, onIce]);

  const quickAssistChoices = useMemo(() => {
  if (!goalPick?.quick) return [];

  const roster =
    goalPick.team_id === home?.id ? homeDressed : awayDressed;

  return roster.filter((p) => p.id !== goalPick.scorer);
}, [goalPick, home?.id, homeDressed, awayDressed]);


  async function confirmGoal() {
    if (!goalPick) return;
    const per = Number(goalPeriod) || 1;
    const tm = (goalTime || clock).trim();
    const tid = Number(goalPick.team_id);
    const scorerId = Number(goalPick.scorer);
    
    const aList = goalPick.quick
  ? quickAssists
  : [assist1, assist2].filter(Boolean).map(Number).slice(0, 2);


    // determine which goalie was scored on (based on current goalieOnIce)
    const opposingTeamId = tid === home.id ? away.id : home.id;
    const goalieScoredOnId = goalieOnIce[opposingTeamId] || null;

    if (goalPick.editKey) {
      // --- EDIT EXISTING ---
      const prevTeamId = goalPick.editKey.goal.team_id;

      // 1) update goal row (include goalie_id so it stays in sync)
      await supabase
        .from("events")
        .update({
          team_id: tid,
          player_id: scorerId,
          period: per,
          time_mmss: tm,
          goalie_id: goalieScoredOnId,
        })
        .eq("id", goalPick.editKey.goal.id);

      // 2) sync assists (no goalie_id for assists)
      const existing = goalPick.editKey.assists || [];
      const toUpdate = Math.min(existing.length, aList.length);
      for (let i = 0; i < toUpdate; i++) {
        await supabase
          .from("events")
          .update({ team_id: tid, player_id: aList[i], period: per, time_mmss: tm })
          .eq("id", existing[i].id);
      }
      if (aList.length > existing.length) {
        for (let i = existing.length; i < aList.length; i++) {
          await supabase.from("events").insert([
            { game_id: game.id, team_id: tid, player_id: aList[i], period: per, time_mmss: tm, event: "assist" },
          ]);
        }
      } else if (existing.length > aList.length) {
        const idsToDelete = existing.slice(aList.length).map((a) => a.id);
        await supabase.from("events").delete().in("id", idsToDelete);
      }

      // 3) adjust scores and GA only if team changed
      if (prevTeamId !== tid) {
        const nextHome =
          (game.home_score || 0) +
          (tid === home.id ? 1 : 0) -
          (prevTeamId === home.id ? 1 : 0);
        const nextAway =
          (game.away_score || 0) +
          (tid === away.id ? 1 : 0) -
          (prevTeamId === away.id ? 1 : 0);

        setGame((g) => ({ ...g, home_score: nextHome, away_score: nextAway }));
        await supabase.from("games").update({ home_score: nextHome, away_score: nextAway }).eq("id", game.id);

        // GA: old opposing goalie -1, new opposing goalie +1
        await bumpGoalieGA(prevTeamId === home.id ? away.id : home.id, -1);
        await bumpGoalieGA(tid === home.id ? away.id : home.id, +1);
      }

      // NOTE: for simplicity, we *don't* touch shots/shot-events on edit.
      setGoalPick(null);
      await refreshEvents(game.id);
      return;
    }

    // --- CREATE NEW GOAL ---
    await supabase.from("events").insert([
      { game_id: game.id, team_id: tid, player_id: scorerId, period: per, time_mmss: tm, event: "goal", goalie_id: goalieScoredOnId },
    ]);

    for (const aid of aList) {
      await supabase.from("events").insert([
        { game_id: game.id, team_id: tid, player_id: aid, period: per, time_mmss: tm, event: "assist" },
      ]);
    }

    // instant score bump
    setGame((g) =>
      g
        ? {
            ...g,
            home_score: tid === g.home_team_id ? (g.home_score || 0) + 1 : g.home_score,
            away_score: tid === g.home_team_id ? g.away_score : (g.away_score || 0) + 1,
          }
        : g
    );

    await supabase
      .from("games")
      .update(tid === game.home_team_id ? { home_score: (game.home_score || 0) + 1 } : { away_score: (game.away_score || 0) + 1 })
      .eq("id", game.id);

    // GA on opposing goalie
    await bumpGoalieGA(tid === home.id ? away.id : home.id, +1);

    // --- AUTO SHOT tied to this goal (only if we know which goalie was scored on) ---
    if (goalieScoredOnId) {
      // bump shots + SA
      if (tid === home.id) {
        await changeHomeShots((homeShots || 0) + 1);
      } else {
        await changeAwayShots((awayShots || 0) + 1);
      }

      // create 'shot' event that matches this goal
      await supabase.from("events").insert([
        { game_id: game.id, team_id: tid, player_id: scorerId, period: per, time_mmss: tm, event: "shot", goalie_id: goalieScoredOnId },
      ]);
    }

    setGoalPick(null);
  }

  /* ---------- SHOT modal helpers ---------- */

  function openShotForTeam(teamId) {
    if (!game || !home || !away) return;

    setShotPick({ team_id: teamId });
    setShotPeriod(period);
    setShotTime(clock);

    const roster = teamId === home.id ? homeDressed : awayDressed;
    const idsOnIce = new Set(onIce.filter((t) => t.team_id === teamId).map((t) => t.id));
    const pref = roster.find((p) => idsOnIce.has(p.id))?.id || (roster.length ? roster[0].id : "") || "";
    setShotShooter(pref);
  }

  const shotChoices = useMemo(() => {
    if (!shotPick) return [];
    const teamId = shotPick.team_id;
    const roster = teamId === home?.id ? homeDressed : awayDressed;
    const idsOnIce = new Set(onIce.filter((t) => t.team_id === teamId).map((t) => t.id));
    const onIceOnly = roster.filter((p) => idsOnIce.has(p.id));
    return onIceOnly.length ? onIceOnly : roster;
  }, [shotPick, home?.id, homeDressed, awayDressed, onIce]);

  async function confirmShot() {
    if (!shotPick || !shotShooter) return;
    const tid = shotPick.team_id;
    const per = Number(shotPeriod) || 1;
    const tm = (shotTime || clock).trim();
    const shooterId = Number(shotShooter);

    const opposingTeamId = tid === home.id ? away.id : home.id;
    const goalieId = goalieOnIce[opposingTeamId];

    if (!goalieId) {
      alert("Select the opposing goalie before recording a shot.");
      return;
    }

    // 1) bump shot counters + goalie SA (existing logic)
    if (tid === home.id) {
      await changeHomeShots((homeShots || 0) + 1);
    } else {
      await changeAwayShots((awayShots || 0) + 1);
    }

    // 2) create shot event
    await supabase.from("events").insert([
      { game_id: game.id, team_id: tid, player_id: shooterId, period: per, time_mmss: tm, event: "shot", goalie_id: goalieId },
    ]);

    setShotPick(null);
  }

  async function deleteRow(r) {
    if (r.goal) {
      const ids = [r.goal.id, ...r.assists.map((a) => a.id)];
      await supabase.from("events").delete().in("id", ids);

      const isHome = r.goal.team_id === game.home_team_id;

      // Try to find a matching 'shot' event for this goal
      const { data: shotRow } = await supabase
        .from("events")
        .select("id")
        .eq("game_id", game.id)
        .eq("team_id", r.goal.team_id)
        .eq("player_id", r.goal.player_id)
        .eq("period", r.goal.period)
        .eq("time_mmss", r.goal.time_mmss)
        .eq("event", "shot")
        .limit(1)
        .maybeSingle();

      if (shotRow?.id) {
        // delete that shot event
        await supabase.from("events").delete().eq("id", shotRow.id);

        // and bump shots down by 1 (which also adjusts goalie SA)
        if (isHome) {
          await changeHomeShots(Math.max(0, (homeShots || 0) - 1));
        } else {
          await changeAwayShots(Math.max(0, (awayShots || 0) - 1));
        }
      }

      const nextHome = isHome ? Math.max(0, (game.home_score || 0) - 1) : game.home_score;
      const nextAway = isHome ? game.away_score : Math.max(0, (game.away_score || 0) - 1);
      setGame((g) => ({ ...g, home_score: nextHome, away_score: nextAway }));
      await supabase.from("games").update({ home_score: nextHome, away_score: nextAway }).eq("id", game.id);

      // undo GA on opposing goalie
      await bumpGoalieGA(isHome ? away.id : home.id, -1);
    } else if (r.single) {
      // If it's a shot, adjust counters and goalie SA as well
      if (r.single.event === "shot") {
        const isHome = r.single.team_id === game.home_team_id;
        if (isHome) {
          await changeHomeShots(Math.max(0, (homeShots || 0) - 1));
        } else {
          await changeAwayShots(Math.max(0, (awayShots || 0) - 1));
        }
      }

      await supabase.from("events").delete().eq("id", r.single.id);
    }
  }

// ============================================================================
// SECTION 9 — RENDER (JSX)
// This is where we will later add:
// {mode === "rink"} vs {mode === "quick"}
// ============================================================================
  
  if (!game || !home || !away) return null;

  const homeColor = teamColor(home);
  const awayColor = teamColor(away);
  const RINK_H = 560;

  return (
    <div className="container">

{/* ===================================================================== */}
{/* HEADER CONTROLS — LAYOUT TOGGLE                                      */}
{/* ===================================================================== */}

<div className="button-group" style={{ marginBottom: 8 }}>

  {/* Toggle layout */}
  <button
    className={`btn ${layoutMode === "quick" ? "btn-blue" : "btn-grey"}`}
    onClick={() => setLayoutMode("quick")}
  >
    ⚡ Quick
  </button>

  <button
    className={`btn ${layoutMode === "rink" ? "btn-blue" : "btn-grey"}`}
    onClick={() => setLayoutMode("rink")}
  >
    🏒 Rink
  </button>

  <Link className="btn btn-grey" to={`/games/${slug}/roster`}>
    Roster
  </Link>

  <Link className="btn btn-grey" to="/games">
    Back to Games
  </Link>
</div>

      

      {/* header: scores + clock + shots */}

<div
  style={{
    display: "grid",
    gridTemplateColumns: isPhone ? "1fr" : "1fr auto 1fr",
    gap: isPhone ? 8 : 12,
    alignItems: "center",
  }}
>

      
        <div>
          <ScoreCard team={away} score={game.away_score || 0} side="left" />
          <ShotCounter
            label="Shots"
            value={awayShots}
            onMinus={() => handleShotMinus(away.id)}
            onPlus={() => openShotForTeam(away.id)}
            onManual={(v) => changeAwayShots(v)}
            align="left"
          />
        </div>

        <ClockBlock
          running={running}
          clock={clock}
          onClockChange={(v) => {
            const clean = v.replace(/[^\d:]/g, "");
            setClock(clean);
            remainingMs.current = mmssToMs(clean);
          }}
          onStart={() => (running ? stopClock() : startClock())}
          onReset={resetClock}
          period={period}
          setPeriod={(v) => setPeriod(clamp(v, 1, 9))}
          lenMin={lenMin}
          setLenMin={(v) => setLenMin(clamp(v, 1, 30))}
        />

        <div>
          <ScoreCard team={home} score={game.home_score || 0} side="right" />
          <ShotCounter
            label="Shots"
            value={homeShots}
            onMinus={() => handleShotMinus(home.id)}
            onPlus={() => openShotForTeam(home.id)}
            onManual={(v) => changeHomeShots(v)}
            align="right"
          />
        </div>
      </div>


{/* ===================================================================== */}
{/* MAIN LAYOUT AREA                                                     */}
{/* ===================================================================== */}

{layoutMode === "rink" && (
  <div className="live-rink-layout">
    <Bench
      title={away.short_name || away.name}
      players={awayDressed}
      color={awayColor}
      height={RINK_H}
      benchTeamId={away.id}
      onDropBack={(pid, tid) =>
        tid === away.id && setOnIce((cur) => cur.filter((t) => t.id !== pid))
      }
    />

    <Rink
      height={RINK_H}
      onDrop={rinkDrop}
      onDropTopNet={dropOnTopNet}
      onDropBottomNet={dropOnBottomNet}
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
      onDropBack={(pid, tid) =>
        tid === home.id && setOnIce((cur) => cur.filter((t) => t.id !== pid))
      }
    />
  </div>
)}

      
      {layoutMode === "quick" && (
  <div
    className="card"
    style={{
      marginTop: 12,
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16,
    }}
  >
    {/* AWAY TEAM */}
    <div>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>
        {away.short_name || away.name}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isPhone
  ? "repeat(5, 48px)"
  : "repeat(4, 56px)", gap: 10 }}>
        {awayDressed.map((p) => (


<button
  key={p.id}
  onClick={() =>
    setQuickPick({
      playerId: p.id,
      teamId: away.id,
      number: p.number,
      name: p.name,
    })
  }
  style={{
   width: isPhone ? 48 : 56,
    height: isPhone ? 48 : 56,
    borderRadius: 999,
    background: awayColor,
    color: "#fff",
    fontWeight: 900,
    fontSize: isPhone ? 16 : 18,
    border: "none",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
  }}
>
  {p.number ?? "•"}
</button>

    
        ))}
      </div>
    </div>

    {/* HOME TEAM */}
    <div>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>
        {home.short_name || home.name}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isPhone
  ? "repeat(5, 48px)"
  : "repeat(4, 56px)", gap: 10 }}>

        {homeDressed.map((p) => (

<button
  key={p.id}
  onClick={() =>
    setQuickPick({
      playerId: p.id,
      teamId: home.id,
      number: p.number,
      name: p.name,
    })
  }
  style={{
   width: isPhone ? 48 : 56,
height: isPhone ? 48 : 56,
    borderRadius: 999,
    background: homeColor,
    color: "#fff",
    fontWeight: 900,
    fontSize: isPhone ? 16 : 18,
    border: "none",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
  }}
>
  {p.number ?? "•"}
</button>

    
))}

      </div>
    </div>
  </div>
)}

      

      {/* events */}
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Events</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
  <tr style={{ textAlign: "left", color: "#666" }}>
    {!isPhone && <th style={{ padding: 8 }}>PERIOD</th>}
    <th style={{ padding: 8 }}>TIME</th>
    {!isPhone && <th style={{ padding: 8 }}>TEAM</th>}
    <th style={{ padding: 8 }}>TYPE</th>
    <th style={{ padding: 8 }}>PLAYER / ASSISTS</th>
    <th />
  </tr>
</thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 10, color: "#8a8a8a" }}>
                  —
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              if (r.goal) {
                const aTxt = r.assists
                  .map((a) => a.players?.name || (a.players?.number ? `#${a.players.number}` : "—"))
                  .join(", ");
                const teamLabel = r.goal.teams?.short_name || r.goal.teams?.name || "";
                return (
                  <tr key={`g${i}`} style={{ borderTop: "1px solid #f0f0f0" }}>
                    {!isPhone && <td style={{ padding: 8 }}>{r.goal.period}</td>}
<td style={{ padding: 8 }}>{r.goal.time_mmss}</td>
{!isPhone && <td style={{ padding: 8 }}>{teamLabel}</td>}

                    <td style={{ padding: 8 }}>goal</td>
                    <td style={{ padding: 8 }}>
                      <strong>
                        {r.goal.players?.name || (r.goal.players?.number ? `#${r.goal.players.number}` : "—")}
                      </strong>
                      {aTxt && <span style={{ color: "#666" }}> (A: {aTxt})</span>}
                    </td>
                    <td style={{ padding: 8, textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button className="btn btn-grey" onClick={() => openGoalFor(null, null, r)}>
                        Edit
                      </button>
                      <button className="btn btn-grey" onClick={() => deleteRow(r)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              }
              const e = r.single;
              return (
                <tr key={`o${e.id}`} style={{ borderTop: "1px solid #f0f0f0" }}>
                 {!isPhone && <td style={{ padding: 8 }}>{e.period}</td>}
<td style={{ padding: 8 }}>{e.time_mmss}</td>
{!isPhone && (
  <td style={{ padding: 8 }}>
    {e.teams?.short_name || e.teams?.name || ""}
  </td>
)}


                  <td style={{ padding: 8 }}>{e.event}</td>
                  <td style={{ padding: 8 }}>{e.players?.name || (e.players?.number ? `#${e.players.number}` : "—")}</td>
                  <td style={{ padding: 8, textAlign: "right" }}>
                    <button className="btn btn-grey" onClick={() => deleteRow(r)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* goal modal */}
      {goalPick && (
        <Modal>
          <div className="card" style={{ width: 560, maxWidth: "calc(100vw - 24px)" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>{goalPick.editKey ? "Edit Goal" : "Confirm Goal"}</div>
            <div className="muted" style={{ marginBottom: 8 }}>
              {goalPick.team_id === home.id
                ? home.short_name || home.name
                : goalPick.team_id === away.id
                ? away.short_name || away.name
                : ""}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "100px 120px 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <div className="muted">Period</div>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={goalPeriod}
                  onChange={(e) => setGoalPeriod(parseInt(e.target.value || "1", 10))}
                />
              </div>
              <div>
                <div className="muted">Time</div>
                <input className="input" value={goalTime} onChange={(e) => setGoalTime(e.target.value.replace(/[^\d:]/g, ""))} />
              </div>
              <div>
                <div className="muted">Scorer</div>
                <select
                  className="input"
                  value={goalPick.scorer}
                  onChange={(e) => setGoalPick((g) => ({ ...g, scorer: Number(e.target.value) }))}
                >
                  {(goalPick.team_id === home.id ? homeDressed : awayDressed).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.number ? `#${p.number} ` : ""}
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>


            {/* ================= QUICK MODE ASSISTS ================= */}
{goalPick.quick ? (
  <div>
    <div className="muted" style={{ marginBottom: 6 }}>
      Tap assists (optional, max 2)
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: isPhone
  ? "repeat(5, 48px)"
  : isCompact
  ? "repeat(4, 52px)"
  : "repeat(4, 56px)",
gap: isPhone ? 8 : 10,
      }}
    >
      {quickAssistChoices.map((p) => {
        const selected = quickAssists.includes(p.id);

        return (
          <button
            key={p.id}
            onClick={() => toggleQuickAssist(p.id)}
            style={{
              width: isPhone ? 48 : 56,
             height: isPhone ? 48 : 56,
              borderRadius: 999,
              background: selected ? "#16a34a" : "#e5e7eb",
              color: selected ? "#fff" : "#111",
              fontWeight: 900,
             fontSize: isPhone ? 16 : 18,
              border: "none",
              cursor: "pointer",
              boxShadow: selected
                ? "0 0 0 3px rgba(22,163,74,0.6)"
                : "0 2px 6px rgba(0,0,0,0.15)",
            }}
          >
            {p.number ?? "•"}
          </button>
        );
      })}
    </div>
  </div>
) : (
  /* ================= RINK MODE (EXISTING) ================= */
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
    {/* existing Assist 1 / Assist 2 dropdowns */}
  </div>
)}


            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn btn-grey" onClick={() => setGoalPick(null)}>
                Cancel
              </button>
              <button className="btn btn-blue" onClick={confirmGoal}>
                {goalPick.editKey ? "Save" : "Confirm Goal"}
              </button>
            </div>
          </div>
        </Modal>
      )}

{/* ===================================================================== */}
{/* QUICK MODE ACTION MODAL (PLAYER CONTEXT MENU)                         */}
{/* ===================================================================== */}

{quickPick && (
  <Modal>
    <div
      className="card"
      style={{
        width: isPhone ? "100%" : 320,
maxWidth: "calc(100vw - 24px)",
        textAlign: "center",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 6 }}>
        #{quickPick.number} {quickPick.name}
      </div>

      <div className="muted" style={{ marginBottom: 12 }}>
        Choose action
      </div>

      <div
  style={{
    display: "flex",
    gap: 10,
    justifyContent: "center",
    flexWrap: "wrap",
  }}
>

        {/* GOAL */}
        <button
          className="btn btn-blue"

    onClick={() => {
  setGoalPick({
    scorer: quickPick.playerId,
    team_id: quickPick.teamId,
    quick: true, // 🔥 FLAG: we are in tap-based mode
  });

  setQuickAssists([]); // reset tap assists
  setGoalPeriod(period);
  setGoalTime(clock);

  setQuickPick(null);
}}

     
        >
          🥅 Goal
        </button>

        {/* SHOT */}
        <button
          className="btn btn-grey"
          onClick={async () => {
            // direct shot, no shooter selection
            setQuickPick(null);

            setShotPick({ team_id: quickPick.teamId });
            setShotShooter(quickPick.playerId);
            setShotPeriod(period);
            setShotTime(clock);

            await confirmShot();
          }}
        >
          🎯 Shot
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <button
          className="btn btn-grey"
          onClick={() => setQuickPick(null)}
        >
          Cancel
        </button>
      </div>
    </div>
  </Modal>
)}


      
      {/* shot modal */}
      {shotPick && (
        <Modal>
          <div className="card" style={{ width: 480, maxWidth: "calc(100vw - 24px)" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Record Shot</div>
            <div className="muted" style={{ marginBottom: 8 }}>
              {shotPick.team_id === home.id
                ? home.short_name || home.name
                : shotPick.team_id === away.id
                ? away.short_name || away.name
                : ""}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "100px 120px 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <div className="muted">Period</div>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={shotPeriod}
                  onChange={(e) => setShotPeriod(parseInt(e.target.value || "1", 10))}
                />
              </div>
              <div>
                <div className="muted">Time</div>
                <input className="input" value={shotTime} onChange={(e) => setShotTime(e.target.value.replace(/[^\d:]/g, ""))} />
              </div>
              <div>
                <div className="muted">Shooter</div>
                <select className="input" value={shotShooter} onChange={(e) => setShotShooter(e.target.value)}>
                  <option value="">—</option>
                  {shotChoices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.number ? `#${p.number} ` : ""}
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn btn-grey" onClick={() => setShotPick(null)}>
                Cancel
              </button>
              <button className="btn btn-blue" onClick={confirmShot}>
                Confirm Shot
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// SECTION 10 — DUMB SUBCOMPONENTS
// NO business logic, safe to reuse anywhere
// ============================================================================

// ScoreCard
// ShotCounter
// ClockBlock
// Bench
// Rink
// IceToken
// Modal


function ScoreCard({ team, score, side }) {
  return (
    <div
      className="card"
      style={{
        padding: 10,
        display: "flex",
        alignItems: "center",
        gap: 12,
        justifyContent: side === "left" ? "flex-start" : "flex-end",
      }}
    >
      {side === "left" && <TeamLogoLarge team={team} />}
      <div
        style={{
          background: "#0d2a66",
          color: "#fff",
          fontWeight: 900,
          fontSize: isPhone ? 22 : 28,
          borderRadius: 12,
          minWidth: isPhone ? 60 : 76,
          textAlign: "center",
          padding: isPhone ? "8px 12px" : "10px 16px",
        }}
      >
        {score}
      </div>
      {side === "right" && <TeamLogoLarge team={team} />}
    </div>
  );
}

function ShotCounter({ label, value, onMinus, onPlus, onManual, align = "left" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 6,
        justifyContent: align === "left" ? "flex-start" : "flex-end",
      }}
    >
      <span className="muted" style={{ minWidth: 50 }}>
        {label}
      </span>
      <button className="btn btn-grey" onClick={onMinus}>
        −
      </button>
      <input
        className="input"
        value={value}
        onChange={(e) => onManual(parseInt(e.target.value || "0", 10) || 0)}
        style={{ width: 70, textAlign: "center" }}
      />
      <button className="btn btn-grey" onClick={onPlus}>
        +
      </button>
    </div>
  );
}

function TeamLogoLarge({ team }) {
  const src = team?.logo_url;
  const name = team?.short_name || team?.name || "";
  return src ? (
    <img src={src} alt={name} style={{ width: 84, height: 48, objectFit: "contain" }} />
  ) : (
    <div
      style={{
        width: 84,
        height: 48,
        borderRadius: 10,
        background: "#f4f7ff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        fontSize: 20,
      }}
    >
      {name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 3)}
    </div>
  );
}

function ClockBlock({ running, clock, onClockChange, onStart, onReset, period, setPeriod, lenMin, setLenMin }) {
  return (
    <div className="card" style={{ padding: 12, textAlign: "center", minWidth: isPhone ? "100%" : 340 }}>
      <input
        className="input"
        value={clock}
        onChange={(e) => onClockChange(e.target.value)}
        style={{ fontWeight: 900, fontSize: 34, textAlign: "center" }}
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
        <button className="btn btn-grey" onClick={onStart}>
          {running ? "Stop" : "Start"}
        </button>
        <button className="btn btn-grey" onClick={onReset}>
          Reset
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
        <span className="muted">Len</span>
        <input
          className="input"
          type="number"
          min={1}
          max={30}
          value={lenMin}
          onChange={(e) => setLenMin(parseInt(e.target.value || "15", 10))}
          style={{ width: 70 }}
        />
        <span className="muted">min</span>
        <span style={{ width: 12 }} />
        <span className="muted">Period</span>
        <input
          className="input"
          type="number"
          min={1}
          value={period}
          onChange={(e) => setPeriod(parseInt(e.target.value || "1", 10))}
          style={{ width: 70 }}
        />
      </div>
    </div>
  );
}

function Bench({ title, players, color, height, benchTeamId, onDropBack }) {
  return (
    <div
      className="card"
      style={{ height }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        try {
          const p = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
          if (p?.id) onDropBack?.(p.id, p.team_id);
        } catch {}
      }}
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
            onDragStart={(e) =>
              e.dataTransfer.setData("text/plain", JSON.stringify({ id: p.id, team_id: benchTeamId }))
            }
            className="chip"
            title={`Drag #${p.number ?? "?"} onto the rink`}
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              background: color,
              color: textOn(color),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: 18,
              cursor: "grab",
              boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
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
  onDrop,
  onDropTopNet,
  onDropBottomNet,
  home,
  away,
  homeDressed,
  awayDressed,
  onIce,
  setOnIce,
  goalieOnIce,
  setGoalie,
  homeColor,
  awayColor,
}) {
  return (
    <div
      style={{
        position: "relative",
        height,
        borderRadius: 16,
        border: "1px solid #d6e2ff",
        overflow: "hidden",
        background: `repeating-linear-gradient(0deg,#1c5fe0,#1c5fe0 10px,#1a59d2 10px,#1a59d2 20px)`,
        boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.05)",
        userSelect: "none",
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {/* yellow bands */}
      <div style={{ position: "absolute", left: 0, right: 0, height: 10, background: "#ffd400", top: 0 }} />
      <div style={{ position: "absolute", left: 0, right: 0, height: 10, background: "#ffd400", bottom: 0 }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: 10,
          background: "#ffd400",
          top: "50%",
          transform: "translateY(-50%)",
        }}
      />

      {/* creases (top=HOME, bottom=AWAY) */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={onDropTopNet}
        title="Drop HOME scorer here"
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          width: "28%",
          height: "14%",
          top: "5%",
          borderRadius: 12,
          border: "3px solid #ffd400",
          background: "rgba(255,212,0,0.10)",
        }}
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={onDropBottomNet}
        title="Drop AWAY scorer here"
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          width: "28%",
          height: "14%",
          bottom: "5%",
          borderRadius: 12,
          border: "3px solid #ffd400",
          background: "rgba(255,212,0,0.10)",
        }}
      />

      {/* goalie selects */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          color: "#fff",
          textShadow: "0 1px 2px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ fontSize: 12, marginBottom: 4 }}>{away.short_name || away.name} Goalie</div>
        <select className="input" value={goalieOnIce[away.id] || ""} onChange={(e) => setGoalie(away.id, Number(e.target.value) || null)}>
          <option value="">—</option>
          {awayDressed
            .filter((p) => (p.position || "").toLowerCase().includes("g"))
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.number ? `#${g.number} ` : ""}
                {g.name}
              </option>
            ))}
        </select>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 10,
          right: 10,
          color: "#fff",
          textShadow: "0 1px 2px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ fontSize: 12, marginBottom: 4 }}>{home.short_name || home.name} Goalie</div>
        <select className="input" value={goalieOnIce[home.id] || ""} onChange={(e) => setGoalie(home.id, Number(e.target.value) || null)}>
          <option value="">—</option>
          {homeDressed
            .filter((p) => (p.position || "").toLowerCase().includes("g"))
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.number ? `#${g.number} ` : ""}
                {g.name}
              </option>
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
            player={p}
            teamId={t.team_id}
            x={t.x}
            y={t.y}
            color={col}
            onMove={(nx, ny) => setOnIce((cur) => cur.map((it) => (it.id === t.id ? { ...it, x: nx, y: ny } : it)))}
            onRemove={() => setOnIce((cur) => cur.filter((it) => it.id !== t.id))}
          />
        );
      })}
    </div>
  );
}

function IceToken({ player, teamId, x, y, color, onMove, onRemove }) {
  const ref = useRef(null);
  function onDragStart(e) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ id: player.id, team_id: teamId }));
  }
  function onDragEnd(e) {
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
        fontWeight: 900,
        fontSize: 18,
        cursor: "grab",
        boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
      }}
      title="Drag to move • Drag back to bench or double-click to remove"
    >
      {player.number ?? "•"}
    </div>
  );
}

function Modal({ children }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        zIndex: 50,
      }}
    >
      {children}
    </div>
  );
}
