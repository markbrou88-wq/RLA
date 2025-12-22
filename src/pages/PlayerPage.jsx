import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

function useMaybeI18n() {
  try {
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
  const [headerTeam, setHeaderTeam] = React.useState(null);
  const [headerNumber, setHeaderNumber] = React.useState(null);

  const [seasonStats, setSeasonStats] = React.useState([]);
  const [career, setCareer] = React.useState({ gp: 0, g: 0, a: 0, pts: 0 });

  const [skaterLog, setSkaterLog] = React.useState([]);
  const [goalieLog, setGoalieLog] = React.useState([]);

  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      /* ---------- PLAYER ---------- */
      const { data: pRow, error: e1 } = await supabase
        .from("players")
        .select("id, name, position")
        .eq("id", pid)
        .single();

      if (e1 || !pRow) {
        if (!cancelled) setLoading(false);
        return;
      }

      const isGoalie =
        String(pRow.position || "").trim().toUpperCase() === "G";

      /* ---------- LOOKUPS ---------- */
      const [{ data: seasons }, { data: cats }] = await Promise.all([
        supabase.from("seasons").select("id, name"),
        supabase.from("categories").select("id, name"),
      ]);

      const seasonMap = new Map((seasons || []).map((s) => [s.id, s.name]));
      const catMap = new Map((cats || []).map((c) => [c.id, c.name]));

      /* ---------- SEASON STATS ---------- */
      const { data: statRows } = await supabase
        .from("leaders_current")
        .select("season_id, category_id, team, gp, g, a, pts")
        .eq("player_id", pid)
        .order("season_id", { ascending: false })
        .order("category_id", { ascending: false });

      const stats =
        (statRows || []).map((r) => ({
          ...r,
          season_name: seasonMap.get(r.season_id) || r.season_id,
          category_name: catMap.get(r.category_id) || r.category_id,
        })) || [];

      const careerTotals = stats.reduce(
        (acc, r) => {
          acc.gp += r.gp || 0;
          acc.g += r.g || 0;
          acc.a += r.a || 0;
          acc.pts += r.pts || 0;
          return acc;
        },
        { gp: 0, g: 0, a: 0, pts: 0 }
      );

      /* ---------- HEADER TEAM + NUMBER ---------- */
      let teamRow = null;
      let jersey = null;

      if (stats.length > 0) {
        const latest = stats[0];

        const { data: tpRow } = await supabase
          .from("team_players")
          .select(
            "number, teams ( id, name, short_name, logo_url )"
          )
          .eq("player_id", pid)
          .eq("season_id", latest.season_id)
          .eq("category_id", latest.category_id)
          .maybeSingle();

        if (tpRow) {
          jersey = tpRow.number;
          teamRow = tpRow.teams || null;
        }
      }

      /* ---------- MAP TEAMS & GAMES ---------- */
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

      /* ---------- SKATER LOG ---------- */
      let builtSkaterLog = [];
      if (!isGoalie) {
        const { data: rosterRows } = await supabase
          .from("game_rosters")
          .select("game_id, team_id, dressed")
          .eq("player_id", pid)
          .eq("dressed", true);

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
          .sort(
            (a, b) =>
              (b.date?.getTime?.() || 0) -
              (a.date?.getTime?.() || 0)
          );
      }

      /* ---------- GOALIE LOG ---------- */
      let builtGoalieLog = [];
      const { data: gRoster } = await supabase
        .from("game_rosters")
        .select("game_id, team_id, dressed")
        .eq("player_id", pid)
        .eq("dressed", true);

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
            r.team_id === gm?.home_team_id
              ? gm?.away_team_id
              : gm?.home_team_id;
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
        .sort(
          (a, b) =>
            (b.date?.getTime?.() || 0) -
            (a.date?.getTime?.() || 0)
        );

      if (!cancelled) {
        setPlayer(pRow);
        setSeasonStats(stats);
        setCareer(careerTotals);
        setHeaderTeam(teamRow);
        setHeaderNumber(jersey);
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

  const isGoalie =
    String(player.position || "").trim().toUpperCase() === "G";

  return (
    <div className="player-page">
      <Link to="/stats" style={{ textDecoration: "none" }}>
        ← Back to Stats
      </Link>

      {/* Header Card */}
      <div style={headerCard}>
        {headerTeam?.logo_url && (
          <img
            src={headerTeam.logo_url}
            alt={headerTeam.short_name || headerTeam.name}
            style={{ width: 80, height: 80, objectFit: "contain" }}
          />
        )}
        <div>
          <h2 style={{ margin: 0 }}>
            {headerNumber ? `#${headerNumber} ` : ""}
            {player.name}
          </h2>
          <div style={{ color: "#666", marginTop: 4 }}>
            {player.position || "-"}{" "}
            {headerTeam?.name ? `• ${headerTeam.name}` : ""}
          </div>
        </div>
      </div>

      {/* Career Summary */}
      <section style={{ marginTop: 16 }}>
        <h3>Career Totals</h3>
        <div style={summaryRow}>
          <SummaryBox label="GP" value={career.gp} />
          <SummaryBox label="G" value={career.g} />
          <SummaryBox label="A" value={career.a} />
          <SummaryBox label="PTS" value={career.pts} />
        </div>
      </section>

      {/* Season Stats */}
      <section style={{ marginTop: 18 }}>
        <h3>Stats by season & category</h3>
        <div style={tblWrap}>
          <table style={logTbl}>
            <thead style={theadS}>
              <tr>
                <th style={thS}>Season</th>
                <th style={thS}>Category</th>
                <th style={thS}>Team</th>
                <th style={thS}>GP</th>
                <th style={thS}>G</th>
                <th style={thS}>A</th>
                <th style={thS}>PTS</th>
              </tr>
            </thead>
            <tbody>
              {seasonStats.length === 0 ? (
                <tr>
                  <td style={tdS} colSpan={7}>
                    No stats yet.
                  </td>
                </tr>
              ) : (
                seasonStats.map((r, i) => (
                  <tr key={i}>
                    <td style={tdS}>{r.season_name}</td>
                    <td style={tdS}>{r.category_name}</td>
                    <td style={tdS}>{r.team}</td>
                    <td style={tdS}>{r.gp}</td>
                    <td style={tdS}>{r.g}</td>
                    <td style={tdS}>{r.a}</td>
                    <td style={tdS}>{r.pts}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Logs unchanged */}
      {!isGoalie && renderSkaterLog(skaterLog)}
      {isGoalie && renderGoalieLog(goalieLog)}
    </div>
  );
}

/* ---------- helpers ---------- */

function SummaryBox({ label, value }) {
  return (
    <div
      style={{
        flex: 1,
        padding: 12,
        border: "1px solid #eee",
        borderRadius: 10,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function renderSkaterLog(skaterLog) {
  return (
    <section style={{ marginTop: 18 }}>
      <h3>Game log (Skater)</h3>
      <div style={tblWrap}>
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
                    <Link to={`/games/${r.slug}/boxscore`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function renderGoalieLog(goalieLog) {
  return (
    <section style={{ marginTop: 18 }}>
      <h3>Game log (Goalie)</h3>
      <div style={tblWrap}>
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
                  r.sa > 0
                    ? `${Math.round((1 - r.ga / r.sa) * 1000) / 10}%`
                    : "—";
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
                      <Link to={`/games/${r.slug}/boxscore`}>
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- utils & styles ---------- */

function fmtTOI(sec) {
  const s = Number(sec || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const headerCard = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: 16,
  border: "1px solid #eee",
  borderRadius: 12,
  marginTop: 10,
};

const summaryRow = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const tblWrap = {
  overflowX: "auto",
  border: "1px solid #eee",
  borderRadius: 10,
};

const logTbl = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};
const theadS = {
  background: "var(--table-head, #f4f5f8)",
};
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
