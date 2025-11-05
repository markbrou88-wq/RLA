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

  const [loading, setLoading] = React.useState(true);
  const [game, setGame] = React.useState(null);

  const [homeTeam, setHomeTeam] = React.useState(null);
  const [awayTeam, setAwayTeam] = React.useState(null);

  const [homeRecord, setHomeRecord] = React.useState(null);
  const [awayRecord, setAwayRecord] = React.useState(null);

  const [lineupHome, setLineupHome] = React.useState({ skaters: [], goalies: [] });
  const [lineupAway, setLineupAway] = React.useState({ skaters: [], goalies: [] });

  const [homeGoalieRec, setHomeGoalieRec] = React.useState(null);
  const [awayGoalieRec, setAwayGoalieRec] = React.useState(null);

  const [events, setEvents] = React.useState([]);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      // Accept either numeric id or slug
      const isId = /^\d+$/.test(slug);
      const gameQuery = isId
        ? supabase.from("games").select("*").eq("id", Number(slug)).single()
        : supabase.from("games").select("*").eq("slug", slug).single();

      const { data: g, error: ge } = await gameQuery;
      if (ge || !g) {
        if (!cancelled) {
          setGame(null);
          setLoading(false);
        }
        return;
      }

      // Teams
      const [{ data: home }, { data: away }] = await Promise.all([
        supabase.from("teams").select("*").eq("id", g.home_team_id).single(),
        supabase.from("teams").select("*").eq("id", g.away_team_id).single(),
      ]);

      // Records (best-effort) from standings_current
      const [{ data: recHome }, { data: recAway }] = await Promise.all([
        supabase.from("standings_current").select("*").eq("team_id", g.home_team_id).maybeSingle(),
        supabase.from("standings_current").select("*").eq("team_id", g.away_team_id).maybeSingle(),
      ]);

      // Lineups (from game_rosters)
      const { data: rosterRows } = await supabase
        .from("game_rosters")
        .select(
          `
          player_id,
          team_id,
          players!inner(id, name, number, position, team_id)
        `
        )
        .eq("game_id", g.id);

      const split = (rows, teamId) => {
        const entries = (rows || [])
          .filter((r) => r.team_id === teamId)
          .map((r) => ({
            id: r.players.id,
            name: r.players.name,
            number: r.players.number,
            pos: r.players.position || "",
          }))
          .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
        const goalies = entries.filter((p) => (p.pos || "").toUpperCase() === "G");
        const skaters = entries.filter((p) => (p.pos || "").toUpperCase() !== "G");
        return { skaters, goalies };
      };

      const homeLU = split(rosterRows, g.home_team_id);
      const awayLU = split(rosterRows, g.away_team_id);

      // Goalie record (best-effort) from goalie_stats_current
      const getGoalieRec = async (goalie) => {
        if (!goalie) return null;
        const { data } = await supabase
          .from("goalie_stats_current")
          .select("*")
          .eq("player_id", goalie.id)
          .maybeSingle();

        if (!data) return null;
        const w = data.w ?? data.wins ?? data.W ?? null;
        const l = data.l ?? data.losses ?? data.L ?? null;
        const ot = data.otl ?? data.overtime_losses ?? data.OTL ?? data.t ?? null;
        const so = data.so ?? data.shutouts ?? data.SO ?? null;
        return { w, l, ot, so };
      };

      const [homeGoalieRecData, awayGoalieRecData] = await Promise.all([
        getGoalieRec(homeLU.goalies[0]),
        getGoalieRec(awayLU.goalies[0]),
      ]);

      // ----- Events (robust, no joins) -----
      // Pull events for this game, then enrich with player names/numbers via a single IN() query
      const { data: rawEvents } = await supabase
        .from("events")
        .select("id, period, time_mmss, team_id, event, player_id, assist1_id, assist2_id")
        .eq("game_id", g.id)
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: true });

      let enriched = [];
      if (rawEvents && rawEvents.length) {
        const ids = [
          ...new Set(
            rawEvents.flatMap((e) => [e.player_id, e.assist1_id, e.assist2_id].filter(Boolean))
          ),
        ];
        let byId = {};
        if (ids.length) {
          const { data: ps } = await supabase
            .from("players")
            .select("id, name, number")
            .in("id", ids);
          (ps || []).forEach((p) => (byId[p.id] = p));
        }
        enriched = rawEvents.map((e) => ({
          ...e,
          scorer: byId[e.player_id] || null,
          a1: byId[e.assist1_id] || null,
          a2: byId[e.assist2_id] || null,
        }));
      }
      // --------------------------------------

      if (!cancelled) {
        setGame(g);
        setHomeTeam(home || null);
        setAwayTeam(away || null);
        setHomeRecord(recHome || null);
        setAwayRecord(recAway || null);

        setLineupHome(homeLU);
        setLineupAway(awayLU);

        setHomeGoalieRec(homeGoalieRecData);
        setAwayGoalieRec(awayGoalieRecData);

        setEvents(enriched || []);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) return <div style={{ padding: 16 }}>{t("Loading…")}</div>;
  if (!game) return <div style={{ padding: 16 }}>{t("Game not found.")}</div>;

  const dateStr = game.game_date ? new Date(game.game_date).toLocaleString() : "";
  const scoreline = `${awayTeam?.short_name || awayTeam?.name || "—"} ${
    game.away_score ?? "—"
  }  —  ${game.home_score ?? "—"} ${homeTeam?.short_name || homeTeam?.name || "—"}`;

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 12 }}>
        <button onClick={() => navigate("/games")}>{t("Back to Games")}</button>
      </div>

      <h2 style={{ textAlign: "center", margin: "6px 0" }}>
        {(awayTeam?.name || "—")} @ {(homeTeam?.name || "—")}
      </h2>
      <div style={{ textAlign: "center", color: "#666", margin: "4px 0" }}>
        {String(game.status || "").toUpperCase()} • {dateStr}
      </div>
      <div style={{ textAlign: "center", fontWeight: 700, marginBottom: 16 }}>{scoreline}</div>

      {/* Lineups side by side: Away (left) – Home (right) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <LineupCard team={awayTeam} record={awayRecord} lineup={lineupAway} goalieRec={awayGoalieRec} />
        <LineupCard
          team={homeTeam}
          record={homeRecord}
          lineup={lineupHome}
          goalieRec={homeGoalieRec}
          alignRight
        />
      </div>

      {/* Goals / Events */}
      <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>{t("Goals / Events")}</h3>
        {events.length === 0 ? (
          <div style={{ color: "#777" }}>{t("No events yet.")}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>{t("PER")}</Th>
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
                  <Td>
                    {e.team_id === homeTeam?.id
                      ? homeTeam?.short_name || homeTeam?.name || "HOME"
                      : awayTeam?.short_name || awayTeam?.name || "AWAY"}
                  </Td>
                  <Td>{(e.event || e.type || "").toUpperCase()}</Td>
                  <Td>
                    <b>
                      {e.scorer?.id ? (
                        <Link to={`/players/${e.scorer.id}`}>
                          #{e.scorer.number ?? "—"} {e.scorer.name ?? "—"}
                        </Link>
                      ) : (
                        <>#{e.scorer?.number ?? "—"} {e.scorer?.name ?? "—"}</>
                      )}
                    </b>
                    {(e.a1 || e.a2) && (
                      <span style={{ color: "#666" }}>
                        {" "}
                        (A:&nbsp;
                        {[
                          e.a1 &&
                            (e.a1.id ? (
                              <Link key="a1" to={`/players/${e.a1.id}`}>
                                #{e.a1.number ?? "—"} {e.a1.name ?? "—"}
                              </Link>
                            ) : (
                              `#${e.a1?.number ?? "—"} ${e.a1?.name ?? "—"}`
                            )),
                          e.a2 &&
                            (e.a2.id ? (
                              <Link key="a2" to={`/players/${e.a2.id}`}>
                                #{e.a2.number ?? "—"} {e.a2.name ?? "—"}
                              </Link>
                            ) : (
                              `#${e.a2?.number ?? "—"} ${e.a2?.name ?? "—"}`
                            )),
                        ]
                          .filter(Boolean)
                          .reduce((acc, node, i) => (i ? [...acc, ", ", node] : [node]), [])}
                        )
                      </span>
                    )}
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

function LineupCard({ team, record, lineup, goalieRec, alignRight = false }) {
  // Record as W-L-OTL (best-effort)
  const recText =
    record && (record.w !== undefined || record.l !== undefined || record.otl !== undefined)
      ? `• ${record.w ?? 0} W • ${record.l ?? 0} L • ${record.otl ?? 0} OTL`
      : null;

  // Put the logo on the **outside** edge:
  // away card => logo left; home card (alignRight) => logo right
  const direction = alignRight ? "row-reverse" : "row";

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, minHeight: 160 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 10,
          justifyContent: alignRight ? "flex-end" : "flex-start",
          flexDirection: direction,
        }}
      >
        {team?.logo_url ? (
          <img
            src={team.logo_url}
            alt={team.short_name || team.name || "logo"}
            style={{ width: 140, height: 70, objectFit: "contain" }}
          />
        ) : null}
        <div style={{ textAlign: alignRight ? "right" : "left" }}>
          <h3 style={{ margin: 0 }}>{team?.name || "—"}</h3>
          {recText && <div style={{ fontSize: 12, color: "#666" }}>{recText}</div>}
        </div>
      </div>

      {/* Roster table */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th style={{ width: 60 }}>#</Th>
            <Th>{`PLAYER`}</Th>
            <Th style={{ width: 80 }}>{`POS`}</Th>
          </tr>
        </thead>
        <tbody>
          {lineup.skaters.length === 0 && lineup.goalies.length === 0 ? (
            <tr>
              <Td colSpan={3} style={{ color: "#777" }}>
                No lineup recorded.
              </Td>
            </tr>
          ) : (
            <>
              {lineup.skaters.map((p) => (
                <RosterRow key={`s-${p.id}`} p={p} />
              ))}

              {lineup.goalies.length > 0 && (
                <tr>
                  <Td colSpan={3} style={{ padding: 6, borderBottom: "1px solid #f2f2f2" }} />
                </tr>
              )}

              {lineup.goalies.map((p, idx) => (
                <RosterRow
                  key={`g-${p.id}`}
                  p={p}
                  goalieRec={idx === 0 ? goalieRec : null /* show record on first goalie only */}
                />
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RosterRow({ p, goalieRec }) {
  return (
    <tr>
      <Td>{p.number ?? "—"}</Td>
      <Td>
        <Link to={`/players/${p.id}`}>{p.name}</Link>
        {goalieRec && (
          <span style={{ color: "#666", marginLeft: 8, fontSize: 12 }}>
            {[
              goalieRec.w != null ? `${goalieRec.w} W` : null,
              goalieRec.l != null ? `${goalieRec.l} L` : null,
              goalieRec.ot != null ? `${goalieRec.ot} OTL` : null,
              goalieRec.so != null ? `${goalieRec.so} SO` : null,
            ]
              .filter(Boolean)
              .join(" • ")}
          </span>
        )}
      </Td>
      <Td>{p.pos || ""}</Td>
    </tr>
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
      verticalAlign: "top",
      ...props.style,
    }}
  />
);
