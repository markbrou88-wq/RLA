// src/lib/pages/SummaryPage.jsx
import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

function useMaybeI18n() {
  try {
    const { useI18n } = require("../../i18n");
    return useI18n();
  } catch {
    return { t: (s) => s };
  }
}

export default function SummaryPage() {
  const { t } = useMaybeI18n();
  const { slug } = useParams();
  const navigate = useNavigate();

  const [game, setGame] = React.useState(null);
  const [homeTeam, setHomeTeam] = React.useState(null);
  const [awayTeam, setAwayTeam] = React.useState(null);
  const [lineupHome, setLineupHome] = React.useState([]);
  const [lineupAway, setLineupAway] = React.useState([]);
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      // Accept either slug or numeric id
      const isId = /^\d+$/.test(slug);
      const gameQuery = isId
        ? supabase.from("games").select("*").eq("id", Number(slug)).single()
        : supabase.from("games").select("*").eq("slug", slug).single();

      const { data: g, error: ge } = await gameQuery;
      if (ge || !g) {
        if (!cancelled) {
          setLoading(false);
          setGame(null);
        }
        return;
      }

      const [{ data: home }, { data: away }] = await Promise.all([
        supabase.from("teams").select("*").eq("id", g.home_team_id).single(),
        supabase.from("teams").select("*").eq("id", g.away_team_id).single(),
      ]);

      // roster and events by game_id
      const [
        { data: rosterRows, error: rErr },
        { data: eventRows, error: eErr },
      ] = await Promise.all([
        supabase
          .from("game_rosters")
          .select(
            `
            player_id,
            team_id,
            players!inner(id, name, number, position, team_id)
          `
          )
          .eq("game_id", g.id),
        supabase
          .from("events")
          .select(
            `
            id,
            period,
            time_mmss,
            team_id,
            type,
            player_id,
            assist1_id,
            assist2_id,
            players:player_id ( id, name, number ),
            a1:assist1_id ( id, name, number ),
            a2:assist2_id ( id, name, number )
          `
          )
          .eq("game_id", g.id)
          .order("period", { ascending: true })
          .order("time_mmss", { ascending: false }),
      ]);

      if (!cancelled) {
        setGame(g);
        setHomeTeam(home || null);
        setAwayTeam(away || null);

        if (!rErr && rosterRows) {
          const byTeam = rosterRows.reduce(
            (acc, r) => {
              const entry = {
                id: r.players.id,
                name: r.players.name,
                number: r.players.number,
                pos: r.players.position || "",
              };
              if (r.team_id === g.home_team_id) acc.home.push(entry);
              else if (r.team_id === g.away_team_id) acc.away.push(entry);
              return acc;
            },
            { home: [], away: [] }
          );
          byTeam.home.sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
          byTeam.away.sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
          setLineupHome(byTeam.home);
          setLineupAway(byTeam.away);
        } else {
          setLineupHome([]);
          setLineupAway([]);
        }

        if (!eErr && eventRows) {
          setEvents(eventRows);
        } else {
          setEvents([]);
        }

        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) return <div style={{ padding: 16 }}>{t("Loading…")}</div>;
  if (!game) return <div style={{ padding: 16 }}>{t("Game not found.")}</div>;

  const title = `${awayTeam?.name || "—"} @ ${homeTeam?.name || "—"}`;
  const dateStr = game.game_date ? new Date(game.game_date).toLocaleString() : "";

  return (
    <div style={{ padding: 16, maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 12 }}>
        <button onClick={() => navigate("/games")}>{t("Back to Games")}</button>
      </div>

      <h2 style={{ textAlign: "center", margin: "6px 0" }}>{title}</h2>
      <div style={{ textAlign: "center", color: "#666", marginBottom: 16 }}>
        {String(game.status).toUpperCase()} • {dateStr}
      </div>

      {/* lineups */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <LineupCard team={awayTeam} lineup={lineupAway} />
        <LineupCard team={homeTeam} lineup={lineupHome} />
      </div>

      {/* goals */}
      <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>{t("Goals / Events")}</h3>
        {events.length === 0 ? (
          <div style={{ color: "#777" }}>{t("No events yet.")}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>{t("PERIOD")}</Th>
                <Th>{t("TIME")}</Th>
                <Th>{t("TEAM")}</Th>
                <Th>{t("TYPE")}</Th>
                <Th>{t("PLAYER / ASSISTS")}</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <Td>{e.period}</Td>
                  <Td>{e.time_mmss}</Td>
                  <Td>{e.team_id === homeTeam?.id ? homeTeam?.short_name || "HOME" : awayTeam?.short_name || "AWAY"}</Td>
                  <Td>{e.type}</Td>
                  <Td>
                    <b>
                      #{e.players?.number ?? "—"} {e.players?.name ?? "—"}
                    </b>
                    {e.a1?.id || e.a2?.id ? (
                      <span style={{ color: "#666" }}>
                        {" "}
                        (A:{" "}
                        {[e.a1, e.a2]
                          .filter(Boolean)
                          .map((p) => `#${p.number ?? "—"} ${p.name ?? "—"}`)
                          .join(", ")}
                        )
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function LineupCard({ team, lineup }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, minHeight: 160 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        {team?.logo_url ? (
          <img
            src={team.logo_url}
            alt={team.short_name || team.name || "logo"}
            style={{ width: 140, height: 70, objectFit: "contain" }}
          />
        ) : null}
        <h3 style={{ margin: 0 }}>{team?.name || "—"}</h3>
      </div>
      {lineup.length === 0 ? (
        <div style={{ color: "#777" }}>No lineup recorded.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th style={{ width: 60 }}>#</Th>
              <Th>{`PLAYER`}</Th>
              <Th style={{ width: 80 }}>{`POS`}</Th>
            </tr>
          </thead>
          <tbody>
            {lineup.map((p) => (
              <tr key={p.id}>
                <Td> {p.number ?? "—"} </Td>
                <Td> {p.name} </Td>
                <Td> {p.pos || ""} </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const Th = (props) => (
  <th
    {...props}
    style={{
      textAlign: "left",
      padding: "8px 10px",
      borderBottom: "1px solid #eee",
      fontWeight: 600,
      fontSize: 13,
      ...props.style,
    }}
  />
);
const Td = (props) => (
  <td
    {...props}
    style={{
      padding: "8px 10px",
      borderBottom: "1px solid #f2f2f2",
      fontSize: 13,
      ...props.style,
    }}
  />
);
