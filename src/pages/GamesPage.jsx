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

    const { data, error } = await supabase.from("games").insert(payload).select().single();
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
    <div>
      <h2 style={{ margin: "8px 0 16px" }}>{t("Games")}</h2>

      {/* Filters: Date + Team (matches either home or away) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "170px 1fr auto",
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

        <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)} style={inputS}>
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
            const statusLabel = g.status;
            const slug = g.slug || g.id;

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
                {/* Matchup (away on the LEFT, home on the RIGHT) */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <TeamChip team={away} />
                  <span style={{ color: "#666" }}>{t("at")}</span>
                  <TeamChip team={home} />
                </div>

                {/* Score + date + status */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {g.away_score} — {g.home_score}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>{formatGameDate(g.game_date)}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>{statusLabel}</div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  {/* LIVE = interactive rink */}
                  <button onClick={() => navigate(`/games/${slug}/live`)}>{t("Live")}</button>

                  {/* ROSTER toggle page */}
                  <button onClick={() => navigate(`/games/${slug}/roster`)}>{t("Roster")}</button>

                  {/* BOXSCORE = read-only summary */}
                  <button onClick={() => navigate(`/games/${slug}/boxscore`)}>{t("Boxscore")}</button>

                  {/* Final/Open toggle */}
                  {g.status === "final" ? (
                    <button onClick={() => updateStatus(g.id, "scheduled")}>{t("Open")}</button>
                  ) : (
                    <button onClick={() => updateStatus(g.id, "final")}>{t("Mark as Final")}</button>
                  )}

                  {/* Delete */}
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
  const size = 28;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {team.logo_url ? (
        <img
          src={team.logo_url}
          alt={team.short_name || team.name || "team"}
          style={{ width: size, height: size, objectFit: "contain" }}
        />
      ) : (
        <span style={{ width: size }} />
      )}
      <span style={{ fontWeight: 700, fontSize: 16 }}>{team.name || "—"}</span>
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
