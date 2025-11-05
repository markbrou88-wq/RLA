// src/pages/BoxscorePage.jsx
import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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

  const [homeRecord, setHomeRecord] = React.useState(null);
  const [awayRecord, setAwayRecord] = React.useState(null);

  const [events, setEvents] = React.useState([]); // goals only
  const [rosterHome, setRosterHome] = React.useState([]);
  const [rosterAway, setRosterAway] = React.useState([]);

  const [goalieRecordMap, setGoalieRecordMap] = React.useState(new Map()); // player_id -> {w,l,ot}

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
      const byId = Object.fromEntries(teamRows.map((r) => [r.id, r]));

      // 3) Team records (standings_current)
      const { data: standingRows, error: eStd } = await supabase
        .from("standings_current")
        .select("team_id, w, l, otl")
        .in("team_id", teamIds);

      if (eStd) {
        console.error(eStd);
      }
      const recByTeam = new Map(
        (standingRows || []).map((r) => [r.team_id, `${r.w ?? 0}-${r.l ?? 0}-${r.otl ?? 0}`])
      );

      // 4) Rosters (who dressed)
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

      // 5) Events (goals only in summary)
      const { data: eventRows, error: eEv } = await supabase
        .from("events")
        .select(
          "id, game_id, team_id, period, time_mmss, event, player_id, assist1_id, assist2_id"
        )
        .eq("game_id", gameRow.id)
        .in("event", ["goal"])
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: false });

      if (eEv) {
        console.error(eEv);
        if (!cancelled) setLoading(false);
        return;
      }

      const idsFromEvents = eventRows.flatMap((e) =>
        [e.player_id, e.assist1_id, e.assist2_id].filter(Boolean)
      );
      const allPlayerIds = Array.from(new Set([...dressedIds, ...idsFromEvents]));

      // 6) Players (numbers/names/positions)
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

      // 7) Build rosters per side (sorted by number)
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

      // 8) Decorate events with player objects
      const eventDecorated = eventRows.map((e) => {
        const scorer = e.player_id ? mapPlayers[e.player_id] : null;
        const a1 = e.assist1_id ? mapPlayers[e.assist1_id] : null;
        const a2 = e.assist2_id ? mapPlayers[e.assist2_id] : null;
        return { ...e, _scorer: scorer, _a1: a1, _a2: a2 };
      });

      // 9) Goalie records (if your view exists)
      try {
        const goalieIds = [...rosterHomeArr, ...rosterAwayArr]
          .filter((p) => (p.position || "").toUpperCase() === "G")
          .map((p) => p.id);

        if (goalieIds.length) {
          // Adjust to your columns if different
          const { data: gr, error: eGR } = await supabase
            .from("goalie_stats_current")
            .select("player_id, w, l, otl")
            .in("player_id", goalieIds);

          if (eGR) console.error(eGR);
          const m = new Map();
          (gr || []).forEach((r) => {
            m.set(r.player_id, {
              w: r.w ?? 0,
              l: r.l ?? 0,
              ot: r.otl ?? 0,
            });
          });
          if (!cancelled) setGoalieRecordMap(m);
        }
      } catch (err) {
        console.warn("Goalie record lookup skipped:", err);
      }

      if (!cancelled) {
        setGame(gameRow);
        setHomeTeam(byId[gameRow.home_team_id] ?? null);
        setAwayTeam(byId[gameRow.away_team_id] ?? null);
        setHomeRecord(recByTeam.get(gameRow.home_team_id) || null);
        setAwayRecord(recByTeam.get(gameRow.away_team_id) || null);
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

  const homeScore =
    game.home_score ?? events.filter((e) => e.team_id === game.home_team_id).length;
  const awayScore =
    game.away_score ?? events.filter((e) => e.team_id === game.away_team_id).length;

  return (
    <div>
      {/* Header + nav */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => navigate(`/games/${game.slug || game.id}`)}>{t("Live")}</button>
        <button onClick={() => navigate(`/games/${game.slug || game.id}/roster`)}>
          {t("Roster")}
        </button>
        <button onClick={() => navigate(-1)}>{t("Back to Games")}</button>
      </div>

      {/* Title */}
      <h2 style={{ textAlign: "center", margin: "10px 0 4px" }}>
        {(awayTeam?.name || t("Away"))} {awayScore} — {homeScore}{" "}
        {(homeTeam?.name || t("Home"))}
      </h2>
      <div style={{ textAlign: "center", color: "#666", marginBottom: 16 }}>
        {game.status === "final" ? t("FINAL") : t(game.status || "scheduled")} •{" "}
        {new Date(game.game_date).toLocaleDateString()}
      </div>

      {/* Lineups (Away left, Home right) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          alignItems: "start",
          marginBottom: 18,
        }}
      >
        <TeamRosterCard
          title={awayTeam?.name || t("Away")}
          record={awayRecord}
          logo={awayTeam?.logo_url}
          rows={rosterAway}
          goalieRecordMap={goalieRecordMap}
        />
        <TeamRosterCard
          title={homeTeam?.name || t("Home")}
          record={homeRecord}
          logo={homeTeam?.logo_url}
          rows={rosterHome}
          goalieRecordMap={goalieRecordMap}
        />
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
                    {e.team_id === game.home_team_id
                      ? homeTeam?.short_name || homeTeam?.name
                      : awayTeam?.short_name || awayTeam?.name}
                  </td>
                  <td style={tdS}>{e.event}</td>
                  <td style={tdS}>
                    <strong>{renderPlayerLink(e._scorer)}</strong>{" "}
                    {e._a1 || e._a2 ? (
                      <span style={{ color: "#666" }}>
                        {" "}
                        (A:{" "}
                        {[e._a1, e._a2]
                          .filter(Boolean)
                          .map((p, i) => (
                            <React.Fragment key={p.id}>
                              {i > 0 ? ", " : null}
                              {renderPlayerLink(p)}
                            </React.Fragment>
                          ))}{" "}
                        )
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

function TeamRosterCard({ title, record, logo, rows, goalieRecordMap }) {
  const skaters = rows.filter((p) => (p.position || "").toUpperCase() !== "G");
  const goalies = rows.filter((p) => (p.position || "").toUpperCase() === "G");

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
        {record ? <span style={{ color: "#666", marginLeft: 8 }}>({record})</span> : null}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={trHeadS}>
            <th style={{ ...thS, width: 60 }}>#</th>
            <th style={thS}>Player</th>
            <th style={{ ...thS, width: 60 }}>Pos</th>
            <th style={{ ...thS, width: 90, textAlign: "right" }}>Rec</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ padding: 10, textAlign: "center", color: "#666" }}>
                No dressed players.
              </td>
            </tr>
          ) : (
            <>
              {skaters.map((p) => (
                <RosterRow key={p.id} p={p} rec={null} />
              ))}

              {/* Separator between skaters and goalies (only if we have a goalie) */}
              {goalies.length ? (
                <tr>
                  <td colSpan={4} style={{ padding: 4, background: "#fafafa" }} />
                </tr>
              ) : null}

              {goalies.map((p) => {
                const rec = goalieRecordMap.get(p.id);
                const recStr = rec ? `${rec.w}-${rec.l}-${rec.ot}` : "—";
                return <RosterRow key={p.id} p={p} rec={recStr} />;
              })}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RosterRow({ p, rec }) {
  return (
    <tr style={trBodyS}>
      <td style={tdS}>{p.number ?? "—"}</td>
      <td style={tdS}>{renderPlayerLink(p)}</td>
      <td style={tdS}>{p.position || "—"}</td>
      <td style={{ ...tdS, textAlign: "right", color: "#444" }}>{rec ?? ""}</td>
    </tr>
  );
}

/** Clickable player link for events & roster */
function renderPlayerLink(p) {
  if (!p) return null;
  const num = p.number != null ? `#${p.number} ` : "";
  return (
    <Link to={`/players/${p.id}`} style={{ textDecoration: "none" }}>
      {num}
      {p.name}
    </Link>
  );
}

const trHeadS = { background: "#fafafa", borderBottom: "1px solid #eee" };
const trBodyS = { borderBottom: "1px solid #f1f1f1" };
const thS = { padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: 14 };
const tdS = { padding: "8px 10px", verticalAlign: "top", fontSize: 14 };
