import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useI18n } from "../i18n";



export default function PlayerPage() {

  const { id } = useParams();
  const pid = Number(id);
  const { t } = useI18n();


  const [player, setPlayer] = React.useState(null);
  const [headerTeam, setHeaderTeam] = React.useState(null);
  const [headerNumber, setHeaderNumber] = React.useState(null);

  const [seasonStats, setSeasonStats] = React.useState([]);
  const [career, setCareer] = React.useState({ gp: 0, g: 0, a: 0, pts: 0 });

  const [goalieCareer, setGoalieCareer] = React.useState(null);

  const [goalieSeasonStats, setGoalieSeasonStats] = React.useState([]);


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
  .select("id, name, position, avatar_url")
  .eq("id", pid)
  .single();

      if (e1 || !pRow) {
        if (!cancelled) setLoading(false);
        return;
      }

      const isGoalie =
        String(pRow.position || "").trim().toUpperCase() === "G";




      /* ---------- GOALIE CAREER TOTALS ---------- */
let goalieCareerTotals = null;

if (isGoalie) {
  const { data: gCareer } = await supabase
    .from("goalie_stats_current")
    .select(
      `
      gp,
      sa,
      ga,
      sv_pct,
      gaa,
      wins,
      losses,
      otl,
      so,
      sol,
      toi_seconds
      `
    )
    .eq("player_id", pid);

  if (gCareer && gCareer.length > 0) {
    goalieCareerTotals = gCareer.reduce(
      (acc, r) => {
        acc.gp += r.gp || 0;
        acc.sa += r.sa || 0;
        acc.ga += r.ga || 0;
        acc.w += r.wins || 0;
        acc.l += r.losses || 0;
        acc.otl += r.otl || 0;
        acc.so += r.so || 0;
        acc.toi += r.toi_seconds || 0;
        acc.sol += r.sol || 0;
        return acc;
      },
     { gp: 0, sa: 0, ga: 0, w: 0, l: 0, otl: 0, sol: 0, so: 0, toi: 0 }
    );

    goalieCareerTotals.sv_pct =
      goalieCareerTotals.sa > 0
        ? Math.round((1 - goalieCareerTotals.ga / goalieCareerTotals.sa) * 1000) / 10
        : null;

    goalieCareerTotals.gaa =
  goalieCareerTotals.toi > 0
    ? Math.round(
        (goalieCareerTotals.ga / goalieCareerTotals.toi) * 1800 * 100
      ) / 100
    : null;
  }
}


      /* ---------- LOOKUPS ---------- */
      const [{ data: seasons }, { data: cats }] = await Promise.all([
        supabase.from("seasons").select("id, name"),
        supabase.from("categories").select("id, name"),
      ]);

      const seasonMap = new Map((seasons || []).map((s) => [s.id, s.name]));
      const catMap = new Map((cats || []).map((c) => [c.id, c.name]));

      let goalieSeasonStatsLocal = [];

if (isGoalie) {
  const { data } = await supabase
    .from("goalie_stats_current")
    .select(`
  season_id,
  category_id,
  team,
  gp,
  sv_pct,
  ga,
  toi_seconds,
  wins,
  losses,
  otl,
  sol
`)
    .eq("player_id", pid)
    .order("season_id", { ascending: false });

  goalieSeasonStatsLocal = (data || []).map((r) => ({
    ...r,
    season_name: seasonMap.get(r.season_id) || r.season_id,
    category_name: catMap.get(r.category_id) || r.category_id,
  }));
}
      goalieSeasonStatsLocal = goalieSeasonStatsLocal.map((r) => ({
  ...r,
  gaa:
    r.toi_seconds > 0
      ? Math.round((r.ga / r.toi_seconds) * 1800 * 100) / 100
      : null,
}));



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
  "id, game_date, season_id, home_team_id, away_team_id, slug, home_score, away_score, went_so"
)

 ,
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
  season_id: gm?.season_id,
  season_name: seasonMap.get(gm?.season_id) || "Other",
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

    const wentSO = gm?.went_so === true;

    const decision =
      overlay?.decision === "L" && wentSO
        ? "SOL"
        : overlay?.decision || "";

    return {
      game_id: r.game_id,
      season_id: gm?.season_id,
      season_name: seasonMap.get(gm?.season_id) || "Other",
      date,
      slug: gm?.slug || r.game_id,
      opponent: opp?.short_name || opp?.name || "",
      sa: overlay?.shots_against ?? 0,
      ga: overlay?.goals_against ?? 0,
      toi: overlay?.minutes_seconds ?? 0,
      decision,
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
        setGoalieCareer(goalieCareerTotals);
        setGoalieSeasonStats(goalieSeasonStatsLocal);

      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [pid]);

  if (loading) return <div>{t("Loading…")}</div>;
