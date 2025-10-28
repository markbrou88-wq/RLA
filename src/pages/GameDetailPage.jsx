import React from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
// CHANGED: add this import
import PlayerLink from "../components/PlayerLink";

let useI18n; try { useI18n = require("../i18n").useI18n; } catch { useI18n = () => ({ t:(s)=>s }); }

/* Clock */
function useClock(defaultMinutes = 15) {
  const [periodLen, setPeriodLen] = React.useState(defaultMinutes);
  const [secondsLeft, setSecondsLeft] = React.useState(defaultMinutes * 60);
  const [running, setRunning] = React.useState(false);
  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSecondsLeft(s => (s>0 ? s-1 : 0)), 1000);
    return () => clearInterval(id);
  }, [running]);
  const stamp = React.useCallback(() => {
    const m = Math.floor(secondsLeft/60), s = secondsLeft%60;
    return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }, [secondsLeft]);
  const reset = React.useCallback(() => { setSecondsLeft(periodLen*60); setRunning(false); }, [periodLen]);
  const applyLen = React.useCallback((m) => {
    const mm = Number(m)||15; setPeriodLen(mm); setSecondsLeft(mm*60);
  }, []);
  return { periodLen, setPeriodLen, secondsLeft, setSecondsLeft, running, setRunning, stamp, reset, applyLen };
}

