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

  const [rows, setRows] = React.useState([]); // grouped events for display

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

      // ----- Events (same grouping model as LivePage) -----
      const { data: ev } = await supabase
        .from("events")
        .select(`
          id, game_id, team_id, player_id, period, time_mmss, event,
          players!events_player_id_fkey ( id, name, number ),
          teams!events_team_id_fkey ( id, name, short_name )
        `)
        .eq("game_id", g.id)
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: false });

      const key = (e) => `${e.period}|${e.time_mmss}|${e.team_id}|goal`;
      const gmap = new Map();
      (ev || []).forEach((e) => {
        if (e.event === "goal") gmap.set(key(e), { goal: e, assists: [] });
      });
      (ev || []).forEach((e) => {
        if (e.event === "assist" && gmap.has(key(e))) gmap.get(key(e)).assists.push(e);
      });
      const others = (ev || [])
        .filter((e) => e.event !== "goal" && e.event !== "assist")
        .map((x) => ({ single: x }));
      const grouped = [...gmap.values(), ...(others || [])].sort((a, b) => {
        const ap = a.goal ? a.goal.period : a.single.period;
        const bp = b.goal ? b.goal.period : b.single.period;
        if (ap !== bp) return ap - bp;
        const at = a.goal ? a.goal.time_mmss : a.single.time_mmss;
        const bt = b.goal ? b.goal.time_mmss : b.single.time_mmss;
        return bt.localeCompare(at);
      });

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

        setRows(grouped || []);
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

      {/* Lineups side by side: Away (left) – Home (right, logo on the outside edge) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <LineupCard team={awayTeam} record={awayRecord} lineup={lineupAway} goalieRec={awayGoalieRec} />
        <LineupCard team={homeTeam} record={homeRecord} lineup={lineupHome} goalieRec={homeGoalieRec} alignRight />
      </div>

      {/* Goals / Events (from grouped rows) */}
      <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>{t("Goals / Events")}</h3>
        {rows.length === 0 ? (
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
              {rows.map((r, i) => {
                if (r.goal) {
                  const aTxt = r.assists
                    .map((a) =>
                      a.players?.id ? (
                        <Link key={`a${a.id}`} to={`/players/${a.players.id}`}>
                          #{a.players.number ?? "—"} {a.players.name ?? "—"}
                        </Link>
                      ) : (
                        `#${a.players?.number ?? "—"} ${a.players?.name ?? "—"}`
                      )
                    )
                    .reduce((acc, node, idx) => (idx ? [...acc, ", ", node] : [node]), []);
                  const teamLabel = r.goal.teams?.short_name || r.goal.teams?.name || "";
                  return (
                    <tr key={`g${i}`}>
                      <Td>{r.goal.period}</Td>
                      <Td>{r.goal.time_mmss}</Td>
                      <Td>{teamLabel}</Td>
                      <Td>GOAL</Td>
                      <Td>
                        <b>
                          {r.goal.players?.id ? (
                            <Link to={`/players/${r.goal.players.id}`}>
                              #{r.goal.players.number ?? "—"} {r.goal.players.name ?? "—"}
                            </Link>
                          ) : (
                            <>#{r.goal.players?.number ?? "—"} {r.goal.players?.name ?? "—"}</>
                          )}
                        </b>
                        {aTxt && <span style={{ color: "#666" }}> (A: {aTxt})</span>}
                      </Td>
                    </tr>
                  );
                }
                const e = r.single;
                const teamLabel = e.teams?.short_name || e.teams?.name || "";
                return (
                  <tr key={`o${e.id}`}>
                    <Td>{e.period}</Td>
                    <Td>{e.time_mmss}</Td>
                    <Td>{teamLabel}</Td>
                    <Td>{String(e.event || "").toUpperCase()}</Td>
                    <Td>
                      {e.players?.id ? (
                        <Link to={`/players/${e.players.id}`}>
                          #{e.players.number ?? "—"} {e.players.name ?? "—"}
                        </Link>
                      ) : (
                        <>#{e.players?.number ?? "—"} {e.players?.name ?? "—"}</>
                      )}
                    </Td>
                  </tr>
                );
              })}
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
