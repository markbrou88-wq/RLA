// src/pages/BoxscorePage.jsx
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

export default function BoxscorePage() {
  const { t } = useMaybeI18n();
  const { slug } = useParams();

  const [game, setGame] = React.useState(null);
  const [homeTeam, setHomeTeam] = React.useState(null);
  const [awayTeam, setAwayTeam] = React.useState(null);
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1) Game
      const { data: g } = await supabase
        .from("games")
        .select("id, slug, game_date, home_team_id, away_team_id, home_score, away_score, status")
        .or(`slug.eq.${slug},id.eq.${Number(slug) || -1}`)
        .maybeSingle();

      if (!g) { setLoading(false); return; }

      // 2) Teams
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name, short_name, logo_url");

      const tMap = new Map((teams || []).map(x => [x.id, x]));
      const home = tMap.get(g.home_team_id) || null;
      const away = tMap.get(g.away_team_id) || null;

      // 3) Events with player info
      const { data: evs } = await supabase
        .from("events")
        .select("id, period, time_mmss, event, player_id, team_id")
        .eq("game_id", g.id)
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: true });

      // preload players used
      const ids = Array.from(new Set((evs || []).map(e => e.player_id).filter(Boolean)));
      let pMap = new Map();
      if (ids.length) {
        const { data: plist } = await supabase
          .from("players")
          .select("id, name, number")
          .in("id", ids);
        pMap = new Map((plist || []).map(p => [p.id, p]));
      }

      if (!cancelled) {
        setGame(g);
        setHomeTeam(home);
        setAwayTeam(away);
        setEvents((evs || []).map(e => ({
          ...e,
          player_name: pMap.get(e.player_id)?.name ?? `#${e.player_id}`,
          jersey: pMap.get(e.player_id)?.number ?? null,
          team_code: e.team_id === home?.id ? (home.short_name || "HOME")
                    : e.team_id === away?.id ? (away.short_name || "AWAY")
                    : "-",
        })));
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) return <div>{t("Loading…")}</div>;
  if (!game) return <div>{t("Game not found.")}</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
        <Link to="/games" style={{ textDecoration: "none" }}>← {t("Back to Games")}</Link>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>
          {game.status?.toUpperCase()}
          {" • "}
          {new Date(game.game_date).toLocaleDateString()}
        </div>
      </div>

      {/* Score header */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <TeamHeader team={awayTeam} align="flex-start" />
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: 28 }}>
          {game.home_score ?? 0} <span style={{ fontWeight: 400 }}>vs</span> {game.away_score ?? 0}
        </div>
        <TeamHeader team={homeTeam} align="flex-end" />
      </div>

      {/* Events */}
      <section style={{ marginTop: 10 }}>
        <h3>{t("Events")}</h3>
        <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
          <table style={tbl}>
            <thead style={thead}>
              <tr>
                <th style={th}>{t("Period")}</th>
                <th style={th}>{t("Time")}</th>
                <th style={th}>{t("Team")}</th>
                <th style={th}>{t("Type")}</th>
                <th style={th}>{t("Player")}</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr><td style={td} colSpan={5}>{t("No events yet.")}</td></tr>
              ) : events.map((e) => (
                <tr key={e.id}>
                  <td style={td}>{e.period}</td>
                  <td style={td}>{e.time_mmss}</td>
                  <td style={td}>{e.team_code}</td>
                  <td style={td}>{e.event}</td>
                  <td style={td}>
                    {/* CLICKABLE NAME IN BOXCORE */}
                    <PlayerLink id={e.player_id}>
                      {e.jersey ? `#${e.jersey} — ` : ""}{e.player_name}
                    </PlayerLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TeamHeader({ team, align = "flex-start" }) {
  if (!team) return <div />;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: align }}>
      {team.logo_url ? (
        <img src={team.logo_url} alt={team.short_name || team.name} style={{ width: 36, height: 36, objectFit: "contain" }} />
      ) : null}
      <div style={{ textAlign: align === "flex-end" ? "right" : "left" }}>
        <div style={{ fontWeight: 700 }}>{team.name}</div>
        <div style={{ color: "#666", fontSize: 12 }}>{team.short_name}</div>
      </div>
    </div>
  );
}

const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const thead = { background: "var(--table-head, #f4f5f8)" };
const th = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" };
const td = { padding: "10px 12px", borderBottom: "1px solid #f3f3f3", whiteSpace: "nowrap" };
