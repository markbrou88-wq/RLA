// src/lib/pages/SummaryPage.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
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

  const [rows, setRows] = React.useState([]);

  const [openPeriods, setOpenPeriods] = React.useState({});

  const [showShotsByPeriod, setShowShotsByPeriod] = React.useState({});

  const [shootoutRows, setShootoutRows] = React.useState([]);


  const toggleShots = (period) => {
  setShowShotsByPeriod((prev) => ({
    ...prev,
    [period]: !prev[period],
  }));
};


  const togglePeriod = (period) => {
  setOpenPeriods((prev) => ({
    ...prev,
    [period]: !prev[period],
  }));
};



  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      // Find game
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

      // Teams + records
      const [{ data: home }, { data: away }] = await Promise.all([
        supabase.from("teams").select("*").eq("id", g.home_team_id).single(),
        supabase.from("teams").select("*").eq("id", g.away_team_id).single(),
      ]);

      const [{ data: recHome }, { data: recAway }] = await Promise.all([
        supabase
          .from("standings_current")
          .select("*")
          .eq("team_id", g.home_team_id)
          .maybeSingle(),
        supabase
          .from("standings_current")
          .select("*")
          .eq("team_id", g.away_team_id)
          .maybeSingle(),
      ]);

      // 👉 Fetch jersey numbers from team_players for this game context
      const { data: teamPlayers } = await supabase
        .from("team_players")
        .select("player_id, team_id, number")
        .eq("season_id", g.season_id)
        .eq("category_id", g.category_id)
        .in("team_id", [g.home_team_id, g.away_team_id]);

    


      const numberMap = new Map(
        (teamPlayers || []).map((tp) => [
          `${tp.team_id}:${tp.player_id}`,
          tp.number,
        ])
      );

      // Rosters
      const { data: rosterRows } = await supabase
        .from("game_rosters")
        .select(
          `
          player_id,
          team_id,
          players!inner(id, name, position)
        `
        )
        .eq("game_id", g.id)
      .eq("dressed", true);

      const split = (rows, teamId) => {
        const entries = (rows || [])
          .filter((r) => r.team_id === teamId)
          .map((r) => ({
            id: r.players.id,
            name: r.players.name,
            number: numberMap.get(`${teamId}:${r.players.id}`) ?? null,
            pos: r.players.position || "",
          }))
          .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));

        const goalies = entries.filter((p) => (p.pos || "").toUpperCase() === "G");
        const skaters = entries.filter((p) => (p.pos || "").toUpperCase() !== "G");
        return { skaters, goalies };
      };

      const homeLU = split(rosterRows, g.home_team_id);
      const awayLU = split(rosterRows, g.away_team_id);

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
        const ot = data.otl ?? data.overtime_losses ?? data.OTL ?? null;
        const so = data.so ?? data.shutouts ?? data.SO ?? null;
        return { w, l, ot, so };
      };

      const [homeGoalieRecData, awayGoalieRecData] = await Promise.all([
        getGoalieRec(homeLU.goalies[0]),
        getGoalieRec(awayLU.goalies[0]),
      ]);

      // Events
      const { data: ev } = await supabase
        .from("events")
        .select(`
          id, game_id, team_id, player_id, period, time_mmss, event,
          players!events_player_id_fkey ( id, name ),
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

    const { data: shootoutAttempts } = await supabase
  .from("shootout_attempts")
  .select(`
    id,
    game_id,
    team_id,
    shooter_id,
    goalie_id,
    round,
    result,
    players:shooter_id ( id, name )
  `)
  .eq("game_id", g.id)
  .order("round", { ascending: true });

 const normalizedShootout = (shootoutAttempts || []).map(a => ({
  ...a,
  is_goal: a.result === "goal",
}));


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
  setShootoutRows(normalizedShootout);


  // ✅ open only the most recent period by default
  const periods = [...new Set(
    (grouped || []).map(r => r.goal ? r.goal.period : r.single.period)
  )].sort((a, b) => b - a);

  const initialOpen = {};
  if (periods.length) initialOpen[periods[0]] = true;
  setOpenPeriods(initialOpen);

  setLoading(false);
}
      
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const rowsByPeriod = React.useMemo(() => {
  return rows.reduce((acc, r) => {
    const period = r.goal ? r.goal.period : r.single.period;
    if (!acc[period]) acc[period] = [];
    acc[period].push(r);
    return acc;
  }, {});
}, [rows]);


 const shootoutByTeam = React.useMemo(() => {
  if (!shootoutRows || shootoutRows.length === 0) return {};
  const out = {};
  shootoutRows.forEach((a) => {
    if (!out[a.team_id]) out[a.team_id] = [];
    out[a.team_id].push(a);
  });
  return out;
}, [shootoutRows]);


  if (loading)
    return (
      <div className="container" style={{ padding: 16 }}>
        {t("Loading…")}
      </div>
    );
  if (!game)
    return (
      <div className="container" style={{ padding: 16 }}>
        {t("Game not found.")}
      </div>
    );

  const dateStr = game.game_date ? new Date(game.game_date).toLocaleString() : "";
  const scoreline = `${awayTeam?.short_name || awayTeam?.name || "—"} ${
    game.away_score ?? "—"
  }  —  ${game.home_score ?? "—"} ${
    homeTeam?.short_name || homeTeam?.name || "—"
  }`;


const isShootout = game.went_so === true;

const shootoutLabel = isShootout ? " (SO)" : "";


 


// Compute running score as goals occur
const runningScore = {};
let awayGoals = 0;
let homeGoals = 0;

rows.forEach((r) => {
  if (r.goal) {
    if (r.goal.team_id === game.away_team_id) awayGoals++;
    if (r.goal.team_id === game.home_team_id) homeGoals++;

    runningScore[r.goal.id] = {
      away: awayGoals,
      home: homeGoals,
    };
  }
});

  
  
  const getNum = (teamId, playerId) =>
    rows && game
      ? null
      : null;

  return (
    <div className="container summary-page" style={{ maxWidth: 1100 }}>
      <div className="button-group" style={{ marginBottom: 12 }}>
        <Link className="btn btn-grey" to="/games">
          {t("Back to Games")}
        </Link>
      </div>

      <h2 style={{ textAlign: "center", margin: "6px 0" }}>
        {(awayTeam?.name || "—")} @ {(homeTeam?.name || "—")}
      </h2>
      <div style={{ textAlign: "center", color: "#666", margin: "4px 0" }}>
        {String(game.status || "").toUpperCase()} • {dateStr}
      </div>

      <div style={{ textAlign: "center", fontWeight: 700, marginBottom: 16 }}>
  {scoreline}
  {isShootout && (
    <span style={{ fontSize: 13, color: "#666", marginLeft: 6 }}>
      (SO)
    </span>
  )}
</div>


      <div className="summary-lineups">
        <div className="summary-team-column">
          <LineupCard
            team={awayTeam}
            record={awayRecord}
            lineup={lineupAway}
            goalieRec={awayGoalieRec}
          />
        </div>
        <div className="summary-team-column">
          <LineupCard
            team={homeTeam}
            record={homeRecord}
            lineup={lineupHome}
            goalieRec={homeGoalieRec}
            alignRight
          />
        </div>
      </div>

      <div className="card summary-events-card" style={{ padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>{t("Goals / Events")}</h3>
        {rows.length === 0 ? (
          <div style={{ color: "#777" }}>{t("No events yet.")}</div>
        ) : (
          <div className="table-responsive">
            <table className="summary-events-table">
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

        {Object.entries(rowsByPeriod).map(([period, periodRows]) => {
  const shotCount = periodRows.filter(
    (r) => r.single && r.single.event === "shot"
  ).length;

  return (
    <React.Fragment key={`p-${period}`}>


      <tr
  onClick={() => togglePeriod(period)}
  style={{ cursor: "pointer" }}
>

<Td
  colSpan={5}
  style={{
    background: "#fafafa",
    fontWeight: 700,
    borderTop: "2px solid #eee",
    userSelect: "none",
    padding: "6px 10px",
  }}
>
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      lineHeight: "1.2",
      whiteSpace: "nowrap",
    }}
  >
    <span>
      <span style={{ marginRight: 6 }}>
        {openPeriods[period] ? "▼" : "▶"}
      </span>
      {t("Period")} {period}
    </span>

    {shotCount > 0 && (
      <span
        onClick={(e) => {
          e.stopPropagation();
          toggleShots(period);
        }}
        style={{
          fontSize: 12,
          color: "#666",
          cursor: "pointer",
          fontWeight: 500,
          marginLeft: 12,
        }}
      >
        {showShotsByPeriod[period]
          ? t("Hide shots")
          : `${t("Show shots")} (${shotCount})`}
      </span>
    )}
  </div>
</Td>


        
</tr>


      {/* Period events */}

{openPeriods[period] &&
  periodRows.map((r, i) => {

    /* ---------- GOALS (always visible) ---------- */
    if (r.goal) {
      const teamLabel =
        r.goal.teams?.short_name || r.goal.teams?.name || "";

      const aTxt = r.assists
        .map((a) =>
          a.players?.id ? (
            <Link key={`a${a.id}`} to={`/players/${a.players.id}`}>
              {a.players.name}
            </Link>
          ) : (
            a.players?.name ?? "—"
          )
        )
        .reduce(
          (acc, node, idx) => (idx ? [...acc, ", ", node] : [node]),
          []
        );

      return (
        <tr
          key={`g-${period}-${i}`}
          style={{ background: "#f1fbf4", fontWeight: 600 }}
        >
          <Td>{r.goal.period}</Td>
          <Td>{r.goal.time_mmss}</Td>
          <Td>{teamLabel}</Td>
          <Td>GOAL</Td>
          <Td>
            <b>
              {r.goal.players?.id ? (
                <Link to={`/players/${r.goal.players.id}`}>
                  {r.goal.players.name}
                </Link>
              ) : (
                r.goal.players?.name ?? "—"
              )}
            </b>

{aTxt.length > 0 && (
  <span style={{ color: "#666" }}> (A: {aTxt})</span>
)}

{runningScore[r.goal.id] && (
  <div
    style={{
      marginTop: 2,
      fontSize: 12,
      color: "#333",
      fontWeight: 500,
    }}
  >
    {awayTeam?.short_name || awayTeam?.name}{" "}
    {runningScore[r.goal.id].away}
    {" – "}
    {runningScore[r.goal.id].home}{" "}
    {homeTeam?.short_name || homeTeam?.name}
  </div>
)}



            
          </Td>
        </tr>
      );
    }

    /* ---------- NON-GOAL EVENTS ---------- */
    const e = r.single;
    const isShot = e.event === "shot";

    // ⛔ hide shots unless toggled
    if (isShot && !showShotsByPeriod[period]) {
      return null;
    }

    const teamLabel = e.teams?.short_name || e.teams?.name || "";

    return (
      <tr
        key={`o-${period}-${i}`}
        style={{
          color: isShot ? "#9aa0a6" : undefined,
          fontSize: isShot ? 12 : 13,
        }}
      >
        <Td>{e.period}</Td>
        <Td>{e.time_mmss}</Td>
        <Td>{teamLabel}</Td>
        <Td>{String(e.event || "").toUpperCase()}</Td>
        <Td>
          {e.players?.id ? (
            <Link
              to={`/players/${e.players.id}`}
              style={{ color: isShot ? "#8b8f94" : undefined }}
            >
              {e.players.name}
            </Link>
          ) : (
            e.players?.name ?? "—"
          )}
        </Td>
      </tr>
    );
  })}
      

      
    </React.Fragment>
  );
})}
</tbody>
        
            </table>
          </div>
        )}
      </div>

     {isShootout && shootoutRows.length > 0 && (
  <div className="card" style={{ marginTop: 16 }}>
    <h3 style={{ marginTop: 0 }}>Shootout</h3>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 24,
        textAlign: "center",
      }}
    >
     
      <ShootoutTeam
        team={awayTeam}
        attempts={shootoutByTeam[awayTeam?.id] || []}
      />

     
      <ShootoutTeam
        team={homeTeam}
        attempts={shootoutByTeam[homeTeam?.id] || []}
      />
    </div>

    <div style={{ marginTop: 14, textAlign: "center", fontWeight: 600 }}>
      Winner:{" "}
      {game.so_winner_team_id === homeTeam?.id
        ? homeTeam?.name
        : awayTeam?.name}
    </div>
  </div>
)}

      
    </div>
  );
}

function LineupCard({ team, record, lineup, goalieRec, alignRight = false }) {
  const recText =
    record &&
    (record.w !== undefined ||
      record.l !== undefined ||
      record.otl !== undefined)
      ? `• ${record.w ?? 0} W • ${record.l ?? 0} L • ${record.otl ?? 0} OTL`
      : null;

  const direction = alignRight ? "row-reverse" : "row";

  return (
    <div className="card summary-team-card">
      <div
        className="summary-team-header"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          justifyContent: alignRight ? "flex-end" : "flex-start",
          flexDirection: direction,
        }}
      >
        {team?.logo_url ? (
          <img
            src={team.logo_url}
            alt={team.short_name || team.name || "logo"}
            className="summary-team-logo"
          />
        ) : null}
        <div style={{ textAlign: alignRight ? "right" : "left" }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{team?.name || "—"}</h3>
          {recText && (
            <div style={{ fontSize: 12, color: "#666" }}>{recText}</div>
          )}
        </div>
      </div>

      <div className="table-responsive">
        <table className="summary-lineup-table">
          <thead>
            <tr>
              <Th>#</Th>
              <Th>PLAYER</Th>
              <Th>POS</Th>
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
                    <Td colSpan={3} style={{ padding: 6 }} />
                  </tr>
                )}

                {lineup.goalies.map((p) => (
  <RosterRow
    key={`g-${p.id}`}
    p={p}
    goalieRec={goalieRec}
  />
))}
              </>
            )}
          </tbody>
        </table>
      </div>
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
          <span style={{ color: "#666", marginLeft: 6, fontSize: 11 }}>
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

function ShootoutTeam({ team, attempts }) {
  const color = team?.primary_color || "#cc0000"; // fallback

  return (
    <div>
      <strong>{team?.name}</strong>

      <div style={{ marginTop: 8 }}>
        {attempts.map((a, i) => (
          <span
            key={a.id}
            title={`${a.players?.name || "Unknown"} — ${
              a.is_goal ? "GOAL" : "MISS"
            }`}
            style={{
              display: "inline-block",
              width: 14,
              height: 14,
              borderRadius: "50%",
              margin: "0 4px",
              backgroundColor: a.is_goal ? color : "transparent",
              border: `2px solid ${color}`,
            }}
          />
        ))}
      </div>

      {attempts.length > 0 && (
  <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
    {attempts.map((a, i) => (
      <div key={`n-${a.id}`}>
        {i + 1}. {a.players?.name || "—"}
      </div>
    ))}
  </div>
)}
        
      
    </div>
  );
}


