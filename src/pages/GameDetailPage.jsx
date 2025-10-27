// src/pages/GameDetailPage.jsx
import React from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient.js";
import { useI18n } from "../i18n.jsx";

/* ---------- simple game clock ---------- */
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
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [secondsLeft]);

  return { periodLen, secondsLeft, running, setRunning, reset, applyLen, stamp, setSecondsLeft };
}

/* ---------- Live game page ---------- */
export default function GameDetailPage() {
  const { t } = useI18n();
  const { slug } = useParams();
  const nav = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [game, setGame] = React.useState(null);

  // teams
  const [homeTeam, setHomeTeam] = React.useState(null);
  const [awayTeam, setAwayTeam] = React.useState(null);

  // players (full team lists shown as checkboxes for roster picking)
  const [homePlayers, setHomePlayers] = React.useState([]);
  const [awayPlayers, setAwayPlayers] = React.useState([]);
  const [homeRosterIds, setHomeRosterIds] = React.useState(new Set());
  const [awayRosterIds, setAwayRosterIds] = React.useState(new Set());

  // goalies on ice
  const [homeGoalieId, setHomeGoalieId] = React.useState("");
  const [awayGoalieId, setAwayGoalieId] = React.useState("");

  // events
  const [events, setEvents] = React.useState([]);

  // event form (single add)
  const [evtSide, setEvtSide] = React.useState("home"); // 'home' | 'away'
  const [evtType, setEvtType] = React.useState("goal"); // goal | shot | penalty
  const [evtPlayerId, setEvtPlayerId] = React.useState("");
  const [evtA1, setEvtA1] = React.useState("");
  const [evtA2, setEvtA2] = React.useState("");
  const [evtPeriod, setEvtPeriod] = React.useState(1);
  const [evtTime, setEvtTime] = React.useState("15:00");

  // clock
  const clock = useClock(15);

  // util maps
  const homeMap = React.useMemo(
    () => Object.fromEntries(homePlayers.map((p) => [p.id, p])),
    [homePlayers]
  );
  const awayMap = React.useMemo(
    () => Object.fromEntries(awayPlayers.map((p) => [p.id, p])),
    [awayPlayers]
  );

  React.useEffect(() => {
    (async () => {
      setLoading(true);

      // game + teams
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
        alert(ge?.message || "Game not found");
        setLoading(false);
        return;
      }
      setGame(g);
      setHomeTeam(g.home_team);
      setAwayTeam(g.away_team);

      // full team player lists
      const [hp, ap] = await Promise.all([
        supabase
          .from("players")
          .select("id, name, number, position")
          .eq("team_id", g.home_team_id)
          .order("number", { ascending: true }),
        supabase
          .from("players")
          .select("id, name, number, position")
          .eq("team_id", g.away_team_id)
          .order("number", { ascending: true }),
      ]);
      setHomePlayers(hp.data || []);
      setAwayPlayers(ap.data || []);

      // current game_rosters → pre-check boxes
      const { data: rosterRows } = await supabase
        .from("game_rosters")
        .select("team_id, player_id")
        .eq("game_id", g.id);

      const homeSet = new Set(
        (rosterRows || [])
          .filter((r) => r.team_id === g.home_team_id)
          .map((r) => r.player_id)
      );
      const awaySet = new Set(
        (rosterRows || [])
          .filter((r) => r.team_id === g.away_team_id)
          .map((r) => r.player_id)
      );
      setHomeRosterIds(homeSet);
      setAwayRosterIds(awaySet);

      // pick default goalies if not set
      const homeG = (hp.data || []).find(
        (p) => (p.position || "").toUpperCase() === "G"
      );
      const awayG = (ap.data || []).find(
        (p) => (p.position || "").toUpperCase() === "G"
      );
      setHomeGoalieId(homeG?.id || "");
      setAwayGoalieId(awayG?.id || "");

      // existing events
      const { data: evs } = await supabase
        .from("events")
        .select("id, team_id, player_id, period, time_mmss, event")
        .eq("game_id", g.id)
        .order("period")
        .order("time_mmss");
      setEvents(evs || []);

      setLoading(false);
    })();
  }, [slug]);

  /* ---------- helpers ---------- */
  const leftTeam = awayTeam;
  const rightTeam = homeTeam;

  function labelPlayer(p) {
    if (!p) return "—";
    const num = p.number != null ? `#${p.number} ` : "";
    return `${num}— ${p.name}`;
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

  const score = React.useMemo(() => {
    let home = 0,
      away = 0;
    for (const e of events) {
      if (e.event === "goal") {
        if (e.team_id === game?.home_team_id) home++;
        if (e.team_id === game?.away_team_id) away++;
      }
    }
    return { home, away };
  }, [events, game]); // :contentReference[oaicite:4]{index=4}

  const stampClock = () => setEvtTime(clock.stamp());

  const sideTeamId = (side) =>
    side === "home" ? game.home_team_id : game.away_team_id;

  /* ---------- ROSTER write helpers (checkboxes) ---------- */
  async function toggleRoster(teamId, pid, checked) {
    try {
      if (checked) {
        const { error } = await supabase
          .from("game_rosters")
          .insert({ game_id: game.id, team_id: teamId, player_id: pid });
        if (error && !String(error.message).includes("duplicate")) throw error;
      } else {
        await supabase
          .from("game_rosters")
          .delete()
          .eq("game_id", game.id)
          .eq("team_id", teamId)
          .eq("player_id", pid);
      }

      // reflect in UI
      if (teamId === game.home_team_id) {
        setHomeRosterIds((s) => {
          const next = new Set(s);
          checked ? next.add(pid) : next.delete(pid);
          return next;
        });
      } else {
        setAwayRosterIds((s) => {
          const next = new Set(s);
          checked ? next.add(pid) : next.delete(pid);
          return next;
        });
      }
    } catch (e) {
      alert(e.message);
    }
  }

  /* ---------- goalie row ensure + bump helpers ---------- */
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
      .insert({
        game_id: gameId,
        team_id: teamId,
        player_id: playerId,
        shots_against: 0,
        goals_against: 0,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async function incGoalie(teamId, playerId, patch) {
    const rowId = await ensureGoalieRow(game.id, teamId, playerId);
    const { data: cur } = await supabase
      .from("game_goalies")
      .select("shots_against, goals_against")
      .eq("id", rowId)
      .single();
    const next = { shots_against: cur.shots_against, goals_against: cur.goals_against, ...patch };
    await supabase.from("game_goalies").update(next).eq("id", rowId);
  }

  /* ---------- Quick shots ( + and − ) ---------- */
  async function quickShot(side, delta = +1) {
    if (!game) return;
    setSaving(true);
    try {
      const teamId = sideTeamId(side);
      const oppTeamId = side === "home" ? game.away_team_id : game.home_team_id;
      const oppGoalieId = side === "home" ? awayGoalieId : homeGoalieId;

      if (delta > 0) {
        // add shot event
        const { data: ins, error } = await supabase
          .from("events")
          .insert({
            game_id: game.id,
            team_id: teamId,
            player_id: null,
            period: evtPeriod,
            time_mmss: evtTime,
            event: "shot",
          })
          .select("id, team_id, player_id, period, time_mmss, event")
          .single();
        if (error) throw error;
        setEvents((evs) => [...evs, ins].sort(byPeriodTime));
        // add SA to opposite goalie
        await incGoalie(oppTeamId, oppGoalieId, { shots_against: (NaN as any) });
        const { data: cur } = await supabase
          .from("game_goalies")
          .select("shots_against")
          .eq("game_id", game.id)
          .eq("team_id", oppTeamId)
          .eq("player_id", oppGoalieId)
          .maybeSingle();
        await incGoalie(oppTeamId, oppGoalieId, {
          shots_against: (cur?.shots_against ?? 0) + 1,
        });
      } else {
        // remove most recent shot for that side (if any) and decrement SA
        const { data: last } = await supabase
          .from("events")
          .select("id, period, time_mmss")
          .eq("game_id", game.id)
          .eq("team_id", teamId)
          .eq("event", "shot")
          .order("period", { ascending: false })
          .order("time_mmss", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (last) {
          await supabase.from("events").delete().eq("id", last.id);
          setEvents((evs) => evs.filter((e) => e.id !== last.id));
          const { data: cur } = await supabase
            .from("game_goalies")
            .select("shots_against")
            .eq("game_id", game.id)
            .eq("team_id", oppTeamId)
            .eq("player_id", oppGoalieId)
            .maybeSingle();
          const nextSA = Math.max(0, (cur?.shots_against ?? 0) - 1);
          await incGoalie(oppTeamId, oppGoalieId, { shots_against: nextSA });
        }
      }
    } catch (e) {
      alert(e.message || "Shot update failed");
    } finally {
      setSaving(false);
    }
  }

  /* ---------- Add event (goal with up to two assists; or shot/penalty) ---------- */
  async function addEvent() {
    if (!game) return;
    setSaving(true);
    try {
      const teamId = sideTeamId(evtSide);
      const defTeamId = evtSide === "home" ? game.away_team_id : game.home_team_id;
      const defGoalieId = evtSide === "home" ? awayGoalieId : homeGoalieId;

      const rows = [];
      if (evtType === "goal") {
        if (!evtPlayerId) {
          alert(t("Select a scorer.") || "Select a scorer.");
          setSaving(false);
          return;
        }
        rows.push({
          game_id: game.id,
          team_id: teamId,
          player_id: Number(evtPlayerId),
          period: evtPeriod,
          time_mmss: evtTime,
          event: "goal",
        });
        if (evtA1) {
          rows.push({
            game_id: game.id,
            team_id: teamId,
            player_id: Number(evtA1),
            period: evtPeriod,
            time_mmss: evtTime,
            event: "assist",
          });
        }
        if (evtA2) {
          rows.push({
            game_id: game.id,
            team_id: teamId,
            player_id: Number(evtA2),
            period: evtPeriod,
            time_mmss: evtTime,
            event: "assist",
          });
        }

        // insert all rows at once
        const { data: inserted, error } = await supabase
          .from("events")
          .insert(rows)
          .select("id, team_id, player_id, period, time_mmss, event");
        if (error) throw error;
        setEvents((evs) => [...evs, ...(inserted || [])].sort(byPeriodTime));

        // goalie GA + SA for defending side
        const { data: cur } = await supabase
          .from("game_goalies")
          .select("shots_against, goals_against")
          .eq("game_id", game.id)
          .eq("team_id", defTeamId)
          .eq("player_id", defGoalieId)
          .maybeSingle();
        const nextSA = (cur?.shots_against ?? 0) + 1;
        const nextGA = (cur?.goals_against ?? 0) + 1;
        await incGoalie(defTeamId, defGoalieId, {
          shots_against: nextSA,
          goals_against: nextGA,
        });

        // also reflect score in `games` so list shows live numbers
        const nextHome = evtSide === "home" ? (game.home_score ?? 0) + 1 : game.home_score ?? 0;
        const nextAway = evtSide === "away" ? (game.away_score ?? 0) + 1 : game.away_score ?? 0;
        await supabase
          .from("games")
          .update({ home_score: nextHome, away_score: nextAway })
          .eq("id", game.id);
        setGame((g) =>
          g ? { ...g, home_score: nextHome, away_score: nextAway } : g
        );
      } else {
        // single shot / penalty
        const { data: ins, error } = await supabase
          .from("events")
          .insert({
            game_id: game.id,
            team_id: teamId,
            player_id: evtPlayerId ? Number(evtPlayerId) : null,
            period: evtPeriod,
            time_mmss: evtTime,
            event: evtType,
          })
          .select("id, team_id, player_id, period, time_mmss, event")
          .single();
        if (error) throw error;
        setEvents((evs) => [...evs, ins].sort(byPeriodTime));

        if (evtType === "shot") {
          const { data: cur } = await supabase
            .from("game_goalies")
            .select("shots_against")
            .eq("game_id", game.id)
            .eq("team_id", defTeamId)
            .eq("player_id", defGoalieId)
            .maybeSingle();
          const nextSA = (cur?.shots_against ?? 0) + 1;
          await incGoalie(defTeamId, defGoalieId, { shots_against: nextSA });
        }
      }

      setEvtA1("");
      setEvtA2("");
    } catch (e) {
      alert(e.message || "Failed to add event");
    } finally {
      setSaving(false);
    }
  }

  /* ---------- delete event (keeps score/goalie stats consistent for goals) ---------- */
  async function deleteEvent(ev) {
    try {
      if (!window.confirm(t("Delete this event?") || "Delete this event?")) return;
      await supabase.from("events").delete().eq("id", ev.id);
      setEvents((evs) => evs.filter((e) => e.id !== ev.id));

      if (ev.event === "goal") {
        const side = ev.team_id === game.home_team_id ? "home" : "away";
        const defTeamId = side === "home" ? game.away_team_id : game.home_team_id;
        const defGoalieId = side === "home" ? awayGoalieId : homeGoalieId;

        // decrement GA+SA (not going below zero)
        const { data: cur } = await supabase
          .from("game_goalies")
          .select("shots_against, goals_against")
          .eq("game_id", game.id)
          .eq("team_id", defTeamId)
          .eq("player_id", defGoalieId)
          .maybeSingle();
        const nextSA = Math.max(0, (cur?.shots_against ?? 0) - 1);
        const nextGA = Math.max(0, (cur?.goals_against ?? 0) - 1);
        await incGoalie(defTeamId, defGoalieId, {
          shots_against: nextSA,
          goals_against: nextGA,
        });

        // update scores down
        const nextHome =
          side === "home" ? Math.max(0, (game.home_score ?? 0) - 1) : game.home_score ?? 0;
        const nextAway =
          side === "away" ? Math.max(0, (game.away_score ?? 0) - 1) : game.away_score ?? 0;
        await supabase
          .from("games")
          .update({ home_score: nextHome, away_score: nextAway })
          .eq("id", game.id);
        setGame((g) =>
          g ? { ...g, home_score: nextHome, away_score: nextAway } : g
        );
      }
    } catch (e) {
      alert(e.message || "Failed to delete event");
    }
  }

  /* ---------- Finalize (status = final) ---------- */
  async function markFinal() {
    if (!window.confirm(t("Mark this game as Final?") || "Mark this game as Final?")) return;
    try {
      await supabase.from("games").update({ status: "final" }).eq("id", game.id);
      setGame((g) => (g ? { ...g, status: "final" } : g));
      // back to list? keep on page:
      // nav("/games");
    } catch (e) {
      alert(e.message);
    }
  }

  if (loading) return <div className="container">{t("Loading…")}</div>;
  if (!game) return null;

  return (
    <div className="container">
      <div style={{ marginBottom: 8 }}>
        <Link to="/games">← {t("Back to Games")}</Link>
      </div>

      {/* Top toolbar: LIVE indicator + clock config */}
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="kicker">{t("LIVE")} • {game.game_date}</div>
          <div className="row" style={{ gap: 8 }}>
            <span className="kicker">{t("Clock")}: {clock.stamp()}</span>
            <button className="btn secondary" onClick={() => clock.setRunning(!clock.running)}>
              {clock.running ? t("Stop") : t("Start")}
            </button>
            <button className="btn secondary" onClick={clock.reset}>{t("Reset")}</button>
            <input
              type="number"
              min={1}
              value={clock.periodLen}
              onChange={(e) => clock.applyLen(e.target.value)}
              style={{ width: 60 }}
              title={t("Set period (minutes)")}
            />
          </div>
        </div>

        {/* Add event controls (one row) */}
        <div className="row" style={{ gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          <select value={evtSide} onChange={(e) => setEvtSide(e.target.value)}>
            <option value="home">{rightTeam?.short_name || "HOME"}</option>
            <option value="away">{leftTeam?.short_name || "AWY"}</option>
          </select>

          <select value={evtType} onChange={(e) => setEvtType(e.target.value)}>
            <option value="goal">{t("Goal")}</option>
            <option value="shot">{t("Shot")}</option>
            <option value="penalty">{t("Penalty")}</option>
          </select>

          <select
            value={evtPlayerId}
            onChange={(e) => setEvtPlayerId(e.target.value)}
          >
            <option value="">{t("Player")}</option>
            {(evtSide === "home" ? homePlayers : awayPlayers).map((p) => (
              <option key={p.id} value={p.id}>
                {labelPlayer(p)}
              </option>
            ))}
          </select>

          {evtType === "goal" && (
            <>
              <select value={evtA1} onChange={(e) => setEvtA1(e.target.value)}>
                <option value="">{t("Assist 1")}</option>
                {(evtSide === "home" ? homePlayers : awayPlayers).map((p) => (
                  <option key={p.id} value={p.id}>
                    {labelPlayer(p)}
                  </option>
                ))}
              </select>
              <select value={evtA2} onChange={(e) => setEvtA2(e.target.value)}>
                <option value="">{t("Assist 2")}</option>
                {(evtSide === "home" ? homePlayers : awayPlayers).map((p) => (
                  <option key={p.id} value={p.id}>
                    {labelPlayer(p)}
                  </option>
                ))}
              </select>
            </>
          )}

          <input
            type="number"
            min={1}
            value={evtPeriod}
            onChange={(e) => setEvtPeriod(Number(e.target.value))}
            style={{ width: 70 }}
            title={t("Period")}
          />

          <div className="row" style={{ gap: 6 }}>
            <input
              type="text"
              value={evtTime}
              onChange={(e) => setEvtTime(e.target.value)}
              placeholder="MM:SS"
              style={{ width: 80 }}
              title={t("Time")}
            />
            <button className="btn secondary" onClick={stampClock}>
              {t("Stamp clock")}
            </button>
          </div>

          <button className="btn" onClick={addEvent} disabled={saving}>
            {saving ? t("Saving…") : t("Add event")}
          </button>
        </div>

        {/* Quick shot +/- (ties to goalie SA) */}
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <span className="kicker">{t("Quick")}:</span>
          <button className="btn secondary" onClick={() => quickShot("away", +1)}>
            {leftTeam?.short_name || "AWY"} {t("Shot")} +
          </button>
          <button className="btn secondary" onClick={() => quickShot("away", -1)}>
            {leftTeam?.short_name || "AWY"} {t("Shot")} −
          </button>
          <button className="btn secondary" onClick={() => quickShot("home", +1)}>
            {rightTeam?.short_name || "HOME"} {t("Shot")} +
          </button>
          <button className="btn secondary" onClick={() => quickShot("home", -1)}>
            {rightTeam?.short_name || "HOME"} {t("Shot")} −
          </button>
        </div>

        {/* Goalie on ice (shots/goals hit this one) */}
        <div className="row" style={{ gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <div>
            <div className="kicker">{(leftTeam?.short_name || "AWY") + " " + (t("Goalie on ice") || "Goalie on ice")}</div>
            <select value={awayGoalieId} onChange={(e) => setAwayGoalieId(e.target.value)}>
              <option value="">{t("Select")}</option>
              {awayPlayers
                .filter((p) => (p.position || "").toUpperCase() === "G")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {labelPlayer(p)}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <div className="kicker">{(rightTeam?.short_name || "HOME") + " " + (t("Goalie on ice") || "Goalie on ice")}</div>
            <select value={homeGoalieId} onChange={(e) => setHomeGoalieId(e.target.value)}>
              <option value="">{t("Select")}</option>
              {homePlayers
                .filter((p) => (p.position || "").toUpperCase() === "G")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {labelPlayer(p)}
                  </option>
                ))}
            </select>
          </div>

          {/* Mark Final */}
          <div style={{ marginLeft: "auto" }}>
            <button className="btn" onClick={markFinal} disabled={game.status === "final"}>
              {game.status === "final" ? t("Final") : t("Mark Final")}
            </button>
          </div>
        </div>
      </div>

      {/* Scoreboard (home on right) */}
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ width: "45%" }}>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              {leftTeam?.logo_url && <img src={leftTeam.logo_url} alt="" className="team-logo" />}
              <strong>{leftTeam?.name}</strong>
            </div>
          </div>
          <div style={{ width: "10%", textAlign: "center", fontSize: 28 }}>
            {score.away} <span
::contentReference[oaicite:5]{index=5}
