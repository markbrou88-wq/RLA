// src/pages/GameDetailPage.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import PlayerLink from "../components/PlayerLink";

function useMaybeI18n() {
  try {
    const { useI18n } = require("../i18n");
    return useI18n();
  } catch {
    return { t: (s) => s };
  }
}

export default function GameDetailPage() {
  const { t } = useMaybeI18n();
  const { slug } = useParams();

  // Game + teams
  const [game, setGame] = React.useState(null);
  const [home, setHome] = React.useState(null);
  const [away, setAway] = React.useState(null);

  // Players & roster toggles
  const [homePlayers, setHomePlayers] = React.useState([]);
  const [awayPlayers, setAwayPlayers] = React.useState([]);
  const [rosterIds, setRosterIds] = React.useState(new Set());

  // Events
  const [events, setEvents] = React.useState([]);
  const [saving, setSaving] = React.useState(false);

  // Clock
  const [periodLen, setPeriodLen] = React.useState(15); // minutes
  const [period, setPeriod] = React.useState(1);
  const [mmss, setMmss] = React.useState("15:00");
  const [running, setRunning] = React.useState(false);
  const tickRef = React.useRef(null);
  const lastStampMsRef = React.useRef(null);

  // Add-event form
  const [formTeam, setFormTeam] = React.useState("home"); // "home" | "away"
  const [formType, setFormType] = React.useState("goal"); // "goal" | "assist" | "shot+"
  const [formPlayer, setFormPlayer] = React.useState(null);
  const [formA1, setFormA1] = React.useState(null);
  const [formA2, setFormA2] = React.useState(null);

  // Goalie on ice
  const [homeGoalie, setHomeGoalie] = React.useState(null);
  const [awayGoalie, setAwayGoalie] = React.useState(null);

  // ---------- Load game + teams + everything ----------
  React.useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      // 1) Game
      const { data: g } = await supabase
        .from("games")
        .select("id, slug, game_date, status, home_team_id, away_team_id, home_score, away_score")
        .or(`slug.eq.${slug},id.eq.${Number(slug) || -1}`)
        .maybeSingle();

      if (!g || cancelled) return;

      // 2) Teams
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name, short_name, logo_url");

      const tMap = new Map((teams || []).map(x => [x.id, x]));
      const homeTeam = tMap.get(g.home_team_id) || null;
      const awayTeam = tMap.get(g.away_team_id) || null;

      // 3) Players for each team
      const [{ data: hp }, { data: ap }] = await Promise.all([
        supabase.from("players").select("id, name, number").eq("team_id", g.home_team_id).order("number", { ascending: true }),
        supabase.from("players").select("id, name, number").eq("team_id", g.away_team_id).order("number", { ascending: true }),
      ]);

      // 4) Roster toggles present in game_rosters
      const { data: rost } = await supabase
        .from("game_rosters")
        .select("player_id")
        .eq("game_id", g.id);

      // 5) Existing events (for score + table)
      const { data: evs } = await supabase
        .from("events")
        .select("id, period, time_mmss, event, player_id, team_id, created_at")
        .eq("game_id", g.id)
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: true });

      // 6) Preload event player names
      const pids = Array.from(new Set((evs || []).map(e => e.player_id).filter(Boolean)));
      let pMap = new Map();
      if (pids.length) {
        const { data: plist } = await supabase
          .from("players")
          .select("id, name, number, team_id")
          .in("id", pids);
        pMap = new Map((plist || []).map(p => [p.id, p]));
      }

      if (!cancelled) {
        setGame(g);
        setHome(homeTeam);
        setAway(awayTeam);
        setHomePlayers(hp || []);
        setAwayPlayers(ap || []);
        setRosterIds(new Set((rost || []).map(r => r.player_id)));
        setEvents((evs || []).map(e => ({
          ...e,
          player_name: pMap.get(e.player_id)?.name ?? `#${e.player_id}`,
          jersey: pMap.get(e.player_id)?.number ?? null,
          team_code:
            e.team_id === homeTeam?.id ? (homeTeam.short_name || "HOME")
              : e.team_id === awayTeam?.id ? (awayTeam.short_name || "AWAY")
              : "-",
        })));
        // defaults
        if (hp?.length) setHomeGoalie(hp[0].id);
        if (ap?.length) setAwayGoalie(ap[0].id);
        setMmss(`${String(periodLen).padStart(2, "0")}:00`);
      }
    }

    loadAll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // --------- Clock handling ---------
  React.useEffect(() => {
    if (!running) return;
    lastStampMsRef.current = performance.now();

    tickRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(tickRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function tick(now) {
    const last = lastStampMsRef.current || now;
    const delta = now - last; // ms
    lastStampMsRef.current = now;

    setMmss(prev => {
      const [m, s] = prev.split(":").map(n => parseInt(n || "0", 10));
      let total = m * 60 + s;
      total = Math.max(0, total - Math.round(delta / 1000));
      return fmtMMSS(total);
    });

    tickRef.current = requestAnimationFrame(tick);
  }

  function fmtMMSS(totalSeconds) {
    const mm = Math.floor(totalSeconds / 60);
    const ss = totalSeconds % 60;
    return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }

  function onStart() {
    if (running) return;
    setRunning(true);
    lastStampMsRef.current = performance.now();
  }

  async function onStop() {
    if (!running) return;
    setRunning(false);

    // accumulate TOI to both goalies on ice since lastStamp
    if (!game) return;
    try {
      const now = performance.now();
      const last = lastStampMsRef.current || now;
      const deltaSec = Math.max(0, Math.round((now - last) / 1000));

      await bumpTOI(deltaSec);
    } catch (e) {
      // ignore
    }
  }

  async function onReset() {
    if (running) await onStop();
    setMmss(`${String(periodLen).padStart(2, "0")}:00`);
  }

  async function onApplyPeriodLen() {
    if (running) await onStop();
    setMmss(`${String(periodLen).padStart(2, "0")}:00`);
  }

  async function bumpTOI(delta) {
    if (!delta || !game) return;
    // Upsert minutes for both goalies on ice in game_goalies
    const rows = [];
    if (homeGoalie && home) {
      rows.push({ game_id: game.id, player_id: homeGoalie, team_id: home.id, minutes_seconds: delta });
    }
    if (awayGoalie && away) {
      rows.push({ game_id: game.id, player_id: awayGoalie, team_id: away.id, minutes_seconds: delta });
    }
    for (const r of rows) {
      await supabase.rpc("increment_goalie_minutes", {
        p_game_id: r.game_id,
        p_player_id: r.player_id,
        p_team_id: r.team_id,
        p_delta_seconds: r.minutes_seconds,
      }).catch(async () => {
        // fallback: upsert then update
        const { data: gg } = await supabase
          .from("game_goalies")
          .select("id, minutes_seconds")
          .eq("game_id", r.game_id)
          .eq("player_id", r.player_id)
          .eq("team_id", r.team_id)
          .maybeSingle();

        if (!gg) {
          await supabase.from("game_goalies").insert({
            game_id: r.game_id,
            player_id: r.player_id,
            team_id: r.team_id,
            minutes_seconds: r.minutes_seconds,
          });
        } else {
          await supabase
            .from("game_goalies")
            .update({ minutes_seconds: (gg.minutes_seconds || 0) + r.minutes_seconds })
            .eq("id", gg.id);
        }
      });
    }
  }

  // ---------- Helpers ----------
  const teamIdFor = (side) => (side === "home" ? home?.id : away?.id);
  const playersFor = (side) => (side === "home" ? homePlayers : awayPlayers);

  // ---------- Roster toggle ----------
  async function toggleRoster(p) {
    if (!game) return;
    const has = rosterIds.has(p.id);
    if (has) {
      await supabase.from("game_rosters").delete().eq("game_id", game.id).eq("player_id", p.id);
      const next = new Set([...rosterIds]);
      next.delete(p.id);
      setRosterIds(next);
    } else {
      await supabase.from("game_rosters").upsert({ game_id: game.id, player_id: p.id, team_id: p.team_id || teamIdFor(p.team_side) }, { onConflict: "game_id,player_id" });
      const next = new Set([...rosterIds]);
      next.add(p.id);
      setRosterIds(next);
    }
  }

  // ---------- Score recompute + push to DB ----------
  async function recomputeAndPushScore(nextEvents) {
    if (!game) return;
    const list = nextEvents ?? events;
    let homeGoals = 0;
    let awayGoals = 0;
    for (const e of list) {
      if (e.event === "goal") {
        if (e.team_id === home?.id) homeGoals++;
        if (e.team_id === away?.id) awayGoals++;
      }
    }
    await supabase.from("games").update({ home_score: homeGoals, away_score: awayGoals }).eq("id", game.id);
    setGame((g) => g ? { ...g, home_score: homeGoals, away_score: awayGoals } : g);
  }

  // ---------- Add Event ----------
  async function addEvent() {
    if (!game || !formPlayer || !formType) return;
    setSaving(true);
    try {
      const teamId = teamIdFor(formTeam);
      const rows = [];
      const base = {
        game_id: game.id,
        period,
        time_mmss: mmss,
      };

      if (formType === "goal") {
        rows.push({ ...base, event: "goal", player_id: formPlayer, team_id: teamId });
        if (formA1) rows.push({ ...base, event: "assist", player_id: formA1, team_id: teamId });
        if (formA2) rows.push({ ...base, event: "assist", player_id: formA2, team_id: teamId });

        // also bump GA for opposite goalie on ice
        const oppGoalie = formTeam === "home" ? awayGoalie : homeGoalie;
        const oppTeamId = formTeam === "home" ? away?.id : home?.id;
        if (oppGoalie && oppTeamId) {
          await supabase.rpc("increment_goalie_ga", {
            p_game_id: game.id,
            p_player_id: oppGoalie,
            p_team_id: oppTeamId,
            p_delta: 1,
          }).catch(async () => {
            const { data: gg } = await supabase
              .from("game_goalies")
              .select("id, goals_against")
              .eq("game_id", game.id)
              .eq("player_id", oppGoalie)
              .eq("team_id", oppTeamId)
              .maybeSingle();
            if (!gg) {
              await supabase.from("game_goalies").insert({
                game_id: game.id, player_id: oppGoalie, team_id: oppTeamId, goals_against: 1,
              });
            } else {
              await supabase
                .from("game_goalies")
                .update({ goals_against: (gg.goals_against || 0) + 1 })
                .eq("id", gg.id);
            }
          });
        }
      } else if (formType === "assist") {
        rows.push({ ...base, event: "assist", player_id: formPlayer, team_id: teamId });
      } else if (formType === "shot+") {
        // Shot against the opposite goalie
        const oppGoalie = formTeam === "home" ? awayGoalie : homeGoalie;
        const oppTeamId = formTeam === "home" ? away?.id : home?.id;
        if (oppGoalie && oppTeamId) {
          await supabase.rpc("increment_goalie_shots", {
            p_game_id: game.id,
            p_player_id: oppGoalie,
            p_team_id: oppTeamId,
            p_delta: 1,
          }).catch(async () => {
            const { data: gg } = await supabase
              .from("game_goalies")
              .select("id, shots_against")
              .eq("game_id", game.id)
              .eq("player_id", oppGoalie)
              .eq("team_id", oppTeamId)
              .maybeSingle();
            if (!gg) {
              await supabase.from("game_goalies").insert({
                game_id: game.id, player_id: oppGoalie, team_id: oppTeamId, shots_against: 1,
              });
            } else {
              await supabase
                .from("game_goalies")
                .update({ shots_against: (gg.shots_against || 0) + 1 })
                .eq("id", gg.id);
            }
          });
        }
      } else if (formType === "shot-") {
        const oppGoalie = formTeam === "home" ? awayGoalie : homeGoalie;
        const oppTeamId = formTeam === "home" ? away?.id : home?.id;
        if (oppGoalie && oppTeamId) {
          await supabase.rpc("increment_goalie_shots", {
            p_game_id: game.id,
            p_player_id: oppGoalie,
            p_team_id: oppTeamId,
            p_delta: -1,
          }).catch(async () => {
            const { data: gg } = await supabase
              .from("game_goalies")
              .select("id, shots_against")
              .eq("game_id", game.id)
              .eq("player_id", oppGoalie)
              .eq("team_id", oppTeamId)
              .maybeSingle();
            if (gg) {
              await supabase
                .from("game_goalies")
                .update({ shots_against: Math.max(0, (gg.shots_against || 0) - 1) })
                .eq("id", gg.id);
            }
          });
        }
      }

      if (rows.length) {
        await supabase.from("events").insert(rows);
      }

      // reload events and recompute score
      await refreshEvents();
    } finally {
      setSaving(false);
    }
  }

  // ---------- Delete Event ----------
  async function deleteEvent(evId) {
    if (!game) return;
    await supabase.from("events").delete().eq("id", evId);
    await refreshEvents();
  }

  async function refreshEvents() {
    if (!game) return;
    const { data: evs } = await supabase
      .from("events")
      .select("id, period, time_mmss, event, player_id, team_id, created_at")
      .eq("game_id", game.id)
      .order("period", { ascending: true })
      .order("time_mmss", { ascending: true });

    // preload player info
    const pids = Array.from(new Set((evs || []).map(e => e.player_id).filter(Boolean)));
    let pMap = new Map();
    if (pids.length) {
      const { data: plist } = await supabase
        .from("players")
        .select("id, name, number, team_id")
        .in("id", pids);
      pMap = new Map((plist || []).map(p => [p.id, p]));
    }

    const next = (evs || []).map(e => ({
      ...e,
      player_name: pMap.get(e.player_id)?.name ?? `#${e.player_id}`,
      jersey: pMap.get(e.player_id)?.number ?? null,
      team_code:
        e.team_id === home?.id ? (home.short_name || "HOME")
          : e.team_id === away?.id ? (away.short_name || "AWAY")
          : "-",
    }));
    setEvents(next);
    await recomputeAndPushScore(next);
  }

  // ---------- Final / Unfinal ----------
  async function toggleFinal() {
    if (!game) return;
    const next = game.status === "final" ? "open" : "final";
    await supabase.from("games").update({ status: next }).eq("id", game.id);
    setGame(g => g ? { ...g, status: next } : g);
  }

  if (!game || !home || !away) {
    return <div>{t("Loading…")}</div>;
  }

  const teamOptions = [
    { value: "home", label: home.short_name || "HOME" },
    { value: "away", label: away.short_name || "AWAY" },
  ];

  const playerOptions = playersFor(formTeam);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link to="/games" style={{ textDecoration: "none" }}>← {t("Back to Games")}</Link>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>
          {t("LIVE")} • {new Date(game.game_date).toLocaleDateString()}
        </div>
      </div>

      {/* EVENTS FORM */}
      <section style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 }}>
          <Field label={t("Team")} span={2}>
            <select value={formTeam} onChange={(e) => setFormTeam(e.target.value)} style={input}>
              {teamOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label={t("Type")} span={2}>
            <select value={formType} onChange={(e) => setFormType(e.target.value)} style={input}>
              <option value="goal">{t("Goal")}</option>
              <option value="assist">{t("Assist")}</option>
              <option value="shot+">{t("Shot +")}</option>
              <option value="shot-">{t("Shot −")}</option>
            </select>
          </Field>
          <Field label={t("Player")} span={4}>
            <select value={formPlayer || ""} onChange={(e) => setFormPlayer(Number(e.target.value) || null)} style={input}>
              <option value="">{t("Select player…")}</option>
              {playerOptions.map(p => (
                <option key={p.id} value={p.id}>
                  {`#${p.number ?? ""} — ${p.name}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Assist 1")} span={2}>
            <select value={formA1 || ""} onChange={(e) => setFormA1(Number(e.target.value) || null)} style={input}>
              <option value="">{t("None")}</option>
              {playerOptions.map(p => <option key={p.id} value={p.id}>{`#${p.number ?? ""} — ${p.name}`}</option>)}
            </select>
          </Field>
          <Field label={t("Assist 2")} span={2}>
            <select value={formA2 || ""} onChange={(e) => setFormA2(Number(e.target.value) || null)} style={input}>
              <option value="">{t("None")}</option>
              {playerOptions.map(p => <option key={p.id} value={p.id}>{`#${p.number ?? ""} — ${p.name}`}</option>)}
            </select>
          </Field>

          <Field label={t("Period")} span={1}>
            <input type="number" value={period} onChange={(e) => setPeriod(Number(e.target.value) || 1)} style={input} />
          </Field>
          <Field label={t("Time (MM:SS)")} span={2}>
            <input value={mmss} onChange={(e) => setMmss(e.target.value)} style={input} />
          </Field>
          <Field label=" " span={2}>
            <button className="btn" onClick={() => setMmss(mmss)}>{t("Stamp clock")}</button>
          </Field>
          <Field label=" " span={2}>
            <button className="btn btn-primary" onClick={addEvent} disabled={saving}>
              {saving ? t("Saving…") : t("Add event")}
            </button>
          </Field>

          {/* QUICK SHOTS */}
          <Field label={t("Quick:")} span={12}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => { setFormTeam("away"); setFormType("shot+"); addEvent(); }}>
                {(away.short_name || "AWY")} {t("Shot +")}
              </button>
              <button className="btn" onClick={() => { setFormTeam("home"); setFormType("shot+"); addEvent(); }}>
                {(home.short_name || "HOM")} {t("Shot +")}
              </button>
              <button className="btn" onClick={() => { setFormTeam("away"); setFormType("shot-"); addEvent(); }}>
                {(away.short_name || "AWY")} {t("Shot −")}
              </button>
              <button className="btn" onClick={() => { setFormTeam("home"); setFormType("shot-"); addEvent(); }}>
                {(home.short_name || "HOM")} {t("Shot −")}
              </button>
            </div>
          </Field>

          {/* GOALIES ON ICE */}
          <Field label={`${away.short_name || "AWAY"} ${t("Goalie on ice")}`} span={4}>
            <select value={awayGoalie || ""} onChange={(e) => setAwayGoalie(Number(e.target.value) || null)} style={input}>
              {awayPlayers.map(p => <option key={p.id} value={p.id}>{`#${p.number ?? ""} — ${p.name}`}</option>)}
            </select>
          </Field>
          <Field label={`${home.short_name || "HOME"} ${t("Goalie on ice")}`} span={4}>
            <select value={homeGoalie || ""} onChange={(e) => setHomeGoalie(Number(e.target.value) || null)} style={input}>
              {homePlayers.map(p => <option key={p.id} value={p.id}>{`#${p.number ?? ""} — ${p.name}`}</option>)}
            </select>
          </Field>

          {/* CLOCK CONTROLS */}
          <Field label={t("Clock")} span={4}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <strong>{mmss}</strong>
              {running ? (
                <button className="btn" onClick={onStop}>{t("Stop")}</button>
              ) : (
                <button className="btn" onClick={onStart}>{t("Start")}</button>
              )}
              <button className="btn" onClick={onReset}>{t("Reset")}</button>
              <input
                type="number"
                value={periodLen}
                onChange={(e) => setPeriodLen(Number(e.target.value) || 15)}
                style={{ ...input, width: 70 }}
              />
              <button className="btn" onClick={onApplyPeriodLen}>{t("Apply")}</button>
            </div>
          </Field>
        </div>
      </section>

      {/* SCORE HEADER (side by side) */}
      <section style={{ ...card, display: "grid", gridTemplateColumns: "1fr 180px 1fr", alignItems: "center", gap: 12 }}>
        <TeamHeader team={away} align="flex-start" />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, fontWeight: 800 }}>
            {(game.home_score ?? 0)} <span style={{ fontWeight: 400 }}>vs</span> {(game.away_score ?? 0)}
          </div>
          <div style={{ marginTop: 6 }}>
            <button className="btn" onClick={toggleFinal}>
              {game.status === "final" ? t("Unfinal") : t("Final")}
            </button>
          </div>
        </div>
        <TeamHeader team={home} align="flex-end" />
      </section>

      {/* EVENTS TABLE */}
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>{t("Events")}</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={tbl}>
            <thead style={thead}>
              <tr>
                <th style={th}>{t("Period")}</th>
                <th style={th}>{t("Time")}</th>
                <th style={th}>{t("Team")}</th>
                <th style={th}>{t("Type")}</th>
                <th style={th}>{t("Player")}</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr><td style={td} colSpan={6}>{t("No events yet.")}</td></tr>
              ) : events.map((e) => (
                <tr key={e.id}>
                  <td style={td}>{e.period}</td>
                  <td style={td}>{e.time_mmss}</td>
                  <td style={td}>{e.team_code}</td>
                  <td style={td}>{e.eventanalysis
::contentReference[oaicite:0]{index=0}
