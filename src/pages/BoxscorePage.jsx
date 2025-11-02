// src/pages/BoxscorePage.jsx
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

function useMaybeI18n() {
  try {
    // eslint-disable-next-line global-require
    const { useI18n } = require("../i18n");
    return useI18n();
  } catch {
    return { t: (s) => s };
  }
}

export default function BoxscorePage() {
  const { t } = useMaybeI18n();
  const { gameId } = useParams(); // slug or id
  const navigate = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [game, setGame] = React.useState(null);
  const [homeTeam, setHomeTeam] = React.useState(null);
  const [awayTeam, setAwayTeam] = React.useState(null);
  const [events, setEvents] = React.useState([]); // goals only
  const [rosterHome, setRosterHome] = React.useState([]);
  const [rosterAway, setRosterAway] = React.useState([]);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1) Game
      const { data: gameRow, error: eGame } = await supabase
        .from("games")
        .select(
          "id, slug, game_date, status, went_ot, home_team_id, away_team_id, home_score, away_score"
        )
        .or(`id.eq.${gameId},slug.eq.${gameId}`)
        .limit(1)
        .single();

      if (eGame) {
        console.error(eGame);
        if (!cancelled) setLoading(false);
        return;
      }

      // 2) Teams
      const teamIds = [gameRow.home_team_id, gameRow.away_team_id].filter(Boolean);
      const { data: teamRows, error: eTeams } = await supabase
        .from("teams")
        .select("id, name, short_name, logo_url")
        .in("id", teamIds);

      if (eTeams) {
        console.error(eTeams);
        if (!cancelled) setLoading(false);
        return;
      }
      const mapTeams = Object.fromEntries(teamRows.map((r) => [r.id, r]));

      // 3) Rosters for that game (who dressed)
      const { data: rosterRows, error: eR } = await supabase
        .from("game_rosters")
        .select("team_id, player_id, dressed")
        .eq("game_id", gameRow.id)
        .eq("dressed", true);

      if (eR) {
        console.error(eR);
        if (!cancelled) setLoading(false);
        return;
      }

      const dressedIds = Array.from(new Set(rosterRows.map((r) => r.player_id)));
      // 4) Players referenced by roster or events
      //   Load events first to union all player ids we’ll need for names
      const { data: eventRows, error: eEv } = await supabase
        .from("events")
        .select("id, game_id, team_id, period, time_mmss, event, player_id, assist1_id, assist2_id")
        .eq("game_id", gameRow.id)
        .in("event", ["goal"])           // summary shows goals; add more types if you add later
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: false }); // 15:00 to 00:00

      if (eEv) {
        console.error(eEv);
        if (!cancelled) setLoading(false);
        return;
      }

      const idsFromEvents = eventRows.flatMap((e) =>
        [e.player_id, e.assist1_id, e.assist2_id].filter(Boolean)
      );
      const allPlayerIds = Array.from(new Set([...dressedIds, ...idsFromEvents]));

      const { data: playerRows, error: eP } = await supabase
        .from("players")
        .select("id, team_id, number, name, position")
        .in("id", allPlayerIds);

      if (eP) {
        console.error(eP);
        if (!cancelled) setLoading(false);
        return;
      }
      const mapPlayers = Object.fromEntries(playerRows.map((p) => [p.id, p]));

      // Build roster lists with jersey number sort
      const rosterHomeArr = rosterRows
        .filter((r) => r.team_id === gameRow.home_team_id)
        .map((r) => mapPlayers[r.player_id])
        .filter(Boolean)
        .sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999));

      const rosterAwayArr = rosterRows
        .filter((r) => r.team_id === gameRow.away_team_id)
        .map((r) => mapPlayers[r.player_id])
        .filter(Boolean)
        .sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999));

      // Decorate events with names
      const eventDecorated = eventRows.map((e) => {
        const scorer = e.player_id ? mapPlayers[e.player_id] : null;
        const a1 = e.assist1_id ? mapPlayers[e.assist1_id] : null;
        const a2 = e.assist2_id ? mapPlayers[e.assist2_id] : null;
        return { ...e, _scorer: scorer, _a1: a1, _a2: a2 };
      });

      if (!cancelled) {
        setGame(gameRow);
        setHomeTeam(mapTeams[gameRow.home_team_id] ?? null);
        setAwayTeam(mapTeams[gameRow.away_team_id] ?? null);
        setRosterHome(rosterHomeArr);
        setRosterAway(rosterAwayArr);
        setEvents(eventDecorated);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  if (loading) {
    return <div style={{ padding: 12 }}>{t("Loading…")}</div>;
  }
  if (!game) {
    return <div style={{ padding: 12 }}>{t("Game not found.")}</div>;
  }

  const homeScore = game.home_score ?? events.filter((e) => e.team_id === game.home_team_id).length;
  const awayScore = game.away_score ?? events.filter((e) => e.team_id === game.away_team_id).length;

  return (
    <div>
      {/* Header + nav */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => navigate(`/games/${game.slug || game.id}`)}>{t("Live")}</button>
        <button onClick={() => navigate(`/games/${game.slug || game.id}/roster`)}>{t("Roster")}</button>
        <button onClick={() => navigate(-1)}>{t("Back to Games")}</button>
      </div>

      {/* Title */}
      <h2 style={{ textAlign: "center", margin: "10px 0 4px" }}>
        {(awayTeam?.name || t("Away"))} {awayScore} — {homeScore} {(homeTeam?.name || t("Home"))}
      </h2>
      <div style={{ textAlign: "center", color: "#666", marginBottom: 16 }}>
        {game.status === "final" ? t("FINAL") : t(game.status || "scheduled")} •{" "}
        {new Date(game.game_date).toLocaleDateString()}
      </div>

      {/* Lineups */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          alignItems: "start",
          marginBottom: 18,
        }}
      >
        <TeamRosterCard title={awayTeam?.name || t("Away")} logo={awayTeam?.logo_url} rows={rosterAway} />
        <TeamRosterCard title={homeTeam?.name || t("Home")} logo={homeTeam?.logo_url} rows={rosterHome} />
      </div>

      {/* Events */}
      <div style={{ border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
        <div
          style={{
            padding: "10px 12px",
            fontWeight: 700,
            background: "#fafafa",
            borderBottom: "1px solid #eee",
          }}
        >
          {t("Goals / Events")}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={trHeadS}>
              <th style={thS}>{t("Period")}</th>
              <th style={thS}>{t("Time")}</th>
              <th style={thS}>{t("Team")}</th>
              <th style={thS}>{t("Type")}</th>
              <th style={thS}>{t("Player / Assists")}</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 12, textAlign: "center", color: "#666" }}>
                  {t("No events recorded yet.")}
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.id} style={trBodyS}>
                  <td style={tdS}>{e.period}</td>
                  <td style={tdS}>{e.time_mmss}</td>
                  <td style={tdS}>
                    {e.team_id === game.home_team_id ? homeTeam?.short_name || homeTeam?.name : awayTeam?.short_name || awayTeam?.name}
                  </td>
                  <td style={tdS}>{e.event}</td>
                  <td style={tdS}>
                    <strong>{renderPlayer(e._scorer)}</strong>{" "}
                    {e._a1 || e._a2 ? (
                      <span style={{ color: "#666" }}>
                        {" "}
                        (A: {[e._a1, e._a2].filter(Boolean).map(renderPlayer).join(", ")})
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

function TeamRosterCard({ title, logo, rows }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          background: "#fafafa",
          borderBottom: "1px solid #eee",
        }}
      >
        {logo ? <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} /> : null}
        <strong>{title}</strong>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={trHeadS}>
            <th style={{ ...thS, width: 60 }}>#</th>
            <th style={thS}>Player</th>
            <th style={{ ...thS, width: 60 }}>Pos</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ padding: 10, textAlign: "center", color: "#666" }}>
                No dressed players.
              </td>
            </tr>
          ) : (
            rows.map((p) => (
              <tr key={p.id} style={trBodyS}>
                <td style={tdS}>{p.number ?? "—"}</td>
                <td style={tdS}>{p.name}</td>
                <td style={tdS}>{p.position || "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function renderPlayer(p) {
  if (!p) return "";
  const num = p.number != null ? `#${p.number} ` : "";
  return `${num}${p.name}`;
}

const trHeadS = { background: "#fafafa", borderBottom: "1px solid #eee" };
const trBodyS = { borderBottom: "1px solid #f1f1f1" };
const thS = { padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: 14 };
const tdS = { padding: "8px 10px", verticalAlign: "top", fontSize: 14 };
