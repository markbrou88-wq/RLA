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
  the const [filterTeam, setFilterTeam] = React.useState("");

  // create form
  const [newDate, setNewDate] = React.useState("");
  const [newHome, setNewHome] = React.useState("");
  const [newAway, setNewAway] = React.useState("");
  const [saving, setSaving] = React.useState(false);

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
    <div className="gp-container">
      {/* Scoped responsive styles */}
      <style>{`
        .gp-container { padding: 8px; }
        .gp-h2 { margin: 8px 0 16px; }

        .gp-grid { display: grid; gap: 10px; }

        /* Filters row */
        .gp-filter {
          grid-template-columns: 170px 1fr auto;
          align-items: center;
          margin-bottom: 12px;
        }

        /* Create row */
        .gp-create {
          border: 1px solid #eee;
          border-radius: 10px;
          padding: 12px;
          grid-template-columns: 170px 1fr 1fr auto;
          align-items: center;
          margin-bottom: 16px;
        }

        /* Game card */
        .gp-card {
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 12px;
          grid-template-columns: 1fr auto auto;
          align-items: center;
        }
        .gp-card-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          flex-wrap: wrap;
        }

        .gp-team {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0; /* allow ellipsis */
        }
        .gp-team-name {
          font-weight: 700;
          font-size: 16px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .gp-score { font-weight: 800; font-size: 18px; }
        .gp-sub { font-size: 12px; color: #666; }

        .gp-logo {
          width: 28px;
          height: 28px;
          object-fit: contain;
          flex: 0 0 28px;
        }

        .gp-input {
          height: 36px;
          padding: 0 10px;
          border-radius: 8px;
          border: 1px solid #ddd;
          outline: none;
          width: 100%;
        }

        /* ---- Mobile (<= 640px) ---- */
        @media (max-width: 640px) {
          .gp-filter {
            grid-template-columns: 1fr 1fr;
            row-gap: 8px;
          }
          .gp-filter > *:last-child { grid-column: 1 / -1; }

          .gp-create {
            grid-template-columns: 1fr;
            row-gap: 8px;
          }
          .gp-create button { width: 100%; }

          .gp-card {
            grid-template-columns: 1fr;
            row-gap: 8px;
          }
          .gp-score { font-size: 20px; }
          .gp-team-name { font-size: 15px; }
          .gp-logo { width: 32px; height: 32px; } /* slightly bigger touch target */
          .gp-card-actions { justify-content: flex-start; }
          .gp-card-actions > button {
            min-height: 36px;
            padding: 8px 10px;
          }
        }
      `}</style>

      <h2 className="gp-h2">{t("Games")}</h2>

      {/* Filters: Date + Team (matches either home or away) */}
      <div className="gp-grid gp-filter">
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
          onClick={() => {
            setFilterDate("");
            setFilterTeam("");
          }}
        >
          {t("Clear")}
        </button>
      </div>

      {/* Create game */}
      <div className="gp-grid gp-create">
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

        <button onClick={handleCreate} disabled={saving}>
          {saving ? t("Creating…") : t("Create")}
        </button>
      </div>

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
              <div key={g.id} className="gp-grid gp-card">
                {/* Matchup (away on the LEFT, home on the RIGHT) */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <TeamChip team={away} />
                  <span className="gp-sub">{t("at")}</span>
                  <TeamChip team={home} />
                </div>

                {/* Score + date + status */}
                <div style={{ textAlign: "center" }}>
                  <div className="gp-score">
                    {g.away_score} — {g.home_score}
                  </div>
                  <div className="gp-sub">{formatGameDate(g.game_date)}</div>
                  <div className="gp-sub">{statusLabel}</div>
                </div>

                {/* Actions */}
                <div className="gp-card-actions">
                  <button onClick={() => navigate(`/games/${slug}/live`)}>{t("Live")}</button>
                  <button onClick={() => navigate(`/games/${slug}/roster`)}>{t("Roster")}</button>
                  <button onClick={() => navigate(`/games/${slug}/boxscore`)}>{t("Boxscore")}</button>
                  {g.status === "final" ? (
                    <button onClick={() => updateStatus(g.id, "scheduled")}>{t("Open")}</button>
                  ) : (
                    <button onClick={() => updateStatus(g.id, "final")}>{t("Mark as Final")}</button>
                  )}
                  <button
                    onClick={() => handleDelete(g.id)}
                    style={{
                      background: "crimson",
                      color: "white",
                      border: 0,
                      borderRadius: 6,
                      padding: "6px 10px",
                    }}
                  >
                    {t("Delete")}
                  </button>
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
