// src/pages/SummaryPage.jsx
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

// defensive i18n
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
  const { slug } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [game, setGame] = React.useState(null);
  const [home, setHome] = React.useState(null);
  const [away, setAway] = React.useState(null);
  const [lineupHome, setLineupHome] = React.useState([]);
  const [lineupAway, setLineupAway] = React.useState([]);
  const [events, setEvents] = React.useState([]);

  React.useEffect(() => {
    let dead = false;

    async function load() {
      setLoading(true);

      // 1) Try by slug
      let { data: g, error: e1 } = await supabase
        .from("games")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      // 2) Fallback by numeric id
      if (!g && /^\d+$/.test(slug)) {
        const { data: g2, error: e2 } = await supabase
          .from("games")
          .select("*")
          .eq("id", Number(slug))
          .maybeSingle();
        if (!e2) g = g2;
      }

      if (!g) {
        if (!dead) {
          setGame(null);
          setLoading(false);
        }
        return;
      }

      const [{ data: th }, { data: ta }] = await Promise.all([
        supabase.from("teams").select("*").eq("id", g.home_team_id).single(),
        supabase.from("teams").select("*").eq("id", g.away_team_id).single(),
      ]);

      // lineups (players that were toggled IN on roster page)
      // If you use a table game_rosters, adjust the select accordingly:
      // expecting columns: game_id, team_id, player_id, played (bool)
      const [{ data: rh = [] }, { data: ra = [] }] = await Promise.all([
        supabase
          .from("game_rosters")
          .select("player_id, players(id,number,name,position)")
          .eq("game_id", g.id)
          .eq("team_id", g.home_team_id)
          .eq("played", true)
          .order("player_id"),
        supabase
          .from("game_rosters")
          .select("player_id, players(id,number,name,position)")
          .eq("game_id", g.id)
          .eq("team_id", g.away_team_id)
          .eq("played", true)
          .order("player_id"),
      ]);

      // events (read-only)
      // expecting: events(game_id, period, time_mmss, team_id, type, player_id, assist1_id, assist2_id)
      const { data: ev = [] } = await supabase
        .from("events")
        .select(
          "id, period, time_mmss, team_id, type, player:players!events_player_id_fkey(id,number,name), a1:players!events_assist1_id_fkey(id,number,name), a2:players!events_assist2_id_fkey(id,number,name)"
        )
        .eq("game_id", g.id)
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: false });

      if (!dead) {
        setGame(g);
        setHome(th || null);
        setAway(ta || null);
        setLineupHome(
          (rh || []).map((r) => r.players).filter(Boolean)
        );
        setLineupAway(
          (ra || []).map((r) => r.players).filter(Boolean)
        );
        setEvents(ev || []);
        setLoading(false);
      }
    }

    load();
    return () => {
      dead = true;
    };
  }, [slug]);

  if (loading) return <div style={{ padding: 12 }}>{t("Loading…")}</div>;
  if (!game) return <div style={{ padding: 12 }}>{t("Game not found.")}</div>;

  const title = `${away?.name || "—"} — ${home?.name || "—"}`;
  const when =
    game.game_date ? new Date(game.game_date).toLocaleString() : "";

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn" onClick={() => navigate(-1)}>
          {t("Back to Games")}
        </button>
      </div>

      <h2 style={{ textAlign: "center", marginTop: 10 }}>{title}</h2>
      <div className="muted" style={{ textAlign: "center", marginBottom: 16 }}>
        {game.status?.toUpperCase()} • {when}
      </div>

      {/* Lineups */}
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "1fr 1fr",
          marginBottom: 16,
        }}
      >
        <LineupCard team={away} players={lineupAway} />
        <LineupCard team={home} players={lineupHome} />
      </div>

      {/* Goals / Events (read-only) */}
      <div className="card" style={{ padding: 0 }}>
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid #eee",
            fontWeight: 600,
          }}
        >
          {t("Goals / Events")}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>{t("PERIOD")}</th>
              <th>{t("TIME")}</th>
              <th>{t("TEAM")}</th>
              <th>{t("TYPE")}</th>
              <th>{t("PLAYER / ASSISTS")}</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  {t("No events.")}
                </td>
              </tr>
            ) : (
              events.map((ev) => (
                <tr key={ev.id}>
                  <td>{ev.period}</td>
                  <td>{ev.time_mmss}</td>
                  <td>
                    {ev.team_id === home?.id
                      ? home?.short_name || home?.name
                      : away?.short_name || away?.name}
                  </td>
                  <td>{ev.type}</td>
                  <td>
                    {fmtPlayer(ev.player)}
                    {ev.a1 ? ` (A: ${fmtPlayer(ev.a1)}` : ""}
                    {ev.a2 ? `${ev.a1 ? ", " : " ("}A: ${fmtPlayer(ev.a2)}` : ""}
                    {(ev.a1 || ev.a2) ? ")" : ""}
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

function LineupCard({ team, players }) {
  return (
    <div className="card">
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid #eee",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {team?.logo_url ? (
          <img
            src={team.logo_url}
            alt={team?.name || "team"}
            style={{ width: 22, height: 22, objectFit: "contain" }}
          />
        ) : null}
        <div style={{ fontWeight: 600 }}>
          {team?.short_name || team?.name || "—"} {tTag(team)}
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 50 }}>#</th>
            <th>{t("PLAYER")}</th>
            <th style={{ width: 60 }}>{t("POS")}</th>
          </tr>
        </thead>
        <tbody>
          {players.length === 0 ? (
            <tr>
              <td colSpan={3} className="muted">
                {t("No lineup shared.")}
              </td>
            </tr>
          ) : (
            players.map((p) => (
              <tr key={p.id}>
                <td>{p.number ?? "—"}</td>
                <td>{p.name}</td>
                <td>{p.position || ""}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function fmtPlayer(p) {
  if (!p) return "—";
  return p.number != null ? `#${p.number} ${p.name}` : p.name;
}
function tTag(team) {
  if (!team) return "";
  return "";
}
