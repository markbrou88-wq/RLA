// src/pages/PlayerPage.jsx
import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

// Safe i18n fallback if you don't use it
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
  const navigate = useNavigate();

  const pid = Number(id);

  const [player, setPlayer] = React.useState(null);
  const [team, setTeam] = React.useState(null);
  const [skaterStat, setSkaterStat] = React.useState(null);
  const [goalieStat, setGoalieStat] = React.useState(null);
  const [gameLog, setGameLog] = React.useState([]);       // skater log (goals/assists by game)
  const [goalieLog, setGoalieLog] = React.useState([]);   // goalie log per game
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1) Player + team
      const [{ data: pRow, error: e1 }, { data: tRow, error: e2 }] = await Promise.all([
        supabase.from("players").select("id, name, number, position, team_id").eq("id", pid).single(),
        supabase.from("teams").select("id, name, short_name, logo_url").order("name"),
      ]);
      if (e1) { console.error(e1); setLoading(false); return; }
      if (e2) { console.error(e2); setLoading(false); return; }

      const tMap = new Map((tRow || []).map((x) => [x.id, x]));
      const teamObj = tMap.get(pRow.team_id) || null;

      // 2) Skater season stat (view)
      const { data: skater, error: e3 } = await supabase
        .from("player_stats_current")
        .select("player_id, gp, g, a, pts, team")
        .eq("player_id", pid)
        .maybeSingle();
      if (e3) { console.error(e3); }

      // 3) Goalie season stat (view)
      const { data: gstat, error: e4 } = await supabase
        .from("goalie_stats_current")
        .select("player_id, team, sa, ga, sv_pct, gaa, toi_seconds, wins, losses, otl, so")
        .eq("player_id", pid)
        .maybeSingle();
      if (e4) { console.error(e4); }

      // 4) Skater game log (aggregate goals/assists for the player per game)
      //    Joins games to show opponent/date
      const { data: eventsAgg, error: e5 } = await supabase
        .rpc("player_game_log", { p_player_id: pid }); // optional RPC (see fallback below)
      let gameLogRows = eventsAgg;

      // Fallback if RPC isn't installed: do it client-side (OK for small leagues)
      if (e5 || !Array.isArray(gameLogRows)) {
        const { data: evs, error: e6 } = await supabase
          .from("events")
          .select("game_id, event, player_id")
          .eq("player_id", pid);
        if (e6) { console.error(e6); }

        const { data: gms, error: e7 } = await supabase
          .from("games")
          .select("id, game_date, home_team_id, away_team_id, home_score, away_score, slug");
        if (e7) { console.error(e7); }

        const teamMap = Object.fromEntries((tRow || []).map((x) => [x.id, x]));
        const gmMap = Object.fromEntries((gms || []).map((x) => [x.id, x]));

        const byGame = new Map();
        (evs || []).forEach((e) => {
          const item = byGame.get(e.game_id) || { game_id: e.game_id, g: 0, a: 0 };
          if (e.event === "goal") item.g += 1;
          if (e.event === "assist") item.a += 1;
          byGame.set(e.game_id, item);
        });

        gameLogRows = Array.from(byGame.values()).map((row) => {
          const g = gmMap[row.game_id];
          const date = g?.game_date ? new Date(g.game_date) : null;
          const home = teamMap[g?.home_team_id];
          const away = teamMap[g?.away_team_id];
          return {
            game_id: row.game_id,
            date,
            home_name: home?.short_name || home?.name || "",
            away_name: away?.short_name || away?.name || "",
            g: row.g,
            a: row.a,
            slug: g?.slug || g?.id,
            home_score: g?.home_score ?? 0,
            away_score: g?.away_score ?? 0,
          };
        }).sort((a, b) => (b.date?.getTime?.() || 0) - (a.date?.getTime?.() || 0));
      }

      // 5) Goalie game log
      const { data: glog, error: e8 } = await supabase
        .from("game_goalies")
        .select("game_id, team_id, shots_against, goals_against, minutes_seconds, decision, shutout")
        .eq("player_id", pid);
      let goalieLogRows = [];
      if (!e8 && Array.isArray(glog)) {
        const { data: gms2 } = await supabase
          .from("games")
          .select("id, game_date, home_team_id, away_team_id, slug, home_score, away_score");
        const tMap2 = new Map((tRow || []).map((x) => [x.id, x]));
        const gMap2 = new Map((gms2 || []).map((x) => [x.id, x]));
        goalieLogRows = glog.map((r) => {
          const gm = gMap2.get(r.game_id);
          const d = gm?.game_date ? new Date(gm.game_date) : null;
          return {
            game_id: r.game_id,
            date: d,
            slug: gm?.slug || gm?.id,
            sa: r.shots_against ?? 0,
            ga: r.goals_against ?? 0,
            toi_seconds: r.minutes_seconds ?? 0,
            decision: r.decision || "",
            so: r.shutout ? 1 : 0,
            home_score: gm?.home_score ?? 0,
            away_score: gm?.away_score ?? 0,
            opponent:
              r.team_id === gm?.home_team_id
                ? tMap2.get(gm?.away_team_id)?.short_name || tMap2.get(gm?.away_team_id)?.name
                : tMap2.get(gm?.home_team_id)?.short_name || tMap2.get(gm?.home_team_id)?.name,
          };
        }).sort((a, b) => (b.date?.getTime?.() || 0) - (a.date?.getTime?.() || 0));
      }

      if (!cancelled) {
        setPlayer(pRow);
        setTeam(teamObj);
        setSkaterStat(skater || null);
        setGoalieStat(gstat || null);
        setGameLog(gameLogRows || []);
        setGoalieLog(goalieLogRows || []);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [pid]);

  if (loading) return <div>{t("Loading…")}</div>;
  if (!player) return <div>{t("Player not found.")}</div>;

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      {team?.logo_url ? (
        <img src={team.logo_url} alt={team?.short_name || ""} style={{ width: 42, height: 42, objectFit: "contain" }} />
      ) : null}
      <div>
        <h2 style={{ margin: "0 0 4px" }}>
          {player.number ? `#${player.number} ` : ""}
          {player.name}
        </h2>
        <div style={{ color: "#666" }}>
          {player.position || "-"} •{" "}
          {team ? (
            <Link to={`/teams/${team.id}`} style={{ textDecoration: "none" }}>
              {team.short_name || team.name}
            </Link>
          ) : (
            "-"
          )}
        </div>
      </div>
      <div style={{ marginLeft: "auto" }}>
        <button onClick={() => navigate(-1)}>{t("Back")}</button>
      </div>
    </div>
  );

  return (
    <div>
      {header}

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 16 }}>
        {/* Skater summary */}
        <div style={cardS}>
          <div style={cardTitleS}>{t("Skater this season")}</div>
          {skaterStat ? (
            <table style={miniTableS}>
              <tbody>
                <StatRow label="GP" value={skaterStat.gp} />
                <StatRow label="G" value={skaterStat.g} />
                <StatRow label="A" value={skaterStat.a} />
                <StatRow label="P" value={skaterStat.pts} strong />
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 8, color: "#777" }}>{t("No skater stats yet.")}</div>
          )}
        </div>

        {/* Goalie summary */}
        <div style={cardS}>
          <div style={cardTitleS}>{t("Goalie this season")}</div>
          {goalieStat ? (
            <table style={miniTableS}>
              <tbody>
                <StatRow label="SA" value={goalieStat.sa} />
                <StatRow label="GA" value={goalieStat.ga} />
                <StatRow label="SV%" value={goalieStat.sv_pct != null ? `${goalieStat.sv_pct}%` : "—"} />
                <StatRow label="GAA" value={goalieStat.gaa != null ? goalieStat.gaa : "—"} />
                <StatRow label="TOI" value={fmtTOI(goalieStat.toi_seconds)} />
                <StatRow label="W-L-OTL" value={`${goalieStat.wins ?? 0}-${goalieStat.losses ?? 0}-${goalieStat.otl ?? 0}`} />
                <StatRow label="SO" value={goalieStat.so ?? 0} />
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 8, color: "#777" }}>{t("No goalie stats yet.")}</div>
          )}
        </div>
      </div>

      {/* Skater game log */}
      <section style={{ marginTop: 20 }}>
        <h3 style={{ margin: "12px 0" }}>{t("Game log (Skater)")}</h3>
        <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
          <table style={logTableS}>
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
                <tr><td style={tdS} colSpan={6}>{t("No events yet.")}</td></tr>
              ) : gameLog.map((r) => (
                <tr key={`sklog-${r.game_id}`}>
                  <td style={tdS}>{r.date ? r.date.toLocaleDateString() : "—"}</td>
                  <td style={tdS}>{r.away_name} @ {r.home_name}</td>
                  <td style={tdS}>{r.g}</td>
                  <td style={tdS}>{r.a}</td>
                  <td style={tdS}>{r.home_score}–{r.away_score}</td>
                  <td style={tdS}>
                    <Link to={`/games/${r.slug}/boxscore`}>{t("View")}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Goalie game log */}
      <section style={{ marginTop: 20 }}>
        <h3 style={{ margin: "12px 0" }}>{t("Game log (Goalie)")}</h3>
        <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
          <table style={logTableS}>
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
                <tr><td style={tdS} colSpan={9}>{t("No goalie games yet.")}</td></tr>
              ) : goalieLog.map((r) => {
                  const svpct = r.sa > 0 ? `${Math.round((1 - r.ga / r.sa) * 1000) / 10}%` : "—";
                  return (
                    <tr key={`glog-${r.game_id}`}>
                      <td style={tdS}>{r.date ? r.date.toLocaleDateString() : "—"}</td>
                      <td style={tdS}>{r.opponent || "—"}</td>
                      <td style={tdS}>{r.sa}</td>
                      <td style={tdS}>{r.ga}</td>
                      <td style={tdS}>{svpct}</td>
                      <td style={tdS}>{fmtTOI(r.toi_seconds)}</td>
                      <td style={tdS}>{r.decision || "—"}</td>
                      <td style={tdS}>{r.so ? 1 : 0}</td>
                      <td style={tdS}>
                        <Link to={`/games/${r.slug}/boxscore`}>{t("View")}</Link>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatRow({ label, value, strong }) {
  return (
    <tr>
      <td style={{ padding: "6px 8px", color: "#666" }}>{label}</td>
      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: strong ? 700 : 500 }}>
        {value ?? "—"}
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
const cardTitleS = { fontWeight: 700, marginBottom: 6 };
const logTableS = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const theadS = { background: "var(--table-head, #f4f5f8)" };
const thS = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" };
const tdS = { padding: "10px 12px", borderBottom: "1px solid #f3f3f3", whiteSpace: "nowrap" };
