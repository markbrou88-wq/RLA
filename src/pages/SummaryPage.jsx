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

function LineupCard({ team, players }) {
  return (
    <div className="card">
      <div className="row" style={{ alignItems: "center", gap: 8 }}>
        {team?.logo_url && <img src={team.logo_url} alt="" className="team-logo" />}
        <h3 className="m0">{team?.name || "—"}</h3>
      </div>
      <div style={{ marginTop: 8 }}>
        {players?.length ? (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>#</th>
                <th>Player</th>
                <th style={{ width: 80 }}>Pos</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td>{p.number ?? "—"}</td>
                  <td>{p.name}</td>
                  <td>{p.position ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted">No lineup recorded.</div>
        )}
      </div>
    </div>
  );
}

function EventsCard({ events, teamsById }) {
  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h3 className="m0">Goals / Events</h3>
      <div style={{ marginTop: 8 }}>
        {events?.length ? (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>Per</th>
                <th style={{ width: 64 }}>Time</th>
                <th style={{ width: 80 }}>Team</th>
                <th style={{ width: 80 }}>Type</th>
                <th>Player / Assists</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const t = teamsById[ev.team_id];
                const who = [
                  ev.player?.name ? ev.player.name : "—",
                  ev.a1?.name ? `(A: ${ev.a1.name}${ev.a2?.name ? ", " + ev.a2.name : ""})` : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <tr key={ev.id}>
                    <td>{ev.period}</td>
                    <td>{ev.time_mmss}</td>
                    <td>{t?.short_name ?? t?.name ?? "—"}</td>
                    <td>{ev.type}</td>
                    <td>{who}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="muted">No events yet.</div>
        )}
      </div>
    </div>
  );
}

export default function SummaryPage() {
  const { t } = useMaybeI18n();
  const { slug: rawSlug } = useParams();
  const navigate = useNavigate();

  const slug = decodeURIComponent(rawSlug || "");

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

      // 1) Try by slug – but be tolerant of duplicates
      let g = null;
      if (slug) {
        const { data, error } = await supabase
          .from("games")
          .select("*")
          .eq("slug", slug)
          .order("id", { ascending: false }) // take the most recent if duplicates exist
          .limit(1);
        if (!error && data && data.length) g = data[0];
      }

      // 2) Fallback by numeric id
      if (!g && /^\d+$/.test(slug)) {
        const { data: g2 } = await supabase
          .from("games")
          .select("*")
          .eq("id", Number(slug))
          .limit(1);
        if (g2 && g2.length) g = g2[0];
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

      // lineups: players toggled IN on roster page
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

      // events: read-only summary
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
        setLineupHome((rh || []).map((r) => r.players).filter(Boolean));
        setLineupAway((ra || []).map((r) => r.players).filter(Boolean));
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
  if (!game) return <div style={{ padding: 12 }}>{t("Game not found.")}</div>; // from your current page :contentReference[oaicite:1]{index=1}

  const title = `${away?.name || "—"} @ ${home?.name || "—"}`;
  const when = game.game_date ? new Date(game.game_date).toLocaleString() : "";
  const teamsById = {
    [home?.id || -1]: home,
    [away?.id || -1]: away,
  };

  return (
    <div>
      <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
        <button className="btn" onClick={() => navigate(-1)}>
          {t("Back to Games")}
        </button>
      </div>

      <h2 style={{ textAlign: "center", marginTop: 4 }}>{title}</h2>
      <div className="muted" style={{ textAlign: "center", marginBottom: 12 }}>
        {(game.status || "scheduled").toUpperCase()} • {when}
      </div>

      {/* Lineups + Events */}
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
        <EventsCard events={events} teamsById={teamsById} />
      </div>
    </div>
  );
}
