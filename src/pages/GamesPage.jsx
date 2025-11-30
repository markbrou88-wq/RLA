// src/pages/GamesPage.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

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

  // detect mobile viewport
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 768px)");
    const handleChange = () => setIsMobile(mq.matches);

    handleChange(); // set initial value
    mq.addEventListener("change", handleChange);

    return () => {
      mq.removeEventListener("change", handleChange);
    };
  }, []);

  // check auth state once on mount
  React.useEffect(() => {
    let mounted = true;
    async function checkAuth() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          console.error(error);
        }
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

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);

      const [{ data: teamRows, error: e1 }, { data: gameRows, error: e2 }] =
        await Promise.all([
          supabase
            .from("teams")
            .select("id, name, short_name, logo_url")
            .order("name"),
          supabase
            .from("games")
            .select(
              "id, game_date, home_team_id, away_team_id, home_score, away_score, status, went_ot, slug"
            )
            .order("game_date", { ascending: false }),
        ]);

      if (e1 || e2) {
        console.error(e1 || e2);
        if (!cancelled) setLoading(false);
        return;
      }

      const map = Object.fromEntries(teamRows.map((t) => [t.id, t]));
      if (!cancelled) {
        setTeams(teamRows);
        setTeamMap(map);
        setGames(gameRows);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = games.filter((g) => {
    const d = (g.game_date || "").slice(0, 10); // date part of ISO timestamp
    if (filterDate && d !== filterDate) return false;
    if (filterTeam) {
      const matchEither =
        String(g.home_team_id) === String(filterTeam) ||
        String(g.away_team_id) === String(filterTeam);
      if (!matchEither) return false;
    }
    return true;
  });

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

  // Date/time formatter for timestamptz column
  function formatGameDate(value) {
    if (!value) return "";
    const d = new Date(value); // ISO timestamptz -> local time
    if (Number.isNaN(d.getTime())) return String(value);

    // You can tweak these options if you want a different format
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
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

    // newDate is a local "datetime-local" string (e.g. 2025-11-23T16:00)
    // Convert to UTC ISO string so timestamptz stores it correctly
    const gameDateUtc = new Date(newDate).toISOString();

    const slug = makeSlug(gameDateUtc, newHome, newAway);
    const payload = {
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

  /**
   * Helper: reset all goalies in a game back to ND (no decision).
   */
  async function resetGoalieDecisions(gameId) {
    const { error } = await supabase
      .from("game_goalies")
      .update({ decision: "ND" })
      .eq("game_id", gameId);

    if (error) {
      console.error("Error resetting goalie decisions:", error);
    }
  }

  /**
   * Helper: apply W / L / OTL to goalies for a finished game.
   * - Winner: decision = 'W'
   * - Loser:  decision = 'L' (or 'OTL' if went_ot = true)
   * If the score is tied, decisions are reset to 'ND'.
   */
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

    // If tied, just clear decisions.
    if (home_score === away_score) {
      await resetGoalieDecisions(id);
      return;
    }

    const homeWon = home_score > away_score;
    const winningTeamId = homeWon ? home_team_id : away_team_id;
    const losingTeamId = homeWon ? away_team_id : home_team_id;

    const loserDecision = went_ot ? "OTL" : "L";

    // First clear any previous decision so stats are consistent
    await resetGoalieDecisions(id);

    // Mark winners
    const { error: winErr } = await supabase
      .from("game_goalies")
      .update({ decision: "W" })
      .eq("game_id", id)
      .eq("team_id", winningTeamId);

    if (winErr) {
      console.error("Error setting winning goalie decision:", winErr);
    }

    // Mark losers
    const { error: loseErr } = await supabase
      .from("game_goalies")
      .update({ decision: loserDecision })
      .eq("game_id", id)
      .eq("team_id", losingTeamId);

    if (loseErr) {
      console.error("Error setting losing goalie decision:", loseErr);
    }
  }

  /**
   * Called when clicking "Mark as Final" or "Open".
   * - Updates the games.status field.
   * - If status becomes "final", automatically sets W/L/OTL for goalies.
   * - If status is changed away from "final", resets goalie decisions to ND.
   */
  async function updateStatus(id, status) {
    // Update the game status and get the full row back so we have scores.
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

    // Update UI state
    setGames((cur) => cur.map((g) => (g.id === id ? data : g)));

    // Apply / reset goalie decisions based on new status
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

      {/* Filters: Date + Team (matches either home or away) */}
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
            const statusLabel = g.status;
            const slug = g.slug || g.id;

            return (
              <div key={g.id} className="gp-grid gp-card card">
                {/* Matchup (away on the LEFT, home on the RIGHT) */}
                <div
                  className="gp-match"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    minWidth: 0,
                  }}
                >
                  <TeamChip team={away} />
                  <span className="gp-sub">{t("at")}</span>
                  <TeamChip team={home} />
                </div>

                {/* Score + date + status */}
                <div className="gp-center">
                  <div className="gp-score">
                    {g.away_score} — {g.home_score}
                  </div>
                  <div className="gp-sub">{formatGameDate(g.game_date)}</div>
                  <div className="gp-sub">{statusLabel}</div>
                </div>

                {/* Actions */}
                <div className="gp-card-actions">
                  {/* Live: only when logged in, and only on desktop */}
                  {isLoggedIn && !isMobile && (
                    <button
                      className="btn"
                      onClick={() => navigate(`/games/${slug}/live`)}
                    >
                      {t("Live")}
                    </button>
                  )}

                  {/* Roster: only when logged in */}
                  {isLoggedIn && (
                    <button
                      className="btn"
                      onClick={() => navigate(`/games/${slug}/roster`)}
                    >
                      {t("Roster")}
                    </button>
                  )}

                  {/* Boxscore: always visible */}
                  <button
                    className="btn"
                    onClick={() => navigate(`/games/${slug}/boxscore`)}
                  >
                    {t("Boxscore")}
                  </button>

                  {/* Admin-only actions (only when logged in):
                      - Open / Mark as Final
                      - Delete
                  */}
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
