import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useI18n } from "../i18n.jsx";

/**
 * LIVE editor for a game:
 * - Events toolbar at top (goal/shot/penalty)
 * - Side-by-side teams
 * - Clock (custom period length)
 * - Shots/Goals auto-update opponent goalie stats in `game_goalies`
 */
export default function GameDetailPage() {
  const { t } = useI18n();
  const { slug } = useParams();

  const [game, setGame] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  // rosters
  const [homeRoster, setHomeRoster] = React.useState([]);
  const [awayRoster, setAwayRoster] = React.useState([]);

  // active goalie on ice (one per team)
  const [homeGoalieId, setHomeGoalieId] = React.useState("");
  const [awayGoalieId, setAwayGoalieId] = React.useState("");

  // events
  const [events, setEvents] = React.useState([]);

  // clock
  const [periodSeconds, setPeriodSeconds] = React.useState(15 * 60); // default 15:00
  const [clock, setClock] = React.useState(15 * 60);
  const [running, setRunning] = React.useState(false);
  const tickRef = React.useRef(null);

  // new event form
  const [evtTeam, setEvtTeam] = React.useState("home"); // 'home' | 'away'
  const [evtType, setEvtType] = React.useState("goal"); // 'goal' | 'shot' | 'penalty'
  const [evtPlayerId, setEvtPlayerId] = React.useState("");
  const [evtAssist1Id, setEvtAssist1Id] = React.useState("");
  const [evtAssist2Id, setEvtAssist2Id] = React.useState("");
  const [evtPeriod, setEvtPeriod] = React.useState(1);
  const [evtTime, setEvtTime] = React.useState("15:00"); // default to start-of-period
  const [busy, setBusy] = React.useState(false);

  // ---------- Load game + rosters + events ----------
  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      const { data: g, error: ge } = await supabase
        .from("games")
        .select(`
          id, slug, game_date, status, home_score, away_score,
          home_team_id, away_team_id,
          home_team:teams!games_home_team_id_fkey(id, name, short_name, logo_url),
          away_team:teams!games_away_team_id_fkey(id, name, short_name, logo_url)
        `)
        .eq("slug", slug)
        .maybeSingle();
      if (ge || !g) {
        setErr(ge?.message || "Game not found");
        setLoading(false);
        return;
      }
      setGame(g);

      // rosters from game_rosters
      const { data: rh } = await supabase
        .from("game_rosters")
        .select(`player_id, players(id, name, number, position)`)
        .eq("game_id", g.id)
        .eq("team_id", g.home_team_id)
        .order("players(number)", { ascending: true });
      setHomeRoster((rh || []).map((r) => r.players));

      const { data: ra } = await supabase
        .from("game_rosters")
        .select(`player_id, players(id, name, number, position)`)
        .eq("game_id", g.id)
        .eq("team_id", g.away_team_id)
        .order("players(number)", { ascending: true });
      setAwayRoster((ra || []).map((r) => r.players));

      // try to auto-pick a goalie if one exists (position G)
      const homeG = (rh || []).map(r => r.players).find(p => (p.position || "").toUpperCase() === "G");
      const awayG = (ra || []).map(r => r.players).find(p => (p.position || "").toUpperCase() === "G");
      setHomeGoalieId(homeG?.id ? String(homeG.id) : "");
      setAwayGoalieId(awayG?.id ? String(awayG.id) : "");

      // events
      const { data: ev } = await supabase
        .from("events")
        .select(`
          id, game_id, period, time_mmss, event, team_id, player_id, assist1_id, assist2_id,
          team:teams(id, short_name),
          player:players(id, number, name),
          a1:players!events_assist1_id_fkey(id, number, name),
          a2:players!events_assist2_id_fkey(id, number, name)
        `)
        .eq("game_id", g.id)
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: true });
      setEvents(ev || []);

      setLoading(false);
    })();
  }, [slug]);

  // ---------- Clock ----------
  React.useEffect(() => {
    if (running) {
      tickRef.current = setInterval(() => {
        setClock((c) => (c > 0 ? c - 1 : 0));
      }, 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [running]);

  const resetClockToPeriod = () => {
    setClock(periodSeconds);
    setEvtTime(formatMMSS(periodSeconds));
  };

  const formatMMSS = (seconds) => {
    const s = Math.max(0, Number(seconds) || 0);
    const m = Math.floor(s / 60);
    const ss = String(Math.floor(s % 60)).padStart(2, "0");
    return `${m}:${ss}`;
  };

  const stampCurrentClock = () => {
    setEvtTime(formatMMSS(clock));
  };

  // ---------- Helpers ----------
  const rosterFor = (side) => (side === "home" ? homeRoster : awayRoster);
  const teamIdFor = (side) =>
    side === "home" ? game?.home_team_id : game?.away_team_id;

  const defendingGoalieId = (attackingSide) =>
    attackingSide === "home" ? awayGoalieId : homeGoalieId;

  const ensureGameGoalieRow = async (defTeamId, goaliePlayerId) => {
    if (!goaliePlayerId || !defTeamId) return null;
    const { data: existing } = await supabase
      .from("game_goalies")
      .select("id, shots_against, goals_against, minutes_seconds")
      .eq("game_id", game.id)
      .eq("team_id", defTeamId)
      .eq("player_id", goaliePlayerId)
      .maybeSingle();
    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("game_goalies")
      .insert({
        game_id: game.id,
        team_id: defTeamId,
        player_id: goaliePlayerId,
        shots_against: 0,
        goals_against: 0,
        minutes_seconds: 0,
        decision: null,
        shutout: false,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error(error);
      return null;
    }
    return data?.id || null;
  };

  const incGoalieStat = async (defTeamId, goaliePlayerId, patch) => {
    const rowId = await ensureGameGoalieRow(defTeamId, goaliePlayerId);
    if (!rowId) return;
    await supabase
      .from("game_goalies")
      .update(patch)
      .eq("id", rowId);
  };

  // ---------- Event creation ----------
  const addEvent = async () => {
    if (!game) return;
    if (!evtPlayerId) {
      alert("Select a player first.");
      return;
    }
    const side = evtTeam; // 'home'|'away'
    const scoringTeamId = teamIdFor(side);
    const defendingTeamId = teamIdFor(side === "home" ? "away" : "home");
    const goalieId = defendingGoalieId(side);

    setBusy(true);
    try {
      // Insert event row
      const payload = {
        game_id: game.id,
        team_id: scoringTeamId,
        period: Number(evtPeriod) || 1,
        time_mmss: evtTime || "00:00",
        event: evtType === "shot" ? "shot" : evtType === "penalty" ? "penalty" : "goal",
        player_id: Number(evtPlayerId),
        assist1_id: evtAssist1Id ? Number(evtAssist1Id) : null,
        assist2_id: evtAssist2Id ? Number(evtAssist2Id) : null,
      };

      const { data: evInserted, error: evErr } = await supabase
        .from("events")
        .insert(payload)
        .select(`
          id, game_id, period, time_mmss, event, team_id, player_id, assist1_id, assist2_id,
          team:teams(id, short_name),
          player:players(id, number, name),
          a1:players!events_assist1_id_fkey(id, number, name),
          a2:players!events_assist2_id_fkey(id, number, name)
        `)
        .maybeSingle();

      if (evErr) throw evErr;

      // Auto-update goalie stats for the defending team
      if (goalieId) {
        if (evtType === "shot") {
          // +1 SA
          const { data: cur } = await supabase
            .from("game_goalies")
            .select("id, shots_against")
            .eq("game_id", game.id)
            .eq("team_id", defendingTeamId)
            .eq("player_id", goalieId)
            .maybeSingle();
          const nextSA = (cur?.shots_against ?? 0) + 1;
          await incGoalieStat(defendingTeamId, goalieId, { shots_against: nextSA });
        } else if (evtType === "goal") {
          // +1 SA and +1 GA
          const { data: cur } = await supabase
            .from("game_goalies")
            .select("id, shots_against, goals_against")
            .eq("game_id", game.id)
            .eq("team_id", defendingTeamId)
            .eq("player_id", goalieId)
            .maybeSingle();
          const nextSA = (cur?.shots_against ?? 0) + 1;
          const nextGA = (cur?.goals_against ?? 0) + 1;
          await incGoalieStat(defendingTeamId, goalieId, {
            shots_against: nextSA,
            goals_against: nextGA,
          });

          // Also update game score live:
          const nextHome = side === "home" ? (game.home_score ?? 0) + 1 : (game.home_score ?? 0);
          const nextAway = side === "away" ? (game.away_score ?? 0) + 1 : (game.away_score ?? 0);
          await supabase.from("games").update({
            home_score: nextHome,
            away_score: nextAway,
          }).eq("id", game.id);
          setGame((g0) => g0 ? { ...g0, home_score: nextHome, away_score: nextAway } : g0);
        }
      }

      // Push event to local list
      setEvents((cur) => [...cur, evInserted].sort(byPeriodTime));
      // Quick reset helpers
      setEvtAssist1Id("");
      setEvtAssist2Id("");
    } catch (e) {
      alert(e.message || "Failed to add event");
    } finally {
      setBusy(false);
    }
  };

  function byPeriodTime(a, b) {
    if (a.period !== b.period) return a.period - b.period;
    return (a.time_mmss || "").localeCompare(b.time_mmss || "");
  }

  const removeEvent = async (id) => {
    if (!window.confirm(t("Delete this event?") || "Delete this event?")) return;
    const ev = events.find((e) => e.id === id);
    if (!ev) return;

    setBusy(true);
    try {
      // If it was a goal, decrement score and goalie stats accordingly
      if (ev.event === "goal") {
        const side = ev.team_id === game.home_team_id ? "home" : "away";
        const defTeamId = side === "home" ? game.away_team_id : game.home_team_id;
        const goalieId = side === "home" ? awayGoalieId : homeGoalieId;

        if (goalieId) {
          const { data: cur } = await supabase
            .from("game_goalies")
            .select("id, shots_against, goals_against")
            .eq("game_id", game.id)
            .eq("team_id", defTeamId)
            .eq("player_id", goalieId)
            .maybeSingle();
          const nextSA = Math.max(0, (cur?.shots_against ?? 0) - 1);
          const nextGA = Math.max(0, (cur?.goals_against ?? 0) - 1);
          await incGoalieStat(defTeamId, goalieId, {
            shots_against: nextSA,
            goals_against: nextGA,
          });
        }

        const nextHome = side === "home" ? Math.max(0, (game.home_score ?? 0) - 1) : (game.home_score ?? 0);
        const nextAway = side === "away" ? Math.max(0, (game.away_score ?? 0) - 1) : (game.away_score ?? 0);
        await supabase.from("games").update({
          home_score: nextHome,
          away_score: nextAway,
        }).eq("id", game.id);
        setGame((g0) => g0 ? { ...g0, home_score: nextHome, away_score: nextAway } : g0);
      }

      if (ev.event === "shot") {
        const side = ev.team_id === game.home_team_id ? "home" : "away";
        const defTeamId = side === "home" ? game.away_team_id : game.home_team_id;
        const goalieId = side === "home" ? awayGoalieId : homeGoalieId;

        if (goalieId) {
          const { data: cur } = await supabase
            .from("game_goalies")
            .select("id, shots_against")
            .eq("game_id", game.id)
            .eq("team_id", defTeamId)
            .eq("player_id", goalieId)
            .maybeSingle();
          const nextSA = Math.max(0, (cur?.shots_against ?? 0) - 1);
          await incGoalieStat(defTeamId, goalieId, { shots_against: nextSA });
        }
      }

      await supabase.from("events").delete().eq("id", id);
      setEvents((cur) => cur.filter((e) => e.id !== id));
    } catch (e) {
      alert(e.message || "Failed to delete event");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="container">Loading…</div>;
  if (err) return <div className="container" style={{ color: "crimson" }}>{err}</div>;
  if (!game) return null;

  const leftTeam = game.away_team; // away on left
  const rightTeam = game.home_team; // home on right

  return (
    <div className="container">
      {/* Top bar */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <Link to="/games" className="btn secondary">← {t("Back to Games") || "Back to Games"}</Link>
        <div className="kicker">{t("Live") || "Live"} • {game.game_date}</div>
      </div>

      {/* EVENTS TOOLBAR (sticky) */}
      <div className="card" style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div className="kicker">{t("Team")}</div>
            <select value={evtTeam} onChange={(e) => setEvtTeam(e.target.value)}>
              <option value="away">{leftTeam?.short_name || "AWY"}</option>
              <option value="home">{rightTeam?.short_name || "HOME"}</option>
            </select>
          </div>

          <div>
            <div className="kicker">{t("Type") || "Type"}</div>
            <select value={evtType} onChange={(e) => setEvtType(e.target.value)}>
              <option value="goal">{t("Goal") || "Goal"}</option>
              <option value="shot">{t("Shot") || "Shot"}</option>
              <option value="penalty">{t("Penalty") || "Penalty"}</option>
            </select>
          </div>

          <div>
            <div className="kicker">{t("Player") || "Player"}</div>
            <select value={evtPlayerId} onChange={(e) => setEvtPlayerId(e.target.value)}>
              <option value="">{t("Select") || "Select"}</option>
              {rosterFor(evtTeam).map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number ?? ""} — {p.name}
                </option>
              ))}
            </select>
          </div>

          {evtType === "goal" && (
            <>
              <div>
                <div className="kicker">{t("Assist 1") || "Assist 1"}</div>
                <select value={evtAssist1Id} onChange={(e) => setEvtAssist1Id(e.target.value)}>
                  <option value="">{t("None") || "None"}</option>
                  {rosterFor(evtTeam).map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.number ?? ""} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="kicker">{t("Assist 2") || "Assist 2"}</div>
                <select value={evtAssist2Id} onChange={(e) => setEvtAssist2Id(e.target.value)}>
                  <option value="">{t("None") || "None"}</option>
                  {rosterFor(evtTeam).map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.number ?? ""} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <div className="kicker">{t("Period") || "Period"}</div>
            <input
              type="number"
              min={1}
              value={evtPeriod}
              onChange={(e) => setEvtPeriod(e.target.value)}
              style={{ width: 80 }}
            />
          </div>

          <div>
            <div className="kicker">{t("Time") || "Time"}</div>
            <div className="row" style={{ gap: 6 }}>
              <input
                type="text"
                value={evtTime}
                onChange={(e) => setEvtTime(e.target.value)}
                placeholder="MM:SS"
                style={{ width: 90 }}
              />
              <button className="btn secondary" onClick={stampCurrentClock}>
                {t("Stamp clock") || "Stamp clock"}
              </button>
            </div>
          </div>

          <button className="btn" onClick={addEvent} disabled={busy || !evtPlayerId}>
            {busy ? (t("Saving…") || "Saving…") : (t("Add event") || "Add event")}
          </button>
        </div>

        {/* Quick shot/goal buttons (no player selection needed) */}
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <span className="kicker">{t("Quick") || "Quick"}:</span>
          <button
            className="btn secondary"
            onClick={() => quickShot("away")}
            title="Away shot on goal"
          >
            {leftTeam?.short_name || "AWY"} {t("Shot") || "Shot"} +
          </button>
          <button className="btn secondary" onClick={() => quickGoal("away")}>
            {leftTeam?.short_name || "AWY"} {t("Goal") || "Goal"} +
          </button>
          <button
            className="btn secondary"
            onClick={() => quickShot("home")}
            title="Home shot on goal"
          >
            {rightTeam?.short_name || "HOME"} {t("Shot") || "Shot"} +
          </button>
          <button className="btn secondary" onClick={() => quickGoal("home")}>
            {rightTeam?.short_name || "HOME"} {t("Goal") || "Goal"} +
          </button>
        </div>

        {/* Active goalies (so shots/goals know who to credit against) */}
        <div className="row" style={{ gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <div>
            <div className="kicker">{leftTeam?.short_name || "AWY"} {t("Goalie on ice") || "Goalie on ice"}</div>
            <select value={awayGoalieId} onChange={(e) => setAwayGoalieId(e.target.value)}>
              <option value="">{t("Select") || "Select"}</option>
              {awayRoster
                .filter((p) => (p.position || "").toUpperCase() === "G")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.number ?? ""} — {p.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <div className="kicker">{rightTeam?.short_name || "HOME"} {t("Goalie on ice") || "Goalie on ice"}</div>
            <select value={homeGoalieId} onChange={(e) => setHomeGoalieId(e.target.value)}>
              <option value="">{t("Select") || "Select"}</option>
              {homeRoster
                .filter((p) => (p.position || "").toUpperCase() === "G")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.number ?? ""} — {p.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Clock controls */}
        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div className="score-display">{formatMMSS(clock)}</div>
          <button className="btn" onClick={() => setRunning((r) => !r)}>
            {running ? (t("Stop") || "Stop") : (t("Start") || "Start")}
          </button>
          <button className="btn secondary" onClick={resetClockToPeriod}>
            {t("Reset") || "Reset"}
          </button>
          <div className="row" style={{ gap: 6 }}>
            <input
              type="number"
              min={1}
              value={Math.round(periodSeconds / 60)}
              onChange={(e) => {
                const mins = Math.max(1, Number(e.target.value) || 1);
                setPeriodSeconds(mins * 60);
              }}
              style={{ width: 80 }}
            />
            <span className="kicker">{t("Set period (minutes)") || "Set period (minutes)"}</span>
            <button className="btn secondary" onClick={resetClockToPeriod}>
              {t("Apply") || "Apply"}
            </button>
          </div>
        </div>
      </div>

      {/* SCOREBOARD */}
      <div className="card">
        <div className="scoreboard">
          <div className="team">
            {leftTeam?.logo_url && <img src={leftTeam.logo_url} alt="" className="team-logo" />}
            <div>
              <div className="team-name">{leftTeam?.name}</div>
              <div className="abbr">{leftTeam?.short_name}</div>
            </div>
          </div>

          <div className="score">
            <span>{game.away_score ?? 0}</span>
            <span className="vs">vs</span>
            <span>{game.home_score ?? 0}</span>
          </div>

          <div className="team" style={{ justifyContent: "flex-end" }}>
            <div style={{ textAlign: "right" }}>
              <div className="team-name">{rightTeam?.name}</div>
              <div className="abbr">{rightTeam?.short_name}</div>
            </div>
            {rightTeam?.logo_url && <img src={rightTeam.logo_url} alt="" className="team-logo" />}
          </div>
        </div>
      </div>

      {/* EVENTS LIST (now directly under scoreboard) */}
      <div className="card">
        <h3 className="m0">{t("Events") || "Events"}</h3>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>{t("Period") || "Period"}</th>
                <th>{t("Time") || "Time"}</th>
                <th>{t("Team")}</th>
                <th>{t("Type") || "Type"}</th>
                <th>{t("Player") || "Player"}</th>
                <th>{t("Assists")}</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr><td colSpan={7} style={{ color: "#888" }}>—</td></tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id}>
                    <td>{e.period}</td>
                    <td>{e.time_mmss}</td>
                    <td>{e.team?.short_name}</td>
                    <td>{e.event}</td>
                    <td>{e.player?.name}</td>
                    <td>{[e.a1?.name, e.a2?.name].filter(Boolean).join(", ")}</td>
                    <td>
                      <button className="btn secondary" onClick={() => removeEvent(e.id)} disabled={busy}>
                        {t("Delete")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ROSTERS side-by-side */}
      <div className="row" style={{ alignItems: "stretch", gap: 12 }}>
        <div className="card" style={{ flex: 1 }}>
          <h3 className="m0">{leftTeam?.short_name} {t("Lineup") || "Lineup"}</h3>
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th>{t("Player") || "Player"}</th>
                  <th style={{ width: 100 }}>Pos</th>
                </tr>
              </thead>
              <tbody>
                {awayRoster.length === 0 ? (
                  <tr><td colSpan={3} style={{ color: "#888" }}>—</td></tr>
                ) : (
                  awayRoster.map((p) => (
                    <tr key={p.id}>
                      <td>{p.number ?? ""}</td>
                      <td>{p.name}</td>
                      <td>{(p.position || "").toUpperCase()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ flex: 1 }}>
          <h3 className="m0">{rightTeam?.short_name} {t("Lineup") || "Lineup"}</h3>
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th>{t("Player") || "Player"}</th>
                  <th style={{ width: 100 }}>Pos</th>
                </tr>
              </thead>
              <tbody>
                {homeRoster.length === 0 ? (
                  <tr><td colSpan={3} style={{ color: "#888" }}>—</td></tr>
                ) : (
                  homeRoster.map((p) => (
                    <tr key={p.id}>
                      <td>{p.number ?? ""}</td>
                      <td>{p.name}</td>
                      <td>{(p.position || "").toUpperCase()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  // ---------- Quick helpers (shot/goal "+" buttons) ----------
  async function quickShot(side) {
    const teamId = teamIdFor(side);
    const defGoalie = defendingGoalieId(side);
    if (!defGoalie) {
      alert("Select the active goalie first.");
      return;
    }
    // create minimal shot event with "Unknown" player if none selected
    const someSkater = rosterFor(side).find((p) => (p.position || "").toUpperCase() !== "G");
    setEvtTeam(side);
    setEvtType("shot");
    setEvtPlayerId(someSkater?.id ? String(someSkater.id) : "");
    setEvtPeriod(1);
    setEvtTime(formatMMSS(clock));
    await addEvent();
  }

  async function quickGoal(side) {
    const teamId = teamIdFor(side);
    const defGoalie = defendingGoalieId(side);
    if (!defGoalie) {
      alert("Select the active goalie first.");
      return;
    }
    const scorer = rosterFor(side).find((p) => (p.position || "").toUpperCase() !== "G");
    setEvtTeam(side);
    setEvtType("goal");
    setEvtPlayerId(scorer?.id ? String(scorer.id) : "");
    setEvtAssist1Id("");
    setEvtAssist2Id("");
    setEvtPeriod(1);
    setEvtTime(formatMMSS(clock));
    await addEvent();
  }
}
