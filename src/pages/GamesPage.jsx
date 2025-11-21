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

  function formatGameDate(s) {
    if (!s) return "";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s.replace("T", " ");
    return d.toLocaleString();
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

    // Convert local "datetime-local" value to UTC before storing to avoid drift later
    const gameDateUtc = new Date(newDate).toISOString();

    const slug = makeSlug(gameDateUtc, newHome, newAway);
    const payload = {
      game_date: gameDateUtc, // store UTC to keep what user picked
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
                  {/* Hide Live on mobile so you only edit live from desktop */}
                  {!isMobile && (
                    <button
                      className="btn"
                      onClick={() => navigate(`/games/${slug}/live`)}
                    >
                      {t("Live")}
                    </button>
                  )}
                  <button
                    className="btn"
                    onClick={() => navigate(`/games/${slug}/roster`)}
                  >
                    {t("Roster")}
                  </button>
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

  async function updateStatus(id, status) {
    const { data, error } = await supabase
      .from("games")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setGames((cur) => cur.map((g) => (g.id === id ? data : g)));
  }
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
