import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useSeason } from "../contexts/SeasonContext";

function useMaybeI18n() {
  try {
    const { useI18n } = require("../i18n");
    return useI18n();
  } catch {
    return { t: (s) => s };
  }
}

export default function GamesPage() {
  const { t } = useMaybeI18n();
  const navigate = useNavigate();

  // ⬇️ season context
  const { seasonId, seasons } = useSeason();

  const [teams, setTeams] = React.useState([]);
  const [teamMap, setTeamMap] = React.useState({});
  const [games, setGames] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  // filters
  const [filterDate, setFilterDate] = React.useState("");
  const [filterTeam, setFilterTeam] = React.useState("");

  // create form
  const [newDate, setNewDate] = React.useState("");
  const [newHome, setNewHome] = React.useState("");
  const [newAway, setNewAway] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // 🆕 NEW: season used when creating a game
  const [newSeasonId, setNewSeasonId] = React.useState(seasonId);

  // keep create-form season in sync with top selector
  React.useEffect(() => {
    setNewSeasonId(seasonId);
  }, [seasonId]);

  const [isMobile, setIsMobile] = React.useState(false);
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);

  // detect mobile viewport
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const handleChange = () => setIsMobile(mq.matches);
    handleChange();
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  // auth check
  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setIsLoggedIn(!!data?.user);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // load teams + games for selected season
  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const [{ data: teamRows }, { data: gameRows }] = await Promise.all([
        supabase
          .from("teams")
          .select("id, name, short_name, logo_url")
          .eq("season_id", seasonId)
          .order("name"),
        supabase
          .from("games")
          .select(
            "id, game_date, home_team_id, away_team_id, home_score, away_score, status, went_ot, slug"
          )
          .eq("season_id", seasonId)
          .order("game_date", { ascending: false }),
      ]);

      if (cancelled) return;

      const map = Object.fromEntries(teamRows.map((t) => [t.id, t]));
      setTeams(teamRows);
      setTeamMap(map);
      setGames(gameRows);
      setLoading(false);
    }

    if (seasonId) load();
    return () => {
      cancelled = true;
    };
  }, [seasonId]);

  const filtered = games.filter((g) => {
    const d = (g.game_date || "").slice(0, 10);
    if (filterDate && d !== filterDate) return false;
    if (filterTeam) {
      return (
        String(g.home_team_id) === String(filterTeam) ||
        String(g.away_team_id) === String(filterTeam)
      );
    }
    return true;
  });

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

  async function handleCreate() {
    if (!newDate || !newHome || !newAway || !newSeasonId) {
      alert(t("Please fill date, season, home and away."));
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
      season_id: Number(newSeasonId), // ⭐ KEY ADDITION
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

    // only prepend if game belongs to currently viewed season
    if (Number(newSeasonId) === Number(seasonId)) {
      setGames((cur) => [data, ...cur]);
    }

    setNewDate("");
    setNewHome("");
    setNewAway("");
  }

  async function handleDelete(id) {
    if (!window.confirm(t("Delete this game?"))) return;
    await supabase.from("games").delete().eq("id", id);
    setGames((cur) => cur.filter((g) => g.id !== id));
  }

  /* ---------------- GOALIE LOGIC (UNCHANGED) ---------------- */

  async function resetGoalieDecisions(gameId) {
    await supabase
      .from("game_goalies")
      .update({ decision: "ND" })
      .eq("game_id", gameId);
  }

  async function applyGoalieDecisionsForFinalGame(gameRow) {
    const {
      id,
      home_team_id,
      away_team_id,
      home_score,
      away_score,
      went_ot,
    } = gameRow;

    if (home_score === away_score) {
      await resetGoalieDecisions(id);
      return;
    }

    const homeWon = home_score > away_score;
    const winningTeamId = homeWon ? home_team_id : away_team_id;
    const losingTeamId = homeWon ? away_team_id : home_team_id;
    const loserDecision = went_ot ? "OTL" : "L";

    await resetGoalieDecisions(id);

    await supabase
      .from("game_goalies")
      .update({ decision: "W" })
      .eq("game_id", id)
      .eq("team_id", winningTeamId);

    await supabase
      .from("game_goalies")
      .update({ decision: loserDecision })
      .eq("game_id", id)
      .eq("team_id", losingTeamId);
  }

  async function updateStatus(id, status) {
    const { data, error } = await supabase
      .from("games")
      .update({ status })
      .eq("id", id)
      .select(
        "id, home_team_id, away_team_id, home_score, away_score, went_ot, status, game_date, slug"
      )
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    setGames((cur) => cur.map((g) => (g.id === id ? data : g)));

    if (status === "final") {
      await applyGoalieDecisionsForFinalGame(data);
    } else {
      await resetGoalieDecisions(id);
    }
  }

  /* ---------------- RENDER ---------------- */

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
          {teams.map((t_) => (
            <option key={t_.id} value={t_.id}>
              {t_.name}
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

      {/* Create game */}
      {isLoggedIn && (
        <div className="gp-grid gp-create card">
          <input
            type="datetime-local"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="gp-input"
          />

          {/* 🆕 Season selector */}
          <select
            value={newSeasonId || ""}
            onChange={(e) => setNewSeasonId(e.target.value)}
            className="gp-input"
          >
            <option value="">{t("Season…")}</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={newHome}
            onChange={(e) => setNewHome(e.target.value)}
            className="gp-input"
          >
            <option value="">{t("Home team…")}</option>
            {teams.map((t_) => (
              <option key={t_.id} value={t_.id}>
                {t_.name}
              </option>
            ))}
          </select>

          <select
            value={newAway}
            onChange={(e) => setNewAway(e.target.value)}
            className="gp-input"
          >
            <option value="">{t("Away team…")}</option>
            {teams.map((t_) => (
              <option key={t_.id} value={t_.id}>
                {t_.name}
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
        <div className="gp-grid" style={{ gap: 12 }}>
          {filtered.map((g) => {
            const home = teamMap[g.home_team_id] || {};
            const away = teamMap[g.away_team_id] || {};
            const slug = g.slug || g.id;

            return (
              <div key={g.id} className="gp-grid gp-card card">
                <div className="gp-match">
                  <TeamChip team={away} />
                  <span className="gp-sub">{t("at")}</span>
                  <TeamChip team={home} />
                </div>

                <div className="gp-center">
                  <div className="gp-score">
                    {g.away_score} — {g.home_score}
                  </div>
                  <div className="gp-sub">{formatGameDate(g.game_date)}</div>
                  <div className="gp-sub">{g.status}</div>
                </div>

                <div className="gp-card-actions">
                  {isLoggedIn && !isMobile && (
                    <button
                      className="btn"
                      onClick={() => navigate(`/games/${slug}/live`)}
                    >
                      {t("Live")}
                    </button>
                  )}
                  {isLoggedIn && (
                    <button
                      className="btn"
                      onClick={() => navigate(`/games/${slug}/roster`)}
                    >
                      {t("Roster")}
                    </button>
                  )}
                  <button
                    className="btn"
                    onClick={() => navigate(`/games/${slug}/boxscore`)}
                  >
                    {t("Boxscore")}
                  </button>
                  {isLoggedIn && (
                    <>
                      {g.status === "final" ? (
                        <button
                          className="btn"
                          onClick={() => updateStatus(g.id, "scheduled")}
                        >
                          {t("Open")}
                        </button>
                      ) : (
                        <button
                          className="btn"
                          onClick={() => updateStatus(g.id, "final")}
                        >
                          {t("Mark as Final")}
                        </button>
                      )}
                      <button
                        className="btn"
                        onClick={() => handleDelete(g.id)}
                        style={{ background: "crimson" }}
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