if (!player) return <div>{t("Player not found.")}</div>;


  const isGoalie =
    String(player.position || "").trim().toUpperCase() === "G";

  return (
    <div className="player-page">
      <Link to="/stats" style={{ textDecoration: "none" }}>
     ← {t("Back to Stats")}

      </Link>

     <div className="player-header">
  {/* LEFT: player info */}


<div
  className="player-info-card"
  style={{
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start", // ⬅️ important
  }}
>

       
    {headerTeam?.logo_url && (
      <img
  src={headerTeam.logo_url}
  alt={headerTeam.name}
  style={{
    width: 80,      // ⬅️ wider
    height: 48,     // ⬅️ slightly shorter
    objectFit: "contain",
    flexShrink: 0,
  }}
/>
    )}

    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        fontSize: 18,
        fontWeight: 700,
      }}
    >
      {headerNumber && (
        <span style={{ opacity: 0.6 }}>#{headerNumber}</span>
      )}

      <span>{player.name}</span>

      <span style={{ opacity: 0.5, fontWeight: 500 }}>
        {player.position} • {headerTeam?.name}
      </span>
    </div>
  </div>

  {/* SECOND ROW — RESERVED SPACE (badges / stats later) */}
  <div
    style={{
      marginTop: 14,
      minHeight: 48,
      display: "flex",
      alignItems: "center",
      gap: 10,
      color: "#999",
      fontSize: 14,
    }}
  >
    {/* Future badges / icons go here */}
  </div>
</div>

       

  {/* RIGHT: avatar */}
<div className="player-avatar-card">
    {player.avatar_url ? (
      <img
        src={player.avatar_url}
        alt={player.name}
        className="player-avatar-img"
      />
    ) : (
   <div className="player-avatar-placeholder">
        No photo
      </div>
    )}
  </div>
</div>


      {/* Career Summary */}

      <section style={{ marginTop: 16 }}>
<h3>{t("Career Totals")}</h3>


  {!isGoalie ? (
    /* ---------- SKATERS (unchanged) ---------- */
    <div style={summaryRow}>

<SummaryBox label={t("GP")} value={career.gp} />
<SummaryBox label={t("G")} value={career.g} />
<SummaryBox label={t("A")} value={career.a} />
<SummaryBox label={t("PTS")} value={career.pts} highlight />

      
    </div>
  ) : (
    /* ---------- GOALIES ---------- */
    <div style={summaryRow}>


<SummaryBox label={t("GP")} value={goalieCareer?.gp ?? 0} />
<SummaryBox
  label={t("SV%")}
  value={goalieCareer?.sv_pct != null ? `${goalieCareer.sv_pct}%` : "—"}
/>
<SummaryBox
  label={t("GAA")}
  value={goalieCareer?.gaa != null ? goalieCareer.gaa : "—"}
/>
<SummaryBox
  label={t("W-L-OTL-SOL")}
  value={`${goalieCareer?.w ?? 0}-${goalieCareer?.l ?? 0}-${goalieCareer?.otl ?? 0}-${goalieCareer?.sol ?? 0}`}
  highlight
/>

      
    </div>
  )}
