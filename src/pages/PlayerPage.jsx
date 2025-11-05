// src/pages/PlayerPage.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
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

export default function PlayerPage() {
  const { t } = useMaybeI18n();
  const { id } = useParams();
  const pid = Number(id);

  const [player, setPlayer] = React.useState(null);
  const [team, setTeam] = React.useState(null);
  const [skaterStat, setSkaterStat] = React.useState(null);
  const [goalieStat, setGoalieStat] = React.useState(null);
  const [gameLog, setGameLog] = React.useState([]);
  const [goalieLog, setGoalieLog] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // Player
      const { data: pRow, error: e1 } = await supabase
        .from("players")
        .select("id, name, number, position, team_id")
        .eq("id", pid)
        .single();
      if (e1 || !pRow) { setLoading(false); return; }

      // Team
      const { data: tRow } = await supabase
        .from("teams")
        .select("id, name, short_name, logo_url")
        .eq("id", pRow.team_id)
        .maybeSingle();

      // Season stats (views)
      const { data: sk } = await supabase
        .from("player_stats_current")
        .select("player_id, gp, g, a, pts, team")
        .eq("player_id", pid)
        .maybeSingle();

      const { data: gs } = await supabase
        .from("goalie_stats_current")
        .select("player_id, sa, ga, sv_pct, gaa, toi_seconds, wins, losses, otl, so, team")
        .eq("player_id", pid)
        .maybeSingle();

      // Look up everything we need to build logs
      const [{ data: teams }, { data: games }] = await Promise.all([
        supabase.from("teams").select("id, name, short_name"),
        supabase
          .from("games")
          .select("id, game_date, home_team_id, away_team_id, slug, home_score, away_score"),
      ]);
      const tMap = new Map((teams || []).map((x) => [x.id, x]));
      const gMap = new Map((games || []).map((x) => [x.id, x]));

      // 1) All SKATER games = where the player was dressed in game_rosters
      const { data: rosterRows } = await supabase
        .from("game_rosters")
        .select("game_id, team_id, dressed")
        .eq("player_id", pid)
        .eq("dressed", true);

      // 2) Overlay points from events (so G/A still show up)
      const { data: evs } = await supabase
        .from("events")
        .select("game_id, event, player_id")
        .eq("player_id", pid);

      // Aggregate G/A per game from events
      const gaByGame = new Map();
      (evs || []).forEach((e) => {
        const row = gaByGame.get(e.game_id) || { g: 0, a: 0 };
        if (e.event === "goal") row.g++;
        if (e.event === "assist") row.a++;
        gaByGame.set(e.game_id, row);
      });

      // Build skater log using *all dressed games*, then overlay G/A from events
      const skLog = (rosterRows || [])
        .map((r) => {
          const gm = gMap.get(r.game_id);
          const date = gm?.game_date ? new Date(gm.game_date) : null;
          const home = tMap.get(gm?.home_team_id);
          const away = tMap.get(gm?.away_team_id);
          const ga = gaByGame.get(r.game_id) || { g: 0, a: 0 };
          return {
            game_id: r.game_id,
            date,
            slug: gm?.slug || r.game_id,
            home: home?.short_name || home?.name || "",
            away: away?.short_name || away?.name || "",
            g: ga.g,
            a: ga.a,
            hs: gm?.home_score ?? 0,
            as: gm?.away_score ?? 0,
          };
        })
        // If there are zero dressed rows (edge case), fall back to any event games so we still show something
        .concat(
          (rosterRows?.length ? [] : Array.from(gaByGame.keys())).map((gid) => {
            const gm = gMap.get(gid);
            const date = gm?.game_date ? new Date(gm.game_date) : null;
            const home = tMap.get(gm?.home_team_id);
            const away = tMap.get(gm?.away_team_id);
            const ga = gaByGame.get(gid) || { g: 0, a: 0 };
            return {
              game_id: gid,
              date,
              slug: gm?.slug || gid,
              home: home?.short_name || home?.name || "",
              away: away?.short_name || away?.name || "",
              g: ga.g,
              a: ga.a,
              hs: gm?.home_score ?? 0,
              as: gm?.away_score ?? 0,
            };
          })
        )
        // Sort newest → oldest
        .sort((a, b) => (b.date?.getTime?.() || 0) - (a.date?.getTime?.() || 0));

      // Goalie game log stays the same (from game_goalies)
      const { data: gl } = await supabase
        .from("game_goalies")
        .select("game_id, team_id, shots_against, goals_against, minutes_seconds, decision, shutout")
        .eq("player_id", pid);

      const gLog = (gl || [])
        .map((r) => {
          const gm = gMap.get(r.game_id);
          const date = gm?.game_date ? new Date(gm.game_date) : null;
          const oppId =
            r.team_id === gm?.home_team_id ? gm?.away_team_id : gm?.home_team_id;
          const opp = tMap.get(oppId);
          return {
            game_id: r.game_id,
            date,
            slug: gm?.slug || r.game_id,
            opponent: opp?.short_name || opp?.name || "",
            sa: r.shots_against ?? 0,
            ga: r.goals_against ?? 0,
            toi: r.minutes_seconds ?? 0,
            so: r.shutout ? 1 : 0,
            decision: r.decision || "",
          };
        })
        .sort((a, b) => (b.date?.getTime?.() || 0) - (a.date?.getTime?.() || 0));

      if (!cancelled) {
        setPlayer(pRow);
        setTeam(tRow || null);
        setSkaterStat(sk || null);
        setGoalieStat(gs || null);
        setGameLog(skLog);
        setGoalieLog(gLog);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [pid]);

  if (loading) return <div>{t("Loading…")}</div>;
  if (!player) return <div>{t("Player not found.")}</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Link to="/stats" style={{ textDecoration: "none" }}>
          ← {t("Back to Stats")}
        </Link>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>
          {team?.short_name || team?.name || ""}
        </div>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
        {team?.logo_url ? (
          <img
            src={team.logo_url}
            alt={team?.short_name || ""}
            style={{ width: 42, height: 42, objectFit: "contain" }}
          />
        ) : null}
        <div>
          <h2 style={{ margin: 0 }}>
            {player.number ? `#${player.number} ` : ""}
            {player.name}
          </h2>
          <div style={{ color: "#666" }}>{player.position || "-"}</div>
        </div>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 14,
        }}
      >
        <div style={cardS}>
          <div style={cardTitle}>{t("Skater (season)")}</div>
          {skaterStat ? (
            <table style={miniTbl}>
              <tbody>
                <SR label="GP" v={skaterStat.gp} />
                <SR label="G" v={skaterStat.g} />
                <SR label="A" v={skaterStat.a} />
                <SR label="P" v={skaterStat.pts} strong />
              </tbody>
            </table>
          ) : (
            <div style={{ color: "#777" }}>{t("No skater stats yet.")}</div>
          )}
        </div>

        <div style={cardS}>
          <div style={cardTitle}>{t("Goalie (season)")}</div>
          {goalieStat ? (
            <table style={miniTbl}>
              <tbody>
                <SR label="SA" v={goalieStat.sa ?? 0} />
                <SR label="GA" v={goalieStat.ga ?? 0} />
                <SR
                  label="SV%"
                  v={goalieStat.sv_pct != null ? `${goalieStat.sv_pct}%` : "—"}
                />
                <SR label="GAA" v={goalieStat.gaa != null ? goalieStat.gaa : "—"} />
                <SR label="TOI" v={fmtTOI(goalieStat.toi_seconds)} />
                <SR
                  label="W-L-OTL"
                  v={`${goalieStat.wins ?? 0}-${goalieStat.losses ?? 0}-${
                    goalieStat.otl ?? 0
                  }`}
                />
                <SR label="SO" v={goalieStat.so ?? 0} />
              </tbody>
            </table>
          ) : (
            <div style={{ color: "#777" }}>{t("No goalie stats yet.")}</div>
          )}
        </div>
      </div>

      {/* Skater game log */}
      <section style={{ marginTop: 16 }}>
        <h3 style={{ margin: "8px 0" }}>{t("Game log (Skater)")}</h3>
        <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
          <table style={logTbl}>
            <thead style={theadS}>
              <tr>
                <th style={thS}>{t("Date")}</th>
                <th style={thS}>{t("Matchup")}</th>
                <th style={thS}>G</th>
                <th style={thS}>A</th>
                <th style={thS}>{t("Score")}</th>
                <th style={thS}>{t("Boxscore")}</th>
              </tr>
            </thead>
            <tbody>
              {gameLog.length === 0 ? (
                <tr>
                  <td style={tdS} colSpan={6}>
                    {t("No games yet.")}
                  </td>
                </tr>
              ) : (
                gameLog.map((r) => (
                  <tr key={`sk-${r.game_id}`}>
                    <td style={tdS}>{r.date ? r.date.toLocaleDateString() : "—"}</td>
                    <td style={tdS}>
                      {r.away} @ {r.home}
                    </td>
                    <td style={tdS}>{r.g}</td>
                    <td style={tdS}>{r.a}</td>
                    <td style={tdS}>
                      {r.hs}–{r.as}
                    </td>
                    <td style={tdS}>
                      <Link to={`/games/${r.slug}/boxscore`}>{t("View")}</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Goalie game log */}
      <section style={{ marginTop: 16 }}>
        <h3 style={{ margin: "8px 0" }}>{t("Game log (Goalie)")}</h3>
        <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
          <table style={logTbl}>
            <thead style={theadS}>
              <tr>
                <th style={thS}>{t("Date")}</th>
                <th style={thS}>{t("Opponent")}</th>
                <th style={thS}>SA</th>
                <th style={thS}>GA</th>
                <th style={thS}>{t("SV%")}</th>
                <th style={thS}>{t("TOI")}</th>
                <th style={thS}>{t("Decision")}</th>
                <th style={thS}>SO</th>
                <th style={thS}>{t("Boxscore")}</th>
              </tr>
            </thead>
            <tbody>
              {goalieLog.length === 0 ? (
                <tr>
                  <td style={tdS} colSpan={9}>
                    {t("No goalie games yet.")}
                  </td>
                </tr>
              ) : (
                goalieLog.map((r) => {
                  const svpct =
                    r.sa > 0 ? `${Math.round((1 - r.ga / r.sa) * 1000) / 10}%` : "—";
                  return (
                    <tr key={`gl-${r.game_id}`}>
                      <td style={tdS}>{r.date ? r.date.toLocaleDateString() : "—"}</td>
                      <td style={tdS}>{r.opponent || "—"}</td>
                      <td style={tdS}>{r.sa}</td>
                      <td style={tdS}>{r.ga}</td>
                      <td style={tdS}>{svpct}</td>
                      <td style={tdS}>{fmtTOI(r.toi)}</td>
                      <td style={tdS}>{r.decision || "—"}</td>
                      <td style={tdS}>{r.so ? 1 : 0}</td>
                      <td style={tdS}>
                        <Link to={`/games/${r.slug}/boxscore`}>{t("View")}</Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SR({ label, v, strong }) {
  return (
    <tr>
      <td style={{ padding: "6px 8px", color: "#666" }}>{label}</td>
      <td
        style={{
          padding: "6px 8px",
          textAlign: "right",
          fontWeight: strong ? 700 : 500,
        }}
      >
        {v ?? "—"}
      </td>
    </tr>
  );
}

function fmtTOI(sec) {
  const s = Number(sec || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const cardS = { border: "1px solid #eee", borderRadius: 10, padding: 12 };
const cardTitle = { fontWeight: 700, marginBottom: 6 };
const miniTbl = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const logTbl = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const theadS = { background: "var(--table-head, #f4f5f8)" };
const thS = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #eee",
  whiteSpace: "nowrap",
};
const tdS = {
  padding: "10px 12px",
  borderBottom: "1px solid #f3f3f3",
  whiteSpace: "nowrap",
};
