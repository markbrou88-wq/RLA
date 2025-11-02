// src/pages/BoxscorePage.jsx
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

function useMaybeI18n() {
  try {
    const { useI18n } = require("../i18n");
    return useI18n();
  } catch {
    return { t: (s) => s };
  }
}

function fmtClock(mmss) {
  // expect "MM:SS" or "M:SS"; keep as-is if malformed
  if (!mmss) return "";
  const parts = String(mmss).split(":");
  if (parts.length !== 2) return mmss;
  const m = parts[0].padStart(1, "0");
  const s = parts[1].padStart(2, "0");
  return `${m}:${s}`;
}

export default function BoxscorePage() {
  const { t } = useMaybeI18n();
  const navigate = useNavigate();
  const { slug } = useParams();

  const [loading, setLoading] = React.useState(true);
  const [game, setGame] = React.useState(null);
  const [homeTeam, setHomeTeam] = React.useState(null);
  const [awayTeam, setAwayTeam] = React.useState(null);
  const [homeRoster, setHomeRoster] = React.useState([]); // dressed only
  const [awayRoster, setAwayRoster] = React.useState([]);
  const [goals, setGoals] = React.useState([]); // ordered events (type='goal')

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1) game by slug or numeric id
      const { data: gRow, error: gErr } = await supabase
        .from("games")
        .select(
          "id, slug, game_date, home_team_id, away_team_id, home_score, away_score, status"
        )
        .or(`slug.eq.${slug},id.eq.${Number(slug) || -1}`)
        .limit(1)
        .single();

      if (gErr) {
        console.error(gErr);
        if (!cancelled) setLoading(false);
        return;
      }

      // 2) teams
      const { data: teams, error: tErr } = await supabase
        .from("teams")
        .select("id, name, short_name, logo_url");

      if (tErr) {
        console.error(tErr);
        if (!cancelled) setLoading(false);
        return;
      }

      const home = teams.find((x) => x.id === gRow.home_team_id) || {};
      const away = teams.find((x) => x.id === gRow.away_team_id) || {};

      // 3) dressed rosters (join players)
      const { data: rosterRows, error: rErr } = await supabase
        .from("game_rosters")
        .select(
          "id, team_id, player_id, dressed, players(id, number, name, position)"
        )
        .eq("game_id", gRow.id)
        .eq("dressed", true)
        .order("team_id", { ascending: true });

      if (rErr) {
        console.error(rErr);
        if (!cancelled) setLoading(false);
        return;
      }

      const homeR = rosterRows
        .filter((r) => r.team_id === gRow.home_team_id)
        .map((r) => ({
          id: r.players?.id,
          number: r.players?.number,
          name: r.players?.name,
          position: r.players?.position || "",
        }))
        .sort((a, b) => (a.number || 0) - (b.number || 0));

      const awayR = rosterRows
        .filter((r) => r.team_id === gRow.away_team_id)
        .map((r) => ({
          id: r.players?.id,
          number: r.players?.number,
          name: r.players?.name,
          position: r.players?.position || "",
        }))
        .sort((a, b) => (a.number || 0) - (b.number || 0));

      // 4) goal events
      const { data: evRows, error: eErr } = await supabase
        .from("events")
        .select(
          "id, period, time_mmss, team_id, event, player_id, assist1_id, assist2_id, players!events_player_id_fkey(id, name), a1:players!events_assist1_id_fkey(id, name), a2:players!events_assist2_id_fkey(id, name)"
        )
        .eq("game_id", gRow.id)
        .eq("event", "goal")
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: false }); // later time first (15:00 -> 0:00)

      // NOTE: depending on your FK names, the aliases above may differ in your DB.
      // If joins don't work in your schema, fall back to fetching players separately.

      if (eErr) {
        console.error(eErr);
        if (!cancelled) setLoading(false);
        return;
      }

      // Team map for label
      const teamMap = new Map(teams.map((x) => [x.id, x]));

      const tidyGoals = evRows.map((e) => ({
        id: e.id,
        period: e.period,
        time: fmtClock(e.time_mmss),
        team: teamMap.get(e.team_id)?.short_name || teamMap.get(e.team_id)?.name || "",
        type: "goal",
        scorer: e.players?.name || "",
        a1: e.a1?.name || null,
        a2: e.a2?.name || null,
      }));

      if (!cancelled) {
        setGame(gRow);
        setHomeTeam(home);
        setAwayTeam(away);
        setHomeRoster(homeR);
        setAwayRoster(awayR);
        setGoals(tidyGoals);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) return <div style={{ padding: 16 }}>{t("Loading…")}</div>;
  if (!game) return <div style={{ padding: 16 }}>{t("Game not found.")}</div>;

  const d = new Date(game.game_date || "");
  const dateStr = isNaN(d) ? "" : d.toLocaleDateString();

  const titleScore = `${awayTeam?.name || "Away"} ${game.away_score ?? 0} — ${game.home_score ?? 0} ${homeTeam?.name || "Home"}`;
  const isFinal = String(game.status || "").toLowerCase() === "final";

  return (
    <div style={{ padding: "8px 12px 24px", maxWidth: 980, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginTop: 8, marginBottom: 18 }}>
        <h2 style={{ margin: 0 }}>{titleScore}</h2>
        <div style={{ color: "#666", fontSize: 14 }}>
          {isFinal ? "FINAL" : "NOT FINAL"} • {dateStr}
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={() => navigate(`/games/${game.slug || game.id}`)}>
            {t("Live")}
          </button>
          <button onClick={() => navigate(`/games/${game.slug || game.id}/roster`)}>
            {t("Roster")}
          </button>
          <button onClick={() => navigate("/games")}>{t("Back to Games")}</button>
        </div>
      </div>

      {/* Lineups */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 18,
        }}
      >
        <LineupCard
          title={`${awayTeam?.short_name || awayTeam?.name || "Away"} Lineup`}
          rows={awayRoster}
        />
        <LineupCard
          title={`${homeTeam?.short_name || homeTeam?.name || "Home"} Lineup`}
          rows={homeRoster}
        />
      </div>

      {/* Goals / Events */}
      <div style={{ border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
        <div
          style={{
            padding: "10px 12px",
            fontWeight: 700,
            borderBottom: "1px solid #eee",
            background: "#fafafa",
          }}
        >
          {t("Goals / Events")}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={theadTR}>
              <th style={th}>Period</th>
              <th style={th}>Time</th>
              <th style={th}>Team</th>
              <th style={th}>Type</th>
              <th style={{ ...th, textAlign: "left" }}>Player / Assists</th>
            </tr>
          </thead>
          <tbody>
            {goals.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 12, color: "#666", fontStyle: "italic" }}>
                  {t("No goal events recorded.")}
                </td>
              </tr>
            ) : (
              goals.map((g) => (
                <tr key={g.id} style={tbodyTR}>
                  <td style={tdCenter}>{g.period}</td>
                  <td style={tdCenter}>{g.time}</td>
                  <td style={tdCenter}>{g.team}</td>
                  <td style={tdCenter}>{g.type}</td>
                  <td style={{ ...td, fontWeight: 600 }}>
                    {g.scorer}{" "}
                    <span style={{ fontWeight: 400, color: "#555" }}>
                      {g.a1 || g.a2 ? `(A: ${[g.a1, g.a2].filter(Boolean).join(", ")})` : ""}
                    </span>
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

function LineupCard({ title, rows }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
      <div
        style={{
          padding: "10px 12px",
          fontWeight: 700,
          borderBottom: "1px solid #eee",
          background: "#fafafa",
        }}
      >
        {title}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={theadTR}>
            <th style={{ ...th, width: 56 }}>#</th>
            <th style={{ ...th, textAlign: "left" }}>Player</th>
            <th style={{ ...th, width: 48 }}>Pos</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ padding: 12, color: "#666", fontStyle: "italic" }}>
                No players.
              </td>
            </tr>
          ) : (
            rows.map((p) => (
              <tr key={p.id} style={tbodyTR}>
                <td style={tdCenter}>{p.number ?? ""}</td>
                <td style={{ ...td, textAlign: "left" }}>{p.name}</td>
                <td style={tdCenter}>{p.position || ""}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* tiny table styles */
const theadTR = { background: "#fafafa", borderBottom: "1px solid #eee" };
const tbodyTR = { borderBottom: "1px solid #f2f2f2" };
const th = { padding: "8px 10px", fontWeight: 600, fontSize: 13, color: "#444", textAlign: "center" };
const td = { padding: "8px 10px", fontSize: 13, color: "#222" };
const tdCenter = { ...td, textAlign: "center" };
