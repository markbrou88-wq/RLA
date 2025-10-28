// src/pages/GamesPage.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

// Optional i18n hook, safe if you don't use it.
function useMaybeI18n() {
  try {
    // eslint-disable-next-line global-require
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
  const [teamMap, setTeamMap] = React.useState({}); // id -> team
  const [games, setGames] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  // filters
  const [filterDate, setFilterDate] = React.useState("");
  const [filterHome, setFilterHome] = React.useState("");
  const [filterAway, setFilterAway] = React.useState("");

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
          supabase.from("teams").select("id, name, short_name, logo_url").order("name"),
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

      const map = new Map(teamRows.map((t) => [t.id, t]));
      if (!cancelled) {
        setTeams(teamRows);
        setTeamMap(Object.fromEntries(map));
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
    if (filterHome && String(g.home_team_id) !== String(filterHome)) return false;
    if (filterAway && String(g.away_team_id) !== String(filterAway)) return false;
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

  // a lightweight slug generator; your DB can still override with a trigger if you have one
  function makeSlug(dateIso, homeId, awayId) {
    const d = (dateIso || "").slice(0, 10).replaceAll("-", "");
    const rand = Math.random().toString(36).slice(2, 6);
    return `${d}-${homeId}-${awayId}-${rand}`;
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
    const slug = makeSlug(newDate, newHome, newAway);
    const payload = {
      game_date: newDate,
      home_team_id: Number(newHome),
      away_team_id: Number(newAway),
      home_score: 0,
      away_score: 0,
      status: "scheduled",
      went_ot: false,
      slug,
    };

    const { data, error } = await supabase.from("games").insert(payload).select().single();
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setGames((cur) => [data, ...cur]);
    // reset form
    setNewDate("");
    setNewHome("");
    setNewAway("");
  }

  return (
    <div>
      <h2 style={{ margin: "8px 0 16px" }}>{t("Games")}</h2>

      {/* Filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "170px 1fr 1fr auto",
          gap: 10,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          style={inputS}
        />

        <select value={filterHome} onChange={(e) => setFilterHome(e.target.value)} style={inputS}>
          <option value="">{t("Team… (Home)")}</option>
          {teams.map((t_) => (
            <option key={t_.id} value={t_.id}>
              {t_.name}
            </option>
          ))}
        </select>

        <select value={filterAway} onChange={(e) => setFilterAway(e.target.value)} style={inputS}>
          <option value="">{t("Team… (Away)")}</option>
          {teams.map((t_) => (
            <option key={t_.id} value={t_.id}>
              {t_.name}
            </option>
          ))}
        </select>

        <button
          onClick={() => {
            setFilterDate("");
            setFilterHome("");
            setFilterAway("");
          }}
        >
          {t("Clear")}
        </button>
      </div>

      {/* Create game */}
      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
          display: "grid",
          gridTemplateColumns: "170px 1fr 1fr auto",
          gap: 10,
          alignItems: "center",
        }}
      >
        <input
          type="datetime-local"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          style={inputS}
        />

        <select value={newHome} onChange={(e) => setNewHome(e.target.value)} style={inputS}>
          <option value="">{t("Home team…")}</option>
          {teams.map((t_) => (
            <option key={t_.id} value={t_.id}>
              {t_.name}
            </option>
          ))}
        </select>

        <select value={newAway} onChange={(e) => setNewAway(e.target.value)} style={inputS}>
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
        <div style={{ display: "grid", gap: 12 }}>
          {filtered.map((g) => {
            const home = teamMap[g.home_team_id] || {};
            const away = teamMap[g.away_team_id] || {};
            const d = new Date(g.game_date || "");
            const statusLabel = g.status;

            return (
              <div
                key={g.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 12,
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {/* Matchup */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <TeamChip team={home} />
                  <span style={{ color: "#666" }}>{t("at")}</span>
                  <TeamChip team={away} />
                </div>

                {/* Score + date + status */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 700 }}>
                    {g.home_score} — {g.away_score}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {isNaN(d) ? "" : d.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>{statusLabel}</div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => navigate(`/games/${g.slug || g.id}`)}>{t("Live")}</button>
                  <button onClick={() => navigate(`/games/${g.slug || g.id}/boxscore`)}>
                    {t("Boxscore")}
                  </button>
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
}

function TeamChip({ team }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {team.logo_url ? (
        <img
          src={team.logo_url}
          alt={team.short_name || team.name || "team"}
          style={{ width: 22, height: 22, objectFit: "contain" }}
        />
      ) : (
        <span style={{ width: 22 }} />
      )}
      <span style={{ fontWeight: 600 }}>{team.name || "—"}</span>
    </div>
  );
}

const inputS = {
  height: 36,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  outline: "none",
};
