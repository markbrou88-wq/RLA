// src/pages/SummaryPage.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

// Small helper for i18n (safe even if you don't use it)
function useMaybeI18n() {
  try {
    const { useI18n } = require("../i18n");
    return useI18n();
  } catch {
    return { t: (s) => s };
  }
}

export default function SummaryPage() {
  const { t } = useMaybeI18n();
  const { key } = useParams(); // the slug (preferred) or numeric id
  const [loading, setLoading] = React.useState(true);
  const [game, setGame] = React.useState(null);
  const [home, setHome] = React.useState(null);
  const [away, setAway] = React.useState(null);
  const [events, setEvents] = React.useState([]);
  const [rosterByTeam, setRosterByTeam] = React.useState({});

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1) Load game by slug (fallback to id if needed)
      const isNumeric = /^\d+$/.test(key);
      const gameQ = supabase
        .from("games")
        .select(
          "id, slug, game_date, status, home_team_id, away_team_id, home_score, away_score, went_ot"
        )
        .limit(1);

      const { data: gRows, error: gErr } = isNumeric
        ? await gameQ.eq("id", Number(key))
        : await gameQ.eq("slug", key);

      if (gErr || !gRows || gRows.length === 0) {
        if (!cancelled) {
          setGame(null);
          setLoading(false);
        }
        return;
      }
      const g = gRows[0];

      // 2) Teams
      const { data: teamRows } = await supabase
        .from("teams")
        .select("id, name, short_name, logo_url")
        .in("id", [g.home_team_id, g.away_team_id]);

      const homeTeam = teamRows?.find((t) => t.id === g.home_team_id) ?? null;
      const awayTeam = teamRows?.find((t) => t.id === g.away_team_id) ?? null;

      // 3) Events
      const { data: evRows } = await supabase
        .from("events")
        .select(
          "id, game_id, team_id, period, time_mmss, event, player_id, assist1_id, assist2_id"
        )
        .eq("game_id", g.id)
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: false });

      // 4) Roster that actually played (from game_rosters)
      const { data: rosterRows } = await supabase
        .from("game_rosters")
        .select("team_id, player_id")
        .eq("game_id", g.id);

      const rosterSets = {};
      for (const r of rosterRows || []) {
        if (!rosterSets[r.team_id]) rosterSets[r.team_id] = new Set();
        rosterSets[r.team_id].add(r.player_id);
      }

      // 5) Resolve player names/numbers used in events
      const ids = Array.from(
        new Set(
          (evRows || [])
            .flatMap((e) => [e.player_id, e.assist1_id, e.assist2_id])
            .filter(Boolean)
        )
      );
      const playersById = {};
      if (ids.length) {
        const { data: pRows } = await supabase
          .from("players")
          .select("id, number, name")
          .in("id", ids);
        for (const p of pRows || []) playersById[p.id] = p;
      }

      if (!cancelled) {
        setGame(g);
        setHome(homeTeam);
        setAway(awayTeam);
        setEvents(
          (evRows || []).map((e) => ({
            ...e,
            player: e.player_id ? playersById[e.player_id] : null,
            a1: e.assist1_id ? playersById[e.assist1_id] : null,
            a2: e.assist2_id ? playersById[e.assist2_id] : null,
          }))
        );
        const rosterByTeamPlain = {};
        Object.entries(rosterSets).forEach(([tid, set]) => {
          rosterByTeamPlain[tid] = Array.from(set);
        });
        setRosterByTeam(rosterByTeamPlain);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (loading) return <div style={{ padding: 12 }}>{t("Loading…")}</div>;
  if (!game) return <div style={{ padding: 12 }}>{t("Game not found.")}</div>;

  const title = `${away?.name ?? t("Away")} ${game.away_score} — ${game.home_score} ${
    home?.name ?? t("Home")
  }`;

  return (
    <div className="summary-wrap">
      <div style={{ marginBottom: 12 }}>
        <Link to="/games">← {t("Back to Games")}</Link>
      </div>

      <div className="summary-header">
        {away?.logo_url ? <img src={away.logo_url} alt="" className="summary-logo" /> : <span />}
        <h2 className="summary-title">{title}</h2>
        {home?.logo_url ? <img src={home.logo_url} alt="" className="summary-logo" /> : <span />}
      </div>

      <div className="summary-subtitle">
        {new Date(game.game_date).toLocaleString()} • {game.status}
      </div>

      {/* Lineups */}
      <div className="summary-grid">
        <div className="summary-card">
          <h3>{away?.short_name || away?.name || t("Away")} {t("Lineup")}</h3>
          <RosterList teamId={game.away_team_id} ids={rosterByTeam[game.away_team_id]} />
        </div>
        <div className="summary-card">
          <h3>{home?.short_name || home?.name || t("Home")} {t("Lineup")}</h3>
          <RosterList teamId={game.home_team_id} ids={rosterByTeam[game.home_team_id]} />
        </div>
      </div>

      {/* Events */}
      <div className="summary-card" style={{ marginTop: 16 }}>
        <h3>{t("Goals / Events")}</h3>
        <table className="nice-table">
          <thead>
            <tr>
              <th>{t("Period")}</th>
              <th>{t("Time")}</th>
              <th>{t("Team")}</th>
              <th>{t("Type")}</th>
              <th>{t("Player / Assists")}</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "#666" }}>
                  {t("No events recorded.")}
                </td>
              </tr>
            ) : (
              events.map((ev) => (
                <tr key={ev.id}>
                  <td>{ev.period}</td>
                  <td>{ev.time_mmss}</td>
                  <td>{ev.team_id === game.home_team_id ? (home?.short_name || "HOME") : (away?.short_name || "AWAY")}</td>
                  <td>{ev.event}</td>
                  <td>
                    {renderP(ev.player)}{" "}
                    {ev.a1 || ev.a2 ? (
                      <span style={{ color: "#666" }}>
                        (A: {[ev.a1, ev.a2].filter(Boolean).map(renderP).join(", ")})
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderP(p) {
  if (!p) return "";
  return `#${p.number} ${p.name}`;
}

function RosterList({ ids }) {
  const [players, setPlayers] = React.useState([]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!ids || ids.length === 0) {
        if (!cancelled) setPlayers([]);
        return;
      }
      const { data } = await supabase
        .from("players")
        .select("id, number, name, position")
        .in("id", ids);
      if (!cancelled)
        setPlayers((data || []).sort((a, b) => (a.number ?? 0) - (b.number ?? 0)));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ids]);

  return (
    <table className="nice-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Pos</th>
        </tr>
      </thead>
      <tbody>
        {players.length === 0 ? (
          <tr>
            <td colSpan={3} style={{ textAlign: "center", color: "#666" }}>—</td>
          </tr>
        ) : (
          players.map((p) => (
            <tr key={p.id}>
              <td>{p.number}</td>
              <td>{p.name}</td>
              <td>{p.position || ""}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
