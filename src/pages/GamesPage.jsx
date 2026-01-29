// src/pages/GamesPage.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useSeason } from "../contexts/SeasonContext";
import { useCategory } from "../contexts/CategoryContext";

function useMaybeI18n() {
  try {
    const { useI18n } = require("../i18n");
    return useI18n();
  } catch {
    return { t: (s) => s };
  }
}

function groupByMonth(games) {
  return games.reduce((acc, g) => {
    const d = new Date(g.game_date);
    const key = d.toLocaleString(undefined, { month: "long", year: "numeric" });

    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});
}

function MonthSection({
  games,
  teamMap,
  highlightDay,
  isLoggedIn,
  isMobile,
  navigate,
  t,
  updateStatus,
  handleDelete,
  formatGameDate,
}) {
  const groups = groupByMonth(games);

  return Object.entries(groups).map(([month, games]) => (
    <div key={month} style={{ marginBottom: 24 }}>
      <div className="gp-sub" style={{ fontWeight: 700, marginBottom: 8 }}>
        {month}
      </div>

      <div className="gp-grid" style={{ gap: 12 }}>
        {games.map((g) => {
          const home = teamMap[g.home_team_id] || {};
          const away = teamMap[g.away_team_id] || {};
          const slug = g.slug || g.id;

          const isHighlighted =
            highlightDay &&
            new Date(g.game_date).toDateString() === highlightDay;

          return (
            <div
              key={g.id}
              className="gp-grid gp-card card"
              style={{
  ...(isHighlighted
    ? { border: "2px solid #e53935", background: "#fff5f5" }
    : {}),
  ...(highlightDay === undefined
    ? { opacity: 0.7 }
    : {}),
}}
            >
              {/* Matchup */}
              <div className="gp-match" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
  {/* Teams */}
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <TeamChip team={away} />
    <span className="gp-sub">{t("at")}</span>
    <TeamChip team={home} />
  </div>

  {/* Date + time (LOCKED POSITION) */}
  <div
    style={{
      fontSize: "1.05rem",
      fontWeight: 700,
      marginLeft: 40, // aligns nicely under team names
      lineHeight: 1.2,
    }}
  >
    {new Date(g.game_date).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}
  </div>
</div>


             {/* Date / time + score */}
<div className="gp-center" style={{ minWidth: 160 }}>
  

  {/* SCORE (secondary for upcoming games) */}

<div
  className="gp-score"
  style={{
    fontSize: "1.05rem",
    fontWeight: 700,
    textAlign: "center",
  }}
>
  {g.away_score} — {g.home_score}

  {g.status === "final" && (
    <div
      style={{
        marginTop: 2,
        fontSize: "0.7rem",
        fontWeight: 800,
        padding: "2px 8px",
        borderRadius: 999,
        display: "inline-block",
        background:
          g.went_so
            ? "#ede9fe" // purple-ish
            : g.went_ot
            ? "#e0f2fe" // blue-ish
            : "#e5e7eb", // normal final
        color:
          g.went_so
            ? "#5b21b6"
            : g.went_ot
            ? "#0369a1"
            : "#374151",
      }}
    >
      Final{g.went_so ? " (SO)" : g.went_ot ? " (OT)" : ""}
    </div>
  )}
</div>


  
</div>


              {/* Actions (unchanged) */}
              <div className="gp-card-actions">

{isLoggedIn && !isMobile && (
  <button
    className="btn"
    onClick={() =>
  navigate(`/live/${slug}`, {
    state: {
      from: "/games",
    },
  })
}
  >
    🏒 {t("Live")}
  </button>
)}

                

                {isLoggedIn && (
                  <button className="btn" onClick={() => navigate(`/games/${slug}/roster`)}>
                    {t("Roster")}
                  </button>
                )}

                <button className="btn" onClick={() => navigate(`/summary/${slug}`)}>
                  {t("Boxscore")}
                </button>

                {isLoggedIn && (
                  <>
                    <button
                      className="btn"
                      onClick={() =>
                        updateStatus(g.id, g.status === "final" ? "scheduled" : "final")
                      }
                    >
                      {g.status === "final" ? t("Open") : t("Mark as Final")}
                    </button>

                    <button
                      className="btn"
                      style={{ background: "crimson" }}
                      onClick={() => handleDelete(g.id)}
                    >
                      {t("Delete")}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ));
}

export default function GamesPage() {
  const { t } = useMaybeI18n();
  const navigate = useNavigate();
  const { seasonId } = useSeason();
  const { categoryId } = useCategory();

  const [teams, setTeams] = React.useState([]);
  const [teamMap, setTeamMap] = React.useState({});
  const [games, setGames] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  // filters (date + single team that matches either side)
  const [filterDate, setFilterDate] = React.useState("");
  const [filterTeam, setFilterTeam] = React.useState("");

  // create form
  const [newDate, setNewDate] = React.useState("");
  const [newHome, setNewHome] = React.useState("");
  const [newAway, setNewAway] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // track if we're on a small/mobile screen
  const [isMobile, setIsMobile] = React.useState(false);

  // is user logged in?
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);

  const [activeTab, setActiveTab] = React.useState("upcoming"); // "upcoming" | "past"


  // detect mobile viewport
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 768px)");
    const handleChange = () => setIsMobile(mq.matches);

    handleChange();
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  // check auth state once on mount
  React.useEffect(() => {
    let mounted = true;
    async function checkAuth() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) console.error(error);
        if (!mounted) return;
        setIsLoggedIn(!!data?.user);
      } catch (e) {
        console.error(e);
        if (!mounted) return;
        setIsLoggedIn(false);
      }
    }
    checkAuth();
    return () => {
      mounted = false;
    };
  }, []);

  // ✅ IMPORTANT: reload when season/category changes
  React.useEffect(() => {
    if (!seasonId || !categoryId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const [{ data: teamRows, error: e1 }, { data: gameRows, error: e2 }] =
        await Promise.all([
          supabase
            .from("teams")
            .select("id, name, short_name, logo_url")
            .eq("season_id", seasonId)
            .eq("category_id", categoryId)
            .order("name"),
          supabase
            .from("games")
            .select(
              "id, game_date, home_team_id, away_team_id, home_score, away_score, status, went_ot, went_so, slug"
            )
            .eq("season_id", seasonId)
            .eq("category_id", categoryId)
            .order("game_date", { ascending: false }),
        ]);

      if (e1 || e2) {
        console.error(e1 || e2);
        if (!cancelled) setLoading(false);
        return;
      }

      const map = Object.fromEntries((teamRows || []).map((tt) => [tt.id, tt]));
      if (!cancelled) {
        setTeams(teamRows || []);
        setTeamMap(map);
        setGames(gameRows || []);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [seasonId, categoryId]);

  const filtered = games.filter((g) => {
    const d = (g.game_date || "").slice(0, 10);
    if (filterDate && d !== filterDate) return false;
    if (filterTeam) {
      const matchEither =
        String(g.home_team_id) === String(filterTeam) ||
        String(g.away_team_id) === String(filterTeam);
      if (!matchEither) return false;
    }
    return true;
  });

  // ---> ADD THIS RIGHT AFTER "const filtered = ... });"
const now = Date.now();

const upcomingGames = filtered
  .filter((g) => toTime(g.game_date) >= now)
  .sort((a, b) => toTime(a.game_date) - toTime(b.game_date)); // soonest first

  // Next game day (all games on the earliest upcoming date)
const nextGameDay = upcomingGames.length
  ? new Date(upcomingGames[0].game_date).toDateString()
  : null;


const pastGames = filtered
  .filter((g) => toTime(g.game_date) < now)
  .sort((a, b) => toTime(b.game_date) - toTime(a.game_date)); // most recent past first

  React.useEffect(() => {
  if (activeTab === "upcoming" && upcomingGames.length === 0 && pastGames.length > 0) {
    setActiveTab("past");
  }

  if (activeTab === "past" && pastGames.length === 0 && upcomingGames.length > 0) {
    setActiveTab("upcoming");
  }
}, [activeTab, upcomingGames.length, pastGames.length]);


  async function handleDelete(id) {
    if (!window.confirm(t("Delete this game?"))) return;
    const { error } = await supabase.from("games").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setGames((cur) => cur.filter((g) => g.id !== id));
  }

  function makeSlug(dateIso, homeId, awayId) {
    const d = (dateIso || "").slice(0, 10).replaceAll("-", "");
    const rand = Math.random().toString(36).slice(2, 6);
    return `${d}-${homeId}-${awayId}-${rand}`;
  }

  function formatGameDate(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

// ---> ADD THIS RIGHT AFTER formatGameDate(...) { ... } ends
function toTime(value) {
  const d = new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}


  
  
  async function handleCreate() {
    if (!newDate || !newHome || !newAway) {
      alert(t("Please fill date, home and away."));
      return;
    }
    if (newHome === newAway) {
      alert(t("Home and away cannot be the same team."));
      return;
    }

    setSaving(true);

    const gameDateUtc = new Date(newDate).toISOString();
    const slug = makeSlug(gameDateUtc, newHome, newAway);

    const payload = {
      season_id: seasonId,
      category_id: categoryId,
      game_date: gameDateUtc,
      home_team_id: Number(newHome),
      away_team_id: Number(newAway),
      home_score: 0,
      away_score: 0,
      status: "scheduled",
      went_ot: false,
      slug,
    };

    const { data, error } = await supabase
      .from("games")
      .insert(payload)
      .select()
      .single();

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    setGames((cur) => [data, ...cur]);
    setNewDate("");
    setNewHome("");
    setNewAway("");
  }

  async function resetGoalieDecisions(gameId) {
    const { error } = await supabase
      .from("game_goalies")
      .update({ decision: "ND" })
      .eq("game_id", gameId);

    if (error) console.error("Error resetting goalie decisions:", error);
  }

  async function applyGoalieDecisionsForFinalGame(gameRow) {
    const {
      id,
      home_team_id,
      away_team_id,
      home_score,
      away_score,
      went_ot,
    } = gameRow || {};

    if (
      id == null ||
      home_team_id == null ||
      away_team_id == null ||
      home_score == null ||
      away_score == null
    ) {
      console.warn("Game row incomplete, skipping goalie decisions", gameRow);
      return;
    }

    if (home_score === away_score) {
      await resetGoalieDecisions(id);
      return;
    }

    const homeWon = home_score > away_score;
    const winningTeamId = homeWon ? home_team_id : away_team_id;
    const losingTeamId = homeWon ? away_team_id : home_team_id;
    const loserDecision = went_ot ? "OTL" : "L";

    await resetGoalieDecisions(id);

    const { error: winErr } = await supabase
      .from("game_goalies")
      .update({ decision: "W" })
      .eq("game_id", id)
      .eq("team_id", winningTeamId);
    if (winErr) console.error("Error setting winning goalie decision:", winErr);

    const { error: loseErr } = await supabase
      .from("game_goalies")
      .update({ decision: loserDecision })
      .eq("game_id", id)
      .eq("team_id", losingTeamId);
    if (loseErr) console.error("Error setting losing goalie decision:", loseErr);
  }

  async function updateStatus(id, status) {
    const { data, error } = await supabase
      .from("games")
      .update({ status })
      .eq("id", id)
     .select(
  "id, home_team_id, away_team_id, home_score, away_score, went_ot, went_so, status, game_date, slug"
)
      .single();

    if (error) {
      alert(error.message);
      return;
    }

  setGames((cur) =>
  cur.map((g) => (g.id === id ? { ...g, ...data } : g))
);

    try {
      if (status === "final") {
        await applyGoalieDecisionsForFinalGame(data);
      } else {
        await resetGoalieDecisions(id);
      }
    } catch (e) {
      console.error("Error updating goalie decisions:", e);
    }
  }

  return (
    <div className="games-page gp-container">
      <h2 className="gp-h2">{t("Games")}</h2>

      {/* Filters */}
      <div className="gp-grid gp-filter card">
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="gp-input"
        />

        <select
          value={filterTeam}
          onChange={(e) => setFilterTeam(e.target.value)}
          className="gp-input"
        >
          <option value="">{t("Team…")}</option>
          {teams.map((tt) => (
            <option key={tt.id} value={tt.id}>
              {tt.name}
            </option>
          ))}
        </select>

        <button
          className="btn"
          onClick={() => {
            setFilterDate("");
            setFilterTeam("");
          }}
        >
          {t("Clear")}
        </button>
      </div>

      {/* Create game – only when logged in */}
      {isLoggedIn && (
        <div className="gp-grid gp-create card">
          <input
            type="datetime-local"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="gp-input"
          />

          <select
            value={newHome}
            onChange={(e) => setNewHome(e.target.value)}
            className="gp-input"
          >
            <option value="">{t("Home team…")}</option>
            {teams.map((tt) => (
              <option key={tt.id} value={tt.id}>
                {tt.name}
              </option>
            ))}
          </select>

          <select
            value={newAway}
            onChange={(e) => setNewAway(e.target.value)}
            className="gp-input"
          >
            <option value="">{t("Away team…")}</option>
            {teams.map((tt) => (
              <option key={tt.id} value={tt.id}>
                {tt.name}
              </option>
            ))}
          </select>

          <button className="btn" onClick={handleCreate} disabled={saving}>
            {saving ? t("Creating…") : t("Create")}
          </button>
        </div>
      )}

{/* Games list */}
{loading ? (
  <div style={{ padding: 12 }}>{t("Loading…")}</div>
) : filtered.length === 0 ? (
  <div style={{ padding: 12 }}>{t("No games match your filters.")}</div>
) : (
  <>

    {/* Tabs */}
<div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
  <button
    className={`btn ${activeTab === "upcoming" ? "btn-primary" : ""}`}
    onClick={() => setActiveTab("upcoming")}
  >
    {t("Upcoming")} ({upcomingGames.length})
  </button>

  <button
    className={`btn ${activeTab === "past" ? "btn-primary" : ""}`}
    onClick={() => setActiveTab("past")}
  >
    {t("Past")} ({pastGames.length})
  </button>
</div>


    {/* Tab content */}
   {activeTab === "upcoming" && (
  <>
    {nextGameDay && (
      <div
        className="gp-sub"
        style={{ marginBottom: 12, fontWeight: 600 }}
      >
        📅 {t("Next games")}: {nextGameDay} (
        {upcomingGames.filter(
          (g) => new Date(g.game_date).toDateString() === nextGameDay
        ).length}
        )
      </div>
    )}

    <MonthSection
      games={upcomingGames}
      teamMap={teamMap}
      highlightDay={nextGameDay}
      isLoggedIn={isLoggedIn}
      isMobile={isMobile}
      navigate={navigate}
      t={t}
      updateStatus={updateStatus}
      handleDelete={handleDelete}
      formatGameDate={formatGameDate}
    />
  </>
)}


    {activeTab === "past" && (
      <MonthSection
        games={pastGames}
        teamMap={teamMap}
        isLoggedIn={isLoggedIn}
        isMobile={isMobile}
        navigate={navigate}
        t={t}
        updateStatus={updateStatus}
        handleDelete={handleDelete}
        formatGameDate={formatGameDate}
      />
    )}
  </>
)}


     </div>
  );
}

      


function TeamChip({ team }) {
  return (
    <div className="gp-team" title={team.name || ""}>
      {team.logo_url ? (
        <img
          className="gp-logo"
          src={team.logo_url}
          alt={team.short_name || team.name || "team"}
        />
      ) : (
        <span style={{ width: 28 }} />
      )}
      <span className="gp-team-name">{team.name || "—"}</span>
    </div>
  );
}



      