export default function GameDetailPage() {
  const { t } = useI18n();
  const { slug } = useParams();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [game, setGame] = React.useState(null);
  const [homeTeam, setHomeTeam] = React.useState(null);
  const [awayTeam, setAwayTeam] = React.useState(null);

  const [homePlayers, setHomePlayers] = React.useState([]);
  const [awayPlayers, setAwayPlayers] = React.useState([]);
  const [homeRosterIds, setHomeRosterIds] = React.useState(new Set());
  const [awayRosterIds, setAwayRosterIds] = React.useState(new Set());

  const [homeGoalieId, setHomeGoalieId] = React.useState("");
  const [awayGoalieId, setAwayGoalieId] = React.useState("");

  const [events, setEvents] = React.useState([]);

  const [evtSide, setEvtSide] = React.useState("home"); // home | away
  const [evtType, setEvtType] = React.useState("goal"); // goal | shot | penalty
  const [evtPlayerId, setEvtPlayerId] = React.useState("");
  const [evtA1, setEvtA1] = React.useState("");
  const [evtA2, setEvtA2] = React.useState("");
  const [evtPeriod, setEvtPeriod] = React.useState(1);
  const [evtTime, setEvtTime] = React.useState("15:00");

  const clock = useClock(15);

  const homeMap = React.useMemo(() => Object.fromEntries(homePlayers.map(p => [p.id, p])), [homePlayers]);
  const awayMap = React.useMemo(() => Object.fromEntries(awayPlayers.map(p => [p.id, p])), [awayPlayers]);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: g } = await supabase
        .from("games")
        .select(`
          id, slug, game_date, status, home_score, away_score,
          home_team_id, away_team_id,
          home_team:teams!games_home_team_id_fkey(id, name, short_name, logo_url),
          away_team:teams!games_away_team_id_fkey(id, name, short_name, logo_url)
        `)
        .eq("slug", slug).maybeSingle();
      if (!g) { setLoading(false); return; }
      setGame(g); setHomeTeam(g.home_team); setAwayTeam(g.away_team);

      const [hp, ap] = await Promise.all([
        supabase.from("players").select("id,name,number,position").eq("team_id", g.home_team_id).order("number"),
        supabase.from("players").select("id,name,number,position").eq("team_id", g.away_team_id).order("number"),
      ]);
      setHomePlayers(hp.data||[]); setAwayPlayers(ap.data||[]);

      const { data: rosterRows } = await supabase
        .from("game_rosters")
        .select("team_id, player_id").eq("game_id", g.id);

      setHomeRosterIds(new Set((rosterRows||[]).filter(r=>r.team_id===g.home_team_id).map(r=>r.player_id)));
      setAwayRosterIds(new Set((rosterRows||[]).filter(r=>r.team_id===g.away_team_id).map(r=>r.player_id)));

      const { data: evs } = await supabase
        .from("events")
        .select("id, team_id, player_id, period, time_mmss, event")
        .eq("game_id", g.id).order("period").order("time_mmss");
      setEvents(evs||[]);

      // default goalies
      const hg = (hp.data||[]).find(p => (p.position||"").toUpperCase()==="G");
      const ag = (ap.data||[]).find(p => (p.position||"").toUpperCase()==="G");
      setHomeGoalieId(hg?.id||""); setAwayGoalieId(ag?.id||"");

      setLoading(false);
    })();
  }, [slug]);

  React.useEffect(() => {
    if (!game) return;
    const ch = supabase.channel(`events-${game.id}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"events", filter:`game_id=eq.${game.id}` },
        async () => { await refreshEventsAndGame(); })
      .subscribe();
    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line
  }, [game?.id]);

  async function refreshEventsAndGame() {
    if (!game) return;
    const [{ data: evs }, { data: g }] = await Promise.all([
      supabase.from("events").select("id,team_id,player_id,period,time_mmss,event").eq("game_id", game.id).order("period").order("time_mmss"),
      supabase.from("games").select("id,home_score,away_score,status").eq("id", game.id).single()
    ]);
    setEvents(evs || []);
    if (g) setGame((old) => ({ ...old, home_score: g.home_score, away_score: g.away_score, status: g.status }));
  }

  function labelPlayer(p) {
    if (!p) return "—";
    const num = p.number != null ? `#${p.number} ` : "";
    return `${num}${p.name}`;
  }
  function playerName(pid, teamId) {
    if (!pid) return "—";
    const m = teamId === game.home_team_id ? homeMap : awayMap;
    const p = m[pid];
    return p ? labelPlayer(p) : `#${pid}`;
  }
  function byPeriodTime(a, b) {
    if (a.period !== b.period) return a.period - b.period;
    return (a.time_mmss || "").localeCompare(b.time_mmss || "");
  }
  const scoreFromEvents = React.useMemo(() => {
    let h=0,a=0;
    for (const e of events) if (e.event==="goal") {
      if (e.team_id===game?.home_team_id) h++; else if (e.team_id===game?.away_team_id) a++;
    }
    return {home:h, away:a};
  }, [events, game]);

  const leftTeam = awayTeam;  // away on left
  const rightTeam = homeTeam; // home on right
  const sideTeamId = (side) => side==="home" ? game.home_team_id : game.away_team_id;

  async function toggleRoster(teamId, pid, checked) {
    if (!game) return;
    if (checked) {
      const { error } = await supabase.from("game_rosters").insert({ game_id: game.id, team_id: teamId, player_id: pid });
      if (error && !String(error.message).includes("duplicate")) return alert(error.message);
    } else {
      const { error } = await supabase.from("game_rosters")
        .delete().eq("game_id", game.id).eq("team_id", teamId).eq("player_id", pid);
      if (error) return alert(error.message);
    }
    if (teamId===game.home_team_id) setHomeRosterIds(s => { const n=new Set(s); checked?n.add(pid):n.delete(pid); return n; });
    else setAwayRosterIds(s => { const n=new Set(s); checked?n.add(pid):n.delete(pid); return n; });
  }

  async function ensureGoalieRow(gameId, teamId, playerId) {
    if (!playerId) return null;
    const { data: found } = await supabase
      .from("game_goalies").select("id").eq("game_id", gameId).eq("team_id", teamId).eq("player_id", playerId).maybeSingle();
    if (found) return found.id;
    const { data, error } = await supabase.from("game_goalies")
      .insert({ game_id: gameId, team_id: teamId, player_id: playerId, shots_against:0, goals_against:0 })
      .select("id").single();
    if (error) throw error;
    return data.id;
  }
  async function incGoalie(teamId, playerId, patch) {
    const rowId = await ensureGoalieRow(game.id, teamId, playerId);
    const { data: cur } = await supabase.from("game_goalies")
      .select("shots_against,goals_against").eq("id", rowId).single();
    const next = {
      shots_against: patch.shots_against ?? (cur?.shots_against ?? 0),
      goals_against: patch.goals_against ?? (cur?.goals_against ?? 0),
    };
    await supabase.from("game_goalies").update(next).eq("id", rowId);
  }

  async function quickShot(side, delta) {
    if (!game) return;
    try {
      if (delta > 0) {
        const teamId = sideTeamId(side);
        const defTeamId = side === "home" ? game.away_team_id : game.home_team_id;
        const defGoalieId = side === "home" ? awayGoalieId : homeGoalieId;

        const { data: ins, error } = await supabase.from("events").insert({
          game_id: game.id, team_id: teamId, player_id: null,
          period: evtPeriod, time_mmss: evtTime, event: "shot"
        }).select("id,team_id,player_id,period,time_mmss,event").single();
        if (error) return alert(error.message);
        setEvents(e => [...e, ins].sort(byPeriodTime));

        const { data: cur } = await supabase.from("game_goalies")
          .select("shots_against").eq("game_id", game.id).eq("team_id", defTeamId).eq("player_id", defGoalieId).maybeSingle();
        await incGoalie(defTeamId, defGoalieId, { shots_against: (cur?.shots_against ?? 0)+1 });
      } else {
        const teamId = sideTeamId(side);
        const defTeamId = side === "home" ? game.away_team_id : game.home_team_id;
        const defGoalieId = side === "home" ? awayGoalieId : homeGoalieId;

        const { data: last } = await supabase.from("events")
          .select("id,period,time_mmss").eq("game_id", game.id).eq("team_id", teamId).eq("event", "shot")
          .order("period", { ascending:false }).order("time_mmss", { ascending:false }).limit(1).maybeSingle();
        if (last) {
          await supabase.from("events").delete().eq("id", last.id);
          setEvents(e => e.filter(x => x.id !== last.id));
          const { data: cur } = await supabase.from("game_goalies")
            .select("shots_against").eq("game_id", game.id).eq("team_id", defTeamId).eq("player_id", defGoalieId).maybeSingle();
          await incGoalie(defTeamId, defGoalieId, { shots_against: Math.max(0, (cur?.shots_against ?? 0)-1) });
        }
      }
    } catch (e) {
      alert(e.message);
    }
  }

  async function addEvent() {
    if (!game) return;
    setSaving(true);
    try {
      const teamId = sideTeamId(evtSide);
      const defTeamId = evtSide === "home" ? game.away_team_id : game.home_team_id;
      const defGoalieId = evtSide === "home" ? awayGoalieId : homeGoalieId;

      if (evtType === "goal") {
        if (!evtPlayerId) { setSaving(false); return alert(t("Select a scorer.")); }
        const rows = [
          { game_id: game.id, team_id: teamId, player_id: Number(evtPlayerId), period: evtPeriod, time_mmss: evtTime, event: "goal" }
        ];
        if (evtA1) rows.push({ game_id: game.id, team_id: teamId, player_id: Number(evtA1), period: evtPeriod, time_mmss: evtTime, event: "assist" });
        if (evtA2) rows.push({ game_id: game.id, team_id: teamId, player_id: Number(evtA2), period: evtPeriod, time_mmss: evtTime, event: "assist" });

        const { data: inserted, error } = await supabase.from("events")
          .insert(rows).select("id,team_id,player_id,period,time_mmss,event");
        if (error) throw error;
        setEvents(e => [...e, ...(inserted||[])].sort(byPeriodTime));

        // goalie GA+SA for defending side
        const { data: cur } = await supabase.from("game_goalies")
          .select("shots_against,goals_against").eq("game_id", game.id).eq("team_id", defTeamId).eq("player_id", defGoalieId).maybeSingle();
        await incGoalie(defTeamId, defGoalieId, {
          shots_against: (cur?.shots_against ?? 0)+1,
          goals_against: (cur?.goals_against ?? 0)+1
        });

        // set scores in games so Games list updates immediately (trigger will also keep it correct)
        await supabase.from("games").update({
          home_score: evtSide==="home" ? (game.home_score ?? 0)+1 : (game.home_score ?? 0),
          away_score: evtSide==="away" ? (game.away_score ?? 0)+1 : (game.away_score ?? 0),
        }).eq("id", game.id);
        await refreshEventsAndGame();
      } else {
        // shot / penalty single row
        const { data: ins, error } = await supabase.from("events").insert({
          game_id: game.id, team_id: teamId, player_id: evtPlayerId?Number(evtPlayerId):null,
          period: evtPeriod, time_mmss: evtTime, event: evtType
        }).select("id,team_id,player_id,period,time_mmss,event").single();
        if (error) throw error;
        setEvents(e => [...e, ins].sort(byPeriodTime));

        if (evtType==="shot") {
          const { data: cur } = await supabase.from("game_goalies")
            .select("shots_against").eq("game_id", game.id).eq("team_id", defTeamId).eq("player_id", defGoalieId).maybeSingle();
          await incGoalie(defTeamId, defGoalieId, { shots_against: (cur?.shots_against ?? 0)+1 });
        }
      }

      setEvtA1(""); setEvtA2("");
    } catch (e) {
      alert(e.message);
    } finally { setSaving(false); }
  }

  async function deleteEvent(ev) {
    if (!window.confirm(t("Delete this event?"))) return;
    await supabase.from("events").delete().eq("id", ev.id);
    // If goal, also decrement goalie + score
    if (ev.event === "goal") {
      const side = ev.team_id===game.home_team_id ? "home" : "away";
      const defTeamId = side==="home" ? game.away_team_id : game.home_team_id;
      const defGoalieId = side==="home" ? awayGoalieId : homeGoalieId;

      const { data: cur } = await supabase.from("game_goalies")
        .select("shots_against,goals_against").eq("game_id", game.id).eq("team_id", defTeamId).eq("player_id", defGoalieId).maybeSingle();
      await incGoalie(defTeamId, defGoalieId, {
        shots_against: Math.max(0, (cur?.shots_against ?? 0)-1),
        goals_against: Math.max(0, (cur?.goals_against ?? 0)-1),
      });

      await supabase.from("games").update({
        home_score: side==="home" ? Math.max(0,(game.home_score??0)-1) : (game.home_score??0),
        away_score: side==="away" ? Math.max(0,(game.away_score??0)-1) : (game.away_score??0),
      }).eq("id", game.id);
    }
    await refreshEventsAndGame();
  }

  async function toggleFinal() {
    if (!game) return;
    const next = game.status==="final" ? "open" : "final";
    await supabase.from("games").update({ status: next }).eq("id", game.id);
    await refreshEventsAndGame();
  }

  if (loading) return <div>{t("Loading…")}</div>;
  if (!game) return null;

  return (
    <div>
      <div style={{ marginBottom: 8 }}><Link to="/games">← {t("Back to Games")}</Link></div>

      {/* Header: Live + Clock + Final/Reopen */}
      <div className="card">
        <div className="row" style={{justifyContent:"space-between", alignItems:"center"}}>
          <div className="kicker">{t("LIVE")} • {new Date(game.game_date).toLocaleString()}</div>
          <div className="row" style={{gap:8, alignItems:"center"}}>
            <span className="kicker">{t("Clock")}: {clock.stamp()}</span>
            <button className="btn secondary" onClick={() => clock.setRunning(!clock.running)}>{clock.running? t("Stop") : t("Start")}</button>
            <button className="btn secondary" onClick={clock.reset}>{t("Reset")}</button>
            <input type="number" min={1} value={clock.periodLen} onChange={(e)=>clock.applyLen(e.target.value)} style={{width:60}} title={t("Set period (minutes)")} />
            <button className="btn" onClick={toggleFinal}>{game.status==="final" ? t("Reopen") : t("Final")}</button>
          </div>
        </div>

        {/* Add event */}
        <div className="row" style={{gap:10, flexWrap:"wrap", marginTop:10}}>
          <select value={evtSide} onChange={(e)=>setEvtSide(e.target.value)}>
            <option value="away">{awayTeam?.short_name || "AWY"}</option>
            <option value="home">{homeTeam?.short_name || "HOME"}</option>
          </select>
          <select value={evtType} onChange={(e)=>setEvtType(e.target.value)}>
            <option value="goal">{t("Goal")}</option>
            <option value="shot">{t("Shot")}</option>
            <option value="penalty">{t("Penalty")}</option>
          </select>
          <select value={evtPlayerId} onChange={(e)=>setEvtPlayerId(e.target.value)}>
            <option value="">{t("Player")}</option>
            {(evtSide==="home"?homePlayers:awayPlayers).map(p=>(
              <option key={p.id} value={p.id}>{labelPlayer(p)}</option>
            ))}
          </select>
          {evtType==="goal" && (
            <>
              <select value={evtA1} onChange={(e)=>setEvtA1(e.target.value)}>
                <option value="">{t("Assist 1")}</option>
                {(evtSide==="home"?homePlayers:awayPlayers).map(p=>(
                  <option key={p.id} value={p.id}>{labelPlayer(p)}</option>
                ))}
              </select>
              <select value={evtA2} onChange={(e)=>setEvtA2(e.target.value)}>
                <option value="">{t("Assist 2")}</option>
                {(evtSide==="home"?homePlayers:awayPlayers).map(p=>(
                  <option key={p.id} value={p.id}>{labelPlayer(p)}</option>
                ))}
              </select>
            </>
          )}
          <input type="number" min={1} value={evtPeriod} onChange={(e)=>setEvtPeriod(Number(e.target.value))} style={{width:70}} title={t("Period")} />
          <input type="text" value={evtTime} onChange={(e)=>setEvtTime(e.target.value)} placeholder="MM:SS" style={{width:80}} title={t("Time")} />
          <button className="btn secondary" onClick={()=>setEvtTime(clock.stamp())}>{t("Stamp clock")}</button>
          <button className="btn" onClick={addEvent} disabled={saving}>{saving? t("Saving…") : t("Add event")}</button>
        </div>

        {/* Quick shots +/- bound to goalie SA */}
        <div className="row" style={{gap:8, marginTop:10, flexWrap:"wrap"}}>
          <span className="kicker">{t("Quick")}:</span>
          <button className="btn secondary" onClick={()=>quickShot("away", +1)}>{awayTeam?.short_name} {t("Shot")} +</button>
          <button className="btn secondary" onClick={()=>quickShot("away", -1)}>{awayTeam?.short_name} {t("Shot")} −</button>
          <button className="btn secondary" onClick={()=>quickShot("home", +1)}>{homeTeam?.short_name} {t("Shot")} +</button>
          <button className="btn secondary" onClick={()=>quickShot("home", -1)}>{homeTeam?.short_name} {t("Shot")} −</button>
        </div>

        {/* Goalie on ice pickers */}
        <div className="row" style={{gap:12, marginTop:10, flexWrap:"wrap"}}>
          <div>
            <div className="kicker">{awayTeam?.short_name} {t("Goalie on ice")}</div>
            <select value={awayGoalieId} onChange={(e)=>setAwayGoalieId(e.target.value)}>
              <option value="">{t("Select")}</option>
              {awayPlayers.filter(p => (p.position||"").toUpperCase()==="G").map(p=>(
                <option key={p.id} value={p.id}>{labelPlayer(p)}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="kicker">{homeTeam?.short_name} {t("Goalie on ice")}</div>
            <select value={homeGoalieId} onChange={(e)=>setHomeGoalieId(e.target.value)}>
              <option value="">{t("Select")}</option>
              {homePlayers.filter(p => (p.position||"").toUpperCase()==="G").map(p=>(
                <option key={p.id} value={p.id}>{labelPlayer(p)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Scoreboard (home on right) */}
      <div className="card">
        <div className="row" style={{justifyContent:"space-between", alignItems:"center"}}>
          <div style={{width:"45%"}}>
            <div className="row" style={{gap:8, alignItems:"center"}}>
              {awayTeam?.logo_url && <img src={awayTeam.logo_url} alt="" className="team-logo" />}
              <strong>{awayTeam?.name}</strong>
            </div>
          </div>
          <div style={{width:"10%", textAlign:"center", fontSize:28}}>
            {(game.away_score ?? scoreFromEvents.away)} <span style={{opacity:.6}}>vs</span> {(game.home_score ?? scoreFromEvents.home)}
          </div>
          <div style={{width:"45%", textAlign:"right"}}>
            <div className="row" style={{gap:8, alignItems:"center", justifyContent:"flex-end"}}>
              <strong>{homeTeam?.name}</strong>
              {homeTeam?.logo_url && <img src={homeTeam.logo_url} alt="" className="team-logo" />}
            </div>
          </div>
        </div>
      </div>

      {/* Events */}
      <div className="card">
        <h3 className="m0">{t("Events")}</h3>
        <div style={{overflowX:"auto", marginTop:8}}>
          <table>
            <thead>
              <tr>
                <th style={{width:60}}>{t("Period")}</th>
                <th style={{width:80}}>{t("Time")}</th>
                <th style={{width:120}}>{t("Team")}</th>
                <th style={{width:100}}>{t("Type")}</th>
                <th>{t("Player")}</th>
                <th style={{width:110}}>{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {events.length===0 ? (
                <tr><td colSpan={6} style={{opacity:.7}}>{t("No events yet.")}</td></tr>
              ) : events.map(ev => {
                const team = ev.team_id===game.home_team_id ? homeTeam : awayTeam;
                return (
                  <tr key={ev.id}>
                    <td>{ev.period}</td>
                    <td>{ev.time_mmss}</td>
                    <td>{team?.short_name}</td>
                    <td>{ev.event}</td>
                    <td>{playerName(ev.player_id, ev.team_id)}</td>
                    <td><button className="btn small danger" onClick={()=>deleteEvent(ev)}>{t("Delete")}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rosters side-by-side */}
      <div className="row" style={{gap:16, flexWrap:"wrap"}}>
        <div className="card" style={{flex:"1 1 420px"}}>
          <h3 className="m0">{awayTeam?.short_name} {t("Roster")}</h3>
          <div style={{marginTop:8}}>
            {awayPlayers.map(p=>{
              const checked = awayRosterIds.has(p.id);
              return (
                <label key={p.id} className="row" style={{gap:8, alignItems:"center"}}>
                  <input type="checkbox" checked={checked} onChange={(e)=>toggleRoster(game.away_team_id, p.id, e.target.checked)} />
                  <span>{labelPlayer(p)} ({p.position||"-"})</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="card" style={{flex:"1 1 420px"}}>
          <h3 className="m0">{homeTeam?.short_name} {t("Roster")}</h3>
          <div style={{marginTop:8}}>
            {homePlayers.map(p=>{
              const checked = homeRosterIds.has(p.id);
              return (
                <label key={p.id} className="row" style={{gap:8, alignItems:"center"}}>
                  <input type="checkbox" checked={checked} onChange={(e)=>toggleRoster(game.home_team_id, p.id, e.target.checked)} />
                  <span>{labelPlayer(p)} ({p.position||"-"})</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
