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

  // season cards
  const [skaterStat, setSkaterStat] = React.useState(null);
  const [goalieStat, setGoalieStat] = React.useState(null);

  // logs
  const [skaterLog, setSkaterLog] = React.useState([]);
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
      if (e1 || !pRow) {
        setLoading(false);
        return;
      }

      const isGoalie = String(pRow.position || "").trim().toUpperCase() === "G";

      // Team (for header)
      const { data: tRow } = await supabase
        .from("teams")
        .select("id, name, short_name, logo_url")
        .eq("id", pRow.team_id)
        .maybeSingle();

      // Season cards (views)
      const [{ data: sk }, { data: gs }] = await Promise.all([
        supabase
          .from("player_stats_current")
          .select("player_id, gp, g, a, pts, team")
          .eq("player_id", pid)
          .maybeSingle(),
        supabase
          .from("goalie_stats_current")
          .select(
            "player_id, sa, ga, sv_pct, gaa, toi_seconds, wins, losses, otl, so, team"
          )
          .eq("player_id", pid)
          .maybeSingle(),
      ]);

      // Look up teams and games once for both logs
      const [{ data: teams }, { data: games }] = await Promise.all([
        supabase.from("teams").select("id, name, short_name"),
        supabase
          .from("games")
          .select(
            "id, game_date, home_team_id, away_team_id, slug, home_score, away_score"
          ),
      ]);
      const tMap = new Map((teams || []).map((x) => [x.id, x]));
      const gMap = new Map((games || []).map((x) => [x.id, x]));

      // ---------- SKATER LOG (only if not G) ----------
      let builtSkaterLog = [];
      if (!isGoalie) {
        // All dressed games
        const { data: rosterRows } = await supabase
          .from("game_rosters")
          .select("game_id, team_id, dressed")
          .eq("player_id", pid)
          .eq("dressed", true);

        // Overlay G/A from events for this player
        const { data: evs } = await supabase
          .from("events")
          .select("game_id, event, player_id")
          .eq("player_id", pid);

        const gaByGame = new Map();
        (evs || []).forEach((e) => {
          const row = gaByGame.get(e.game_id) || { g: 0, a: 0 };
          if (e.event === "goal") row.g++;
          if (e.event === "assist") row.a++;
          gaByGame.set(e.game_id, row);
        });

        builtSkaterLog = (rosterRows || [])
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
          .sort((a, b) => (b.date?.getTime?.() || 0) - (a.date?.getTime?.() || 0));
      }

      // ---------- GOALIE LOG (roster-based, like skater) ----------
      let builtGoalieLog = [];
      // get dressed games for this player
      const { data: gRoster } = await supabase
        .from("game_rosters")
        .select("game_id, team_id, dressed")
        .eq("player_id", pid)
        .eq("dressed", true);

      // overlay per-game goalie numbers if they exist
      const { data: gStats } = await supabase
        .from("game_goalies")
        .select(
          "game_id, team_id, shots_against, goals_against, minutes_seconds, decision, shutout"
        )
        .eq("player_id", pid);

      const ggMap = new Map((gStats || []).map((r) => [r.game_id, r]));

      builtGoalieLog = (gRoster || [])
        .map((r) => {
          const gm = gMap.get(r.game_id);
          const overlay = ggMap.get(r.game_id);
          const date = gm?.game_date ? new Date(gm.game_date) : null;
          const oppId =
            r.team_id === gm?.home_team_id ? gm?.away_team_id : gm?.home_team_id;
          const opp = tMap.get(oppId);
          return {
            game_id: r.game_id,
            date,
            slug: gm?.slug || r.game_id,
            opponent: opp?.short_name || opp?.name || "",
            sa: overlay?.shots_against ?? 0,
            ga: overlay?.goals_against ?? 0,
            toi: overlay?.minutes_seconds ?? 0,
            decision: overlay?.decision || "",
            so: overlay?.shutout ? 1 : 0,
          };
        })
        .sort((a, b) => (b.date?.getTime?.() || 0) - (a.date?.getTime?.() || 0));

      if (!cancelled) {
        setPlayer(pRow);
        setTeam(tRow || null);
        setSkaterStat(sk || null);
        setGoalieStat(gs || null);
        setSkaterLog(builtSkaterLog);
        setGoalieLog(builtGoalieLog);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [pid]);

  if (loading) return <div>Loading…</div>;
  if (!player) return <div>Player not found.</div>;

  const isGoalie = String(player.position || "").trim().toUpperCase() === "G";

  return (
    <div>
      {/* back link, no short name at top-right */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Link to="/stats" style={{ textDecoration: "none" }}>
          ← Back to Stats
        </Link>
      </div>

      {/* Header: bigger logo, number+name then position on one line */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginTop: 10,
          flexWrap: "wrap",
        }}
      >
        {team?.logo_url ? (
          <img
            src={team.logo_url}
            alt={team?.short_name || team?.name || ""}
            style={{ width: 72, height: 72, objectFit: "contain" }}
          />
        ) : null}
        <h2 style={{ margin: 0, fontWeight: 700 }}>
          {player.number ? `#${player.number} ` : ""}
          {player.name}
          <span style={{ marginLeft: 10, color: "#666", fontWeight: 500 }}>
            {player.position || "-"}
          </span>
        </h2>
      </div>

      {/* Summary cards – show only the relevant one */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
          marginTop: 16,
        }}
      >
        {!isGoalie && (
          <div style={cardS}>
            <div style={cardTitle}>Skater (season)</div>
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
              <div style={{ color: "#777" }}>No skater stats yet.</div>
            )}
          </div>
        )}

        {isGoalie && (
          <div style={cardS}>
            <div style={cardTitle}>Goalie (season)</div>
            {goalieStat ? (
              <table style={miniTbl}>
                <tbody>
                  <SR label="SA" v={goalieStat.sa ?? 0} />
                  <SR label="GA" v={goalieStat.ga ?? 0} />
                  <SR
                    label="SV%"
                    v={
                      goalieStat.sv_pct != null ? `${goalieStat.sv_pct}%` : "—"
                    }
                  />
                  <SR
                    label="GAA"
                    v={goalieStat.gaa != null ? goalieStat.gaa : "—"}
                  />
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
              <div style={{ color: "#777" }}>No goalie stats yet.</div>
            )}
          </div>
        )}
      </div>

      {/* LOGS */}
      {!isGoalie && (
        <section style={{ marginTop: 18 }}>
          <h3 style={{ margin: "8px 0" }}>Game log (Skater)</h3>
          <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
            <table style={logTbl}>
              <thead style={theadS}>
                <tr>
                  <th style={thS}>Date</th>
                  <th style={thS}>Matchup</th>
                  <th style={thS}>G</th>
                  <th style={thS}>A</th>
                  <th style={thS}>Score</th>
                  <th style={thS}>Boxscore</th>
                </tr>
              </thead>
              <tbody>
                {skaterLog.length === 0 ? (
                  <tr>
                    <td style={tdS} colSpan={6}>
                      No games yet.
                    </td>
                  </tr>
                ) : (
                  skaterLog.map((r) => (
                    <tr key={`sk-${r.game_id}`}>
                      <td style={tdS}>
                        {r.date ? r.date.toLocaleDateString() : "—"}
                      </td>
                      <td style={tdS}>
                        {r.away} @ {r.home}
                      </td>
                      <td style={tdS}>{r.g}</td>
                      <td style={tdS}>{r.a}</td>
                      <td style={tdS}>
                        {r.hs}–{r.as}
                      </td>
                      <td style={tdS}>
                        <Link to={`/games/${r.slug}/boxscore`}>View</Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isGoalie && (
        <section style={{ marginTop: 18 }}>
          <h3 style={{ margin: "8px 0" }}>Game log (Goalie)</h3>
          <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
            <table style={logTbl}>
              <thead style={theadS}>
                <tr>
                  <th style={thS}>Date</th>
                  <th style={thS}>Opponent</th>
                  <th style={thS}>SA</th>
                  <th style={thS}>GA</th>
                  <th style={thS}>SV%</th>
                  <th style={thS}>TOI</th>
                  <th style={thS}>Decision</th>
                  <th style={thS}>SO</th>
                  <th style={thS}>Boxscore</th>
                </tr>
              </thead>
              <tbody>
                {goalieLog.length === 0 ? (
                  <tr>
                    <td style={tdS} colSpan={9}>
                      No goalie games yet.
                    </td>
                  </tr>
                ) : (
                  goalieLog.map((r) => {
                    const svpct =
                      r.sa > 0 ? `${Math.round((1 - r.ga / r.sa) * 1000) / 10}%` : "—";
                    return (
                      <tr key={`gl-${r.game_id}`}>
                        <td style={tdS}>
                          {r.date ? r.date.toLocaleDateString() : "—"}
                        </td>
                        <td style={tdS}>{r.opponent || "—"}</td>
                        <td style={tdS}>{r.sa}</td>
                        <td style={tdS}>{r.ga}</td>
                        <td style={tdS}>{svpct}</td>
                        <td style={tdS}>{fmtTOI(r.toi)}</td>
                        <td style={tdS}>{r.decision || "—"}</td>
                        <td style={tdS}>{r.so ? 1 : 0}</td>
                        <td style={tdS}>
                          <Link to={`/games/${r.slug}/boxscore`}>View</Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------- helpers & styles ---------- */
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