</section>


      {/* Season Stats */}
     <section style={{ marginTop: 18 }}>
 <h3>{t("Stats by season & category")}</h3>

  <div style={tblWrap}>
    {!isGoalie ? (
      /* ================= SKATERS ================= */
      <table style={logTbl}>
        <thead style={theadS}>
          <tr>

<th style={thS}>{t("Season")}</th>
<th style={thS}>{t("Category")}</th>
<th style={thS}>{t("Team")}</th>
<th style={thS}>{t("GP")}</th>
<th style={thS}>{t("G")}</th>
<th style={thS}>{t("A")}</th>
<th style={thS}>{t("PTS")}</th>

            
          </tr>
        </thead>
        <tbody>
          {seasonStats.map((r, i) => (
            <tr key={i}>
              <td style={tdS}>{r.season_name}</td>
              <td style={tdS}>{r.category_name}</td>
              <td style={tdS}>{r.team}</td>
              <td style={tdS}>{r.gp}</td>
              <td style={tdS}>{r.g}</td>
              <td style={tdS}>{r.a}</td>
              <td style={tdS}>{r.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      /* ================= GOALIES ================= */
      <table style={logTbl}>
        <thead style={theadS}>
          <tr>

            <th style={thS}>{t("Season")}</th>
<th style={thS}>{t("Category")}</th>
<th style={thS}>{t("Team")}</th>
<th style={thS}>{t("GP")}</th>
<th style={thS}>{t("SV%")}</th>
<th style={thS}>{t("GAA")}</th>
<th style={thS}>{t("W-L-OTL-SOL")}</th>


          </tr>
        </thead>
        <tbody>
          {goalieSeasonStats.map((r, i) => (
            <tr key={i}>
              <td style={tdS}>{r.season_name}</td>
              <td style={tdS}>{r.category_name}</td>
              <td style={tdS}>{r.team}</td>
              <td style={tdS}>{r.gp}</td>
              <td style={tdS}>
                {r.sv_pct != null ? `${r.sv_pct}%` : "—"}
              </td>
              <td style={tdS}>{r.gaa ?? "—"}</td>
              <td style={tdS}>
                {`${r.wins ?? 0}-${r.losses ?? 0}-${r.otl ?? 0}-${r.sol ?? 0}`}

              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
</section>


      {/* Logs unchanged */}
   {!isGoalie && <SkaterLog skaterLog={skaterLog} />}
     {isGoalie && <GoalieLog goalieLog={goalieLog} />}
    </div>
  );
}

/* ---------- helpers ---------- */

function SummaryBox({ label, value, highlight }) {
  return (
    <div
      style={{
        flex: 1,
        padding: 12,
        border: highlight ? "2px solid #e53935" : "1px solid #eee",
        borderRadius: 10,
        textAlign: "center",
        background: highlight ? "#fff5f5" : "transparent",
      }}
    >
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: highlight ? "#e53935" : "inherit",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SkaterLog({ skaterLog }) {
  const { t } = useI18n();

  const [openSeasons, setOpenSeasons] = React.useState(() => {
  const seasons = [...new Set(skaterLog.map(g => g.season_name))];
  return seasons.reduce((acc, s, i) => {
    acc[s] = i === 0; // only most recent open
    return acc;
  }, {});
});
  const toggleSeason = (season) => {
  setOpenSeasons(prev => ({
    ...prev,
    [season]: !prev[season],
  }));
};

  // group by season name
  const bySeason = skaterLog.reduce((acc, g) => {
    const key = g.season_name || "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});

  return (
    <section style={{ marginTop: 18 }}>
      <h3>{t("Game log (Skater)")}</h3>

      {Object.entries(bySeason).map(([seasonName, games]) => (
        <div key={seasonName} style={{ marginTop: 16 }}>
         <h4
  onClick={() => toggleSeason(seasonName)}
  style={{
    margin: "12px 0",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    userSelect: "none",
  }}
>
  <span style={{ fontSize: 14 }}>
    {openSeasons[seasonName] ? "▼" : "▶"}
  </span>
  {seasonName}
</h4>
{openSeasons[seasonName] && (
          <div style={tblWrap}>
            <table style={logTbl}>
              <thead style={theadS}>
                <tr>

<th style={thS}>{t("Date")}</th>
<th style={thS}>{t("Matchup")}</th>
<th style={thS}>{t("G")}</th>
<th style={thS}>{t("A")}</th>
<th style={thS}>{t("Score")}</th>
<th style={thS}>{t("Boxscore")}</th>

                  
                </tr>
              </thead>
              <tbody>
                {games.map((r) => (
                  <tr key={`sk-${r.game_id}`}>
                    <td style={{ ...tdS, fontWeight: 600 }}>
                      {r.date
                        ? r.date.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                    <td style={tdS}>
                      {r.away} @ {r.home}
                    </td>
                    <td style={tdS}>{r.g}</td>
                    <td style={tdS}>{r.a}</td>
                    <td style={{ ...tdS, fontWeight: 700 }}>
                      {r.hs}–{r.as}
                    </td>
                    <td style={tdS}>
                    <Link to={`/summary/${r.slug}`}>{t("View")}</Link>

                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
)}
        
        </div>
      ))}
    </section>
  );
}

function GoalieLog({ goalieLog }) {
  const { t } = useI18n();

  const bySeason = goalieLog.reduce((acc, g) => {
    const key = g.season_name || "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});

  const [openSeasons, setOpenSeasons] = React.useState(() => {
    const seasons = Object.keys(bySeason);
    return seasons.reduce((acc, s, i) => {
      acc[s] = i === 0; // open most recent only
      return acc;
    }, {});
  });

  const toggleSeason = (season) => {
    setOpenSeasons((prev) => ({
      ...prev,
      [season]: !prev[season],
    }));
  };

  return (
    <section style={{ marginTop: 18 }}>
   <h3>{t("Game log (Goalie)")}</h3>


      {Object.entries(bySeason).map(([seasonName, games]) => (
        <div key={seasonName} style={{ marginTop: 16 }}>
          <h4
            onClick={() => toggleSeason(seasonName)}
            style={{
              margin: "12px 0",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              userSelect: "none",
            }}
          >
            <span style={{ fontSize: 14 }}>
              {openSeasons[seasonName] ? "▼" : "▶"}
            </span>
            {seasonName}
          </h4>

         {openSeasons[seasonName] && renderGoalieLog(games, t)}

        </div>
      ))}
    </section>
  );
}



function renderGoalieLog(goalieLog, t) {

  return (
    <section style={{ marginTop: 18 }}>
     
      <div style={tblWrap}>
        <table style={logTbl}>
          <thead style={theadS}>
            <tr>

<th style={thS}>{t("Date")}</th>
<th style={thS}>{t("Opponent")}</th>
<th style={thS}>{t("SA")}</th>
<th style={thS}>{t("GA")}</th>
<th style={thS}>{t("SV%")}</th>
<th style={thS}>{t("TOI")}</th>
<th style={thS}>{t("Decision")}</th>
<th style={thS}>{t("SO")}</th>
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
                      <Link to={`/summary/${r.slug}`}>
                         {t("View")}
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
