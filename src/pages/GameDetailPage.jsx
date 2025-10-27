// src/pages/GameDetailPage.jsx
import React from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient.js";

function useClock(defaultMinutes = 15) {
  const [periodLen, setPeriodLen] = React.useState(defaultMinutes);
  const [secondsLeft, setSecondsLeft] = React.useState(defaultMinutes * 60);
  const [running, setRunning] = React.useState(false);
  const tickRef = React.useRef(null);

  React.useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [running]);

  const reset = React.useCallback(() => {
    setSecondsLeft(periodLen * 60);
    setRunning(false);
  }, [periodLen]);

  const applyLen = React.useCallback((m) => {
    const mm = Number(m) || 15;
    setPeriodLen(mm);
    setSecondsLeft(mm * 60);
  }, []);

  const stamp = React.useCallback(() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }, [secondsLeft]);

  return {
    periodLen,
    secondsLeft,
    running,
    setRunning,
    reset,
    applyLen,
    stamp,
    setSecondsLeft,
  };
}

export default function GameDetailPage() {
  const { slug } = useParams();
  const nav = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving]   = React.useState(false);

  // Game + teams
  const [game, setGame] = React.useState(null);
  const [homeTeam, setHomeTeam] = React.useState(null);
  const [awayTeam, setAwayTeam] = React.useState(null);

  // Rosters (by team)
  const [homePlayers, setHomePlayers] = React.useState([]);
  const [awayPlayers, setAwayPlayers] = React.useState([]);

  // Selected fields for new event
  const [teamSide, setTeamSide] = React.useState("home"); // 'home' | 'away'
  const [etype, setEtype] = React.useState("goal");       // goal|assist|shot|penalty
  const [period, setPeriod] = React.useState(1);
  const [timeMMSS, setTimeMMSS] = React.useState("15:00");
  const [playerId, setPlayerId] = React.useState("");
  const [assist1Id, setAssist1Id] = React.useState("");
  const [assist2Id, setAssist2Id] = React.useState("");

  // goalies on ice (dropdown)
  const [homeGoalieId, setHomeGoalieId] = React.useState("");
  const [awayGoalieId, setAwayGoalieId] = React.useState("");

  // live events list
  const [events, setEvents] = React.useState([]);

  // clock
  const clock = useClock(15);

  // util maps
  const homeMap = React.useMemo(
    () => Object.fromEntries(homePlayers.map(p => [p.id, p])),
    [homePlayers]
  );
  const awayMap = React.useMemo(
    () => Object.fromEntries(awayPlayers.map(p => [p.id, p])),
    [awayPlayers]
  );

  // load
  React.useEffect(() => {
    (async () => {
      setLoading(true);

      // game + teams
      const { data: g, error: ge } = await supabase
        .from("games")
        .select(`
          id, slug, game_date, status,
          home_team_id, away_team_id,
          home_team:teams!games_home_team_id_fkey(id, name, short_name, logo_url),
          away_team:teams!games_away_team_id_fkey(id, name, short_name, logo_url)
        `)
        .eq("slug", slug)
        .maybeSingle();

      if (ge || !g) {
        alert(ge?.message || "Game not found");
        setLoading(false);
        return;
      }
      setGame(g);
      setHomeTeam(g.home_team);
      setAwayTeam(g.away_team);

      // rosters
      const [homeR, awayR] = await Promise.all([
        supabase.from("players").select("id, name, number, position").eq("team_id", g.home_team_id).order("number", { ascending: true }),
        supabase.from("players").select("id, name, number, position").eq("team_id", g.away_team_id).order("number", { ascending: true }),
      ]);
      setHomePlayers(homeR.data || []);
      setAwayPlayers(awayR.data || []);

      // default goalie pickers (first G if present)
      const hG = (homeR.data||[]).find(p => (p.position||"").toUpperCase()==="G");
      const aG = (awayR.data||[]).find(p => (p.position||"").toUpperCase()==="G");
      setHomeGoalieId(hG?.id || "");
      setAwayGoalieId(aG?.id || "");

      // events (no joins; we’ll map ids to names client side)
      const { data: evs } = await supabase
        .from("events")
        .select("id, game_id, team_id, player_id, period, time_mmss, event")
        .eq("game_id", g.id)
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: true });
      setEvents(evs || []);

      setLoading(false);
    })();
  }, [slug]);

  // realtime refresh
  React.useEffect(() => {
    if (!game?.id) return;
    const ch = supabase
      .channel(`g-${game.id}-events`)
      .on("postgres_changes",{ event:"*", schema:"public", table:"events", filter:`game_id=eq.${game.id}` },
        async () => {
          const { data } = await supabase
            .from("events")
            .select("id, game_id, team_id, player_id, period, time_mmss, event")
            .eq("game_id", game.id)
            .order("period", { ascending: true })
            .order("time_mmss", { ascending: true });
          setEvents(data || []);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [game?.id]);

  const teamInfo = (side) => (side==="home" ? homeTeam : awayTeam);
  const roster    = (side) => (side==="home" ? homePlayers : awayPlayers);
  const playerMap = (side) => (side==="home" ? homeMap : awayMap);
  const sideTeamId = (side) => (side==="home" ? game.home_team_id : game.away_team_id);

  // score computed from events
  const score = React.useMemo(() => {
    let home = 0, away = 0;
    for (const e of events) {
      if (e.event === "goal") {
        if (e.team_id === game?.home_team_id) home++;
        if (e.team_id === game?.away_team_id) away++;
      }
    }
    return { home, away };
  }, [events, game]);

  // helpers
  function labelPlayer(p) {
    if (!p) return "—";
    const num = p.number != null ? `#${p.number} ` : "";
    return `${num}— ${p.name}`;
  }

  // goalie stat helpers: ensure a game_goalies row exists, then increment fields
  async function ensureGoalieRow(gameId, teamId, playerId) {
    if (!playerId) return null;
    const { data: found } = await supabase
      .from("game_goalies")
      .select("id")
      .eq("game_id", gameId)
      .eq("team_id", teamId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (found) return found.id;
    const { data, error } = await supabase
      .from("game_goalies")
      .insert({ game_id: gameId, team_id: teamId, player_id: playerId, shots_against: 0, goals_against: 0 })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async function bumpGoalie(gameId, teamId, playerId, field, delta=1) {
    if (!playerId) return;
    const rowId = await ensureGoalieRow(gameId, teamId, playerId);
    await supabase
      .from("game_goalies")
      .update({ [field]: supabase.rpc ? undefined : undefined }) // no-op placeholder so Vercel bundler doesn’t remove the call below
      .eq("id", rowId);
    // do atomic update via SQL; if you don’t have an RPC, fall back to fetch current+1
    await supabase.rpc?.("inc_goalie_stat", { row_id: rowId, fld: field, amt: delta })
      .catch(async () => {
        // fallback: read then write
        const { data: cur } = await supabase.from("game_goalies").select("shots_against, goals_against").eq("id", rowId).single();
        const patch = { shots_against: cur.shots_against, goals_against: cur.goals_against };
        patch[field] = (patch[field] || 0) + delta;
        await supabase.from("game_goalies").update(patch).eq("id", rowId);
      });
  }

  // quick shot buttons (top controls)
  async function addQuickShot(side) {
    if (!game) return;
    setSaving(true);
    try {
      const teamId = sideTeamId(side);
      const oppTeamId = side === "home" ? game.away_team_id : game.home_team_id;
      const oppGoalieId = side === "home" ? awayGoalieId : homeGoalieId;

      // insert a 'shot' event
      await supabase.from("events").insert([{
        game_id: game.id,
        team_id: teamId,
        player_id: null,
        period,
        time_mmss: timeMMSS,
        event: "shot",
      }]);

      // SA for opposite goalie
      await bumpGoalie(game.id, oppTeamId, oppGoalieId, "shots_against", 1);
    } catch (e) {
      alert(e.message || "Failed to add shot");
    } finally {
      setSaving(false);
    }
  }

  async function addEvent() {
    if (!game) return;
    setSaving(true);
    try {
      const teamId = sideTeamId(teamSide);
      const oppTeamId = teamSide === "home" ? game.away_team_id : game.home_team_id;
      const oppGoalieId = teamSide === "home" ? awayGoalieId : homeGoalieId;

      const rows = [];

      if (etype === "goal") {
        if (!playerId) {
          alert("Select a scorer.");
          setSaving(false);
          return;
        }
        rows.push({
          game_id: game.id,
          team_id: teamId,
          player_id: Number(playerId),
          period,
          time_mmss: timeMMSS,
          event: "goal",
        });
        if (assist1Id) {
          rows.push({
            game_id: game.id,
            team_id: teamId,
            player_id: Number(assist1Id),
            period,
            time_mmss: timeMMSS,
            event: "assist",
          });
        }
        if (assist2Id) {
          rows.push({
            game_id: game.id,
            team_id: teamId,
            player_id: Number(assist2Id),
            period,
            time_mmss: timeMMSS,
            event: "assist",
          });
        }

        // write rows in one call
        await supabase.from("events").insert(rows);

        // goalie GA + SA for opponent
        await bumpGoalie(game.id, oppTeamId, oppGoalieId, "goals_against", 1);
        await bumpGoalie(game.id, oppTeamId, oppGoalieId, "shots_against", 1);
      } else if (etype === "assist" || etype === "shot" || etype === "penalty") {
        rows.push({
          game_id: game.id,
          team_id: teamId,
          player_id: playerId ? Number(playerId) : null,
          period,
          time_mmss: timeMMSS,
          event: etype,
        });
        await supabase.from("events").insert(rows);

        if (etype === "shot") {
          // add SA to opposite goalie
          await bumpGoalie(game.id, oppTeamId, oppGoalieId, "shots_against", 1);
        }
      }

      // clear only the assists for convenience
      setAssist1Id("");
      setAssist2Id("");
    } catch (e) {
      alert(e.message || "Failed to add event");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent(id) {
    await supabase.from("events").delete().eq("id", id);
  }

  function playerDisplayName(pid, teamId) {
    if (!pid) return "—";
    const map = teamId === game.home_team_id ? homeMap : awayMap;
    const p = map[pid];
    return p ? labelPlayer(p) : `#${pid}`;
  }

  if (loading) return <div className="container">Loading…</div>;
  if (!game)   return null;

  const leftTeam  = awayTeam; // away on the left
  const rightTeam = homeTeam; // home on the right

  return (
    <div className="container" style={{ gap: 16, display: "grid" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <Link to="/games" className="btn secondary">← Back to Games</Link>
        <div className="kicker">LIVE • {new Date(game.game_date).toISOString().slice(0,10)}</div>
      </div>

      {/* ===== Controls up top ===== */}
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <div>
            <div className="kicker">Team</div>
            <select value={teamSide} onChange={e=>setTeamSide(e.target.value)}>
              <option value="away">{awayTeam?.short_name || awayTeam?.name}</option>
              <option value="home">{homeTeam?.short_name || homeTeam?.name}</option>
            </select>
          </div>
          <div>
            <div className="kicker">Type</div>
            <select value={etype} onChange={e=>setEtype(e.target.value)}>
              <option value="goal">Goal</option>
              <option value="assist">Assist</option>
              <option value="shot">Shot</option>
              <option value="penalty">Penalty</option>
            </select>
          </div>
          <div style={{ minWidth: 260 }}>
            <div className="kicker">Player</div>
            <select value={playerId} onChange={e=>setPlayerId(e.target.value)}>
              <option value="">—</option>
              {roster(teamSide).map(p=>(
                <option key={p.id} value={p.id}>{labelPlayer(p)}</option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 260 }}>
            <div className="kicker">Assist 1</div>
            <select value={assist1Id} onChange={e=>setAssist1Id(e.target.value)}>
              <option value="">—</option>
              {roster(teamSide).map(p=>(
                <option key={p.id} value={p.id}>{labelPlayer(p)}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 260 }}>
            <div className="kicker">Assist 2</div>
            <select value={assist2Id} onChange={e=>setAssist2Id(e.target.value)}>
              <option value="">—</option>
              {roster(teamSide).map(p=>(
                <option key={p.id} value={p.id}>{labelPlayer(p)}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="kicker">Period</div>
            <select value={period} onChange={e=>setPeriod(Number(e.target.value))}>
              {[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div>
            <div className="kicker">Time (MM:SS)</div>
            <input value={timeMMSS} onChange={e=>setTimeMMSS(e.target.value)} style={{ width: 80 }} />
          </div>

          <div style={{ alignSelf: "end" }}>
            <button className="btn secondary" onClick={()=>setTimeMMSS(clock.stamp())}>Stamp clock</button>
          </div>

          <div style={{ alignSelf: "end" }}>
            <button className="btn" onClick={addEvent} disabled={saving}>
              {saving ? "Saving…" : "Add event"}
            </button>
          </div>
        </div>

        {/* Quick: shots (also pushes SA to opposite goalie) */}
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="kicker">Quick:</span>
          <button className="btn secondary" onClick={()=>addQuickShot("away")}>
            {awayTeam?.short_name || "Away"} Shot +
          </button>
          <button className="btn secondary" onClick={()=>addQuickShot("home")}>
            {homeTeam?.short_name || "Home"} Shot +
          </button>
        </div>

        {/* Goalies on ice */}
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 280 }}>
            <div className="kicker">{awayTeam?.short_name || "Away"} goalie on ice</div>
            <select value={awayGoalieId} onChange={e=>setAwayGoalieId(e.target.value)}>
              <option value="">—</option>
              {awayPlayers
                .filter(p => (p.position||"").toUpperCase()==="G")
                .map(p=> <option key={p.id} value={p.id}>{labelPlayer(p)}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 280 }}>
            <div className="kicker">{homeTeam?.short_name || "Home"} goalie on ice</div>
            <select value={homeGoalieId} onChange={e=>setHomeGoalieId(e.target.value)}>
              <option value="">—</option>
              {homePlayers
                .filter(p => (p.position||"").toUpperCase()==="G")
                .map(p=> <option key={p.id} value={p.id}>{labelPlayer(p)}</option>)}
            </select>
          </div>

          {/* Clock controls */}
          <div className="row" style={{ gap: 8, alignItems: "end" }}>
            <div className="kicker">Clock</div>
            <div style={{ fontVariantNumeric:"tabular-nums", minWidth: 56, textAlign: "right" }}>
              {String(Math.floor(clock.secondsLeft/60)).padStart(2,"0")}:
              {String(clock.secondsLeft%60).padStart(2,"0")}
            </div>
            <button className="btn secondary" onClick={()=>clock.setRunning(!clock.running)}>
              {clock.running ? "Stop" : "Start"}
            </button>
            <button className="btn secondary" onClick={clock.reset}>Reset</button>
            <input
              type="number"
              value={clock.periodLen}
              onChange={(e)=>clock.applyLen(e.target.value)}
              style={{ width: 60 }}
            />
            <div className="kicker">set period (minutes)</div>
          </div>
        </div>
      </div>

      {/* ===== Scoreboard (side-by-side) ===== */}
      <div className="card">
        <div className="row" style={{ justifyContent:"space-between", alignItems:"center" }}>
          <div className="row" style={{ alignItems:"center", gap: 8 }}>
            {leftTeam?.logo_url && <img src={leftTeam.logo_url} alt="" width="28" height="28" style={{ objectFit:"contain" }}/>}
            <div>
              <div className="kicker">{awayTeam?.short_name}</div>
              <div className="kicker" style={{ color:"#555" }}> {awayTeam?.name}</div>
            </div>
          </div>

          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {score.away} <span className="kicker" style={{ margin: "0 8px" }}>vs</span> {score.home}
          </div>

          <div className="row" style={{ alignItems:"center", gap: 8 }}>
            {rightTeam?.logo_url && <img src={rightTeam.logo_url} alt="" width="28" height="28" style={{ objectFit:"contain" }}/>}
            <div style={{ textAlign:"right" }}>
              <div className="kicker">{homeTeam?.short_name}</div>
              <div className="kicker" style={{ color:"#555" }}> {homeTeam?.name}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Events table ===== */}
      <div className="card">
        <h3 className="m0">Events</h3>
        <div style={{ overflowX:"auto", marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Time</th>
                <th>Team</th>
                <th>Type</th>
                <th>Player</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr><td colSpan={6} style={{ color:"#777" }}>—</td></tr>
              ) : (
                events.map((e) => {
                  const tShort =
                    e.team_id === game.home_team_id
                      ? (homeTeam?.short_name || "HOME")
                      : (awayTeam?.short_name || "AWAY");
                  const name = playerDisplayName(e.player_id, e.team_id);
                  return (
                    <tr key={e.id}>
                      <td>{e.period}</td>
                      <td>{e.time_mmss}</td>
                      <td>{tShort}</td>
                      <td>{e.event}</td>
                      <td>{name}</td>
                      <td>
                        <button className="btn secondary" onClick={()=>deleteEvent(e.id)}>Delete</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
