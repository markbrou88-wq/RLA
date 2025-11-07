// src/pages/GamesPage.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function GamesPage() {
  const navigate = useNavigate();

  const [games, setGames] = React.useState([]);
  const [teams, setTeams] = React.useState([]);

  // filters (date OR single team that matches either side)
  const [filterDate, setFilterDate] = React.useState("");
  const [filterTeam, setFilterTeam] = React.useState("");

  // create game state
  const [newDate, setNewDate] = React.useState("");   // yyyy-MM-dd
  const [newTime, setNewTime] = React.useState("");   // HH:mm
  const [newHome, setNewHome] = React.useState("");
  const [newAway, setNewAway] = React.useState("");

  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data: t }, { data: g }] = await Promise.all([
        supabase.from("teams").select("id, name, short_name, logo_url"),
        supabase
          .from("games")
          .select(
            "id, slug, game_date, home_team_id, away_team_id, home_score, away_score, status"
          )
          .order("game_date", { ascending: false }),
      ]);
      if (cancelled) return;
      setTeams(t || []);
      setGames(g || []);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const teamsById = React.useMemo(
    () => new Map(teams.map((x) => [x.id, x])),
    [teams]
  );

  const filtered = React.useMemo(() => {
    return games.filter((g) => {
      // date filter (matches same yyyy-MM-dd as local)
      if (filterDate) {
        const d = new Date(g.game_date);
        const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(d.getDate()).padStart(2, "0")}`;
        if (local !== filterDate) return false;
      }
      // team filter (match either home or away)
      if (filterTeam) {
        if (String(g.home_team_id) !== filterTeam && String(g.away_team_id) !== filterTeam) {
          return false;
        }
      }
      return true;
    });
  }, [games, filterDate, filterTeam]);

  async function handleCreateGame(e) {
    e.preventDefault();
    if (!newDate || !newTime || !newHome || !newAway) return;

    // Build a Date from local inputs & normalize so the stored timestamp
    // equals exactly what was picked (no timezone shift on save).
    const local = new Date(`${newDate}T${newTime}:00`);
    const utcIso = new Date(
      local.getTime() - local.getTimezoneOffset() * 60000
    ).toISOString();

    const { data, error } = await supabase
      .from("games")
      .insert({
        game_date: utcIso,
        home_team_id: Number(newHome),
        away_team_id: Number(newAway),
        status: "scheduled",
      })
      .select()
      .single();

    if (!error && data) {
      // push into list at top
      setGames((prev) => [data, ...prev]);
      // clear form
      setNewDate("");
      setNewTime("");
      setNewHome("");
      setNewAway("");
    }
  }

  async function handleDelete(id) {
    const { error } = await supabase.from("games").delete().eq("id", id);
    if (!error) setGames((prev) => prev.filter((g) => g.id !== id));
  }

  async function markFinal(id) {
    const { data, error } = await supabase
      .from("games")
      .update({ status: "final" })
      .eq("id", id)
      .select()
      .single();
    if (!error && data) {
      setGames((prev) => prev.map((g) => (g.id === id ? data : g)));
    }
  }

  function teamCell(tid, alignRight = false) {
    const t = teamsById.get(tid);
    if (!t) return <span>—</span>;
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          justifyContent: alignRight ? "flex-end" : "flex-start",
        }}
      >
        {!alignRight && t.logo_url ? (
          <img
            src={t.logo_url}
            alt={t.short_name || t.name}
            style={{ width: 36, height: 36, objectFit: "contain" }}
          />
        ) : null}
        <div style={{ fontSize: 16, fontWeight: 600 }}>
          {t.short_name || t.name}
        </div>
        {alignRight && t.logo_url ? (
          <img
            src={t.logo_url}
            alt={t.short_name || t.name}
            style={{ width: 36, height: 36, objectFit: "contain" }}
          />
        ) : null}
      </div>
    );
  }

  function Score({ game }) {
    const d = new Date(game.game_date);
    const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const dateStr = d.toLocaleDateString();
    const isFinal = (game.status || "").toLowerCase() === "final";
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 2 }}>
          {game.away_score ?? 0} — {game.home_score ?? 0}
        </div>
        <div style={{ fontSize: 12, color: "#666" }}>
          {dateStr}, {timeStr}
        </div>
        <div style={{ fontSize: 12, color: isFinal ? "#0a8" : "#999" }}>
          {isFinal ? "final" : "scheduled"}
        </div>
      </div>
    );
  }

  if (loading) return <div>Loading…</div>;

  return (
    <div>
      <h2 style={{ margin: "4px 0 12px" }}>Games</h2>

      {/* Filter row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          style={inputS}
        />
        <select
          value={filterTeam}
          onChange={(e) => setFilterTeam(e.target.value)}
          style={inputS}
        >
          <option value="">Team…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.short_name || t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setFilterDate("");
            setFilterTeam("");
          }}
          style={btnS}
        >
          Clear
        </button>
      </div>

      {/* Create game */}
      <form
        onSubmit={handleCreateGame}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(120px, 1fr)) auto",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          style={inputS}
          required
        />
        <input
          type="time"
          value={newTime}
          onChange={(e) => setNewTime(e.target.value)}
          style={inputS}
          required
        />
        <select
          value={newAway}
          onChange={(e) => setNewAway(e.target.value)}
          style={inputS}
          required
        >
          <option value="">Away team…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.short_name || t.name}
            </option>
          ))}
        </select>
        <div style={{ alignSelf: "center", textAlign: "center", color: "#666" }}>
          @
        </div>
        <select
          value={newHome}
          onChange={(e) => setNewHome(e.target.value)}
          style={inputS}
          required
        >
          <option value="">Home team…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.short_name || t.name}
            </option>
          ))}
        </select>
        <button type="submit" style={btnPrimaryS}>
          Create
        </button>
      </form>

      {/* List */}
      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((g) => (
          <div
            key={g.id}
            style={{
              border: "1px solid #eee",
              borderRadius: 10,
              padding: 10,
              display: "grid",
              gridTemplateColumns: "1.4fr 0.8fr 1.4fr auto",
              alignItems: "center",
              gap: 10,
            }}
          >
            {/* Away (left) */}
            {teamCell(g.away_team_id, false)}

            {/* Score/time */}
            <Score game={g} />

            {/* Home (right) */}
            {teamCell(g.home_team_id, true)}

            {/* actions */}
            <div
              style={{
                display: "flex",
                gap: 6,
                justifySelf: "end",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                style={btnS}
                onClick={() => navigate(`/games/${g.slug}/live`)}
              >
                Live
              </button>
              <button
                type="button"
                style={btnS}
                onClick={() => navigate(`/games/${g.slug}/roster`)}
              >
                Roster
              </button>
              <button
                type="button"
                style={btnS}
                onClick={() => navigate(`/games/${g.slug}/boxscore`)}
              >
                Boxscore
              </button>
              <button
                type="button"
                style={btnS}
                onClick={() => navigate(`/games/${g.slug}`)}
              >
                Open
              </button>
              <button
                type="button"
                style={btnWarnS}
                onClick={() => handleDelete(g.id)}
              >
                Delete
              </button>
              <button
                type="button"
                style={btnS}
                onClick={() => markFinal(g.id)}
              >
                Mark as Final
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
const inputS = {
  height: 36,
  padding: "6px 10px",
  border: "1px solid #dcdfe6",
  borderRadius: 8,
  fontSize: 14,
};

const btnS = {
  height: 36,
  padding: "0 10px",
  border: "1px solid #dcdfe6",
  borderRadius: 8,
  background: "#f7f8fa",
  cursor: "pointer",
};

const btnPrimaryS = {
  ...btnS,
  background: "#2d6cdf",
  color: "#fff",
  borderColor: "#2d6cdf",
};

const btnWarnS = {
  ...btnS,
  background: "#ffebee",
  borderColor: "#ffcdd2",
  color: "#c62828",
};
