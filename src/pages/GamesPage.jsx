// src/pages/GamesPage.jsx
import React from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import { supabase } from "../supabaseClient.js";

function TeamChip({ team }) {
  if (!team) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {team.logo_url ? (
        <img
          src={team.logo_url}
          alt={team.name}
          width={20}
          height={20}
          style={{ objectFit: "contain", borderRadius: 4 }}
        />
      ) : null}
      <span>{team.name}</span>
    </span>
  );
}

function GameRow({ g, onDelete, onToggleStatus, canEdit }) {
  const label =
    g.status === "final" || g.status === "final_so" ? "Reopen" : "Mark Final / SO";

  return (
    <tr>
      <td style={{ padding: "8px" }}>{dayjs(g.game_date).format("YYYY-MM-DD")}</td>
      <td style={{ padding: "8px" }}>
        <TeamChip team={g.home_team} />
        <span style={{ opacity: 0.6, margin: "0 8px" }}>vs</span>
        <TeamChip team={g.away_team} />
      </td>
      <td style={{ padding: "8px" }}>
        {g.home_score}–{g.away_score} {g.status === "final_so" ? "(SO)" : ""}
      </td>
      <td style={{ padding: "8px" }}>{g.status}</td>
      <td style={{ padding: "8px" }}>
        <Link to={`/games/${g.slug}`}>Open</Link>
        {(g.status === "final" || g.status === "final_so") && (
          <>
            {" · "}
            <Link to={`/games/${g.slug}/boxscore`}>Boxscore</Link>
          </>
        )}
      </td>
      <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
        {canEdit && (
          <>
            <button onClick={() => onToggleStatus(g)} style={{ marginRight: 6 }}>
              {label}
            </button>
            <button onClick={() => onDelete(g.id)}>Delete</button>
          </>
        )}
      </td>
    </tr>
  );
}

export default function GamesPage() {
  const [games, setGames] = React.useState([]);
  const [teams, setTeams] = React.useState([]);
  const [form, setForm] = React.useState({ date: "", home: "", away: "" });
  const [loading, setLoading] = React.useState(true);
  const [user, setUser] = React.useState(null);

  // auth state (only signed-in can create/toggle/delete)
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);

    // include logos for both teams
    const { data: g, error: ge } = await supabase
      .from("games")
      .select(`
        *,
        home_team:teams!games_home_team_id_fkey ( id, name, logo_url, short_name ),
        away_team:teams!games_away_team_id_fkey ( id, name, logo_url, short_name )
      `)
      .order("game_date", { ascending: false });

    if (ge) {
      console.error(ge);
      alert(ge.message);
    } else {
      setGames(g || []);
    }

    // teams for the create form (text-only select)
    const { data: t, error: te } = await supabase
      .from("teams")
      .select("id, name, short_name")
      .order("name", { ascending: true });
    if (te) {
      console.error(te);
      alert(te.message);
    } else {
      setTeams(t || []);
    }

    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const createGame = async (e) => {
    e.preventDefault();
    if (!form.date || !form.home || !form.away) {
      alert("Pick a date, home team, and away team.");
      return;
    }
    if (form.home === form.away) {
      alert("Home and away teams must be different.");
      return;
    }

    const slug = `${dayjs(form.date).format("YYYYMMDD")}-${form.home}-${form.away}`;
    const { error } = await supabase.from("games").insert({
      game_date: form.date,
      home_team_id: Number(form.home),
      away_team_id: Number(form.away),
      home_score: 0,
      away_score: 0,
      status: "scheduled",
      slug,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setForm({ date: "", home: "", away: "" });
    load();
  };

  const deleteGame = async (id) => {
    if (!confirm("Delete this game?")) return;
    const { error } = await supabase.from("games").delete().eq("id", id);
    if (error) alert(error.message);
    else load();
  };

  // scheduled → final → final_so → scheduled
  const toggleStatus = async (g) => {
    let newStatus;
    if (g.status === "scheduled") newStatus = "final";
    else if (g.status === "final") newStatus = "final_so";
    else newStatus = "scheduled";

    const { error } = await supabase
      .from("games")
      .update({ status: newStatus })
      .eq("id", g.id);

    if (error) {
      alert(error.message);
      return;
    }
    load(); // Standings & Stats auto-refresh via their realtime listeners
  };

  return (
    <div>
      <h2>Games</h2>

      {user ? (
        <form
          onSubmit={createGame}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr auto",
            gap: 8,
            marginBottom: 16,
            alignItems: "center",
          }}
        >
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
          />
          <select
            value={form.home}
            onChange={(e) => setForm((p) => ({ ...p, home: e.target.value }))}
          >
            <option value="">Home team…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={form.away}
            onChange={(e) => setForm((p) => ({ ...p, away: e.target.value }))}
          >
            <option value="">Away team…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="submit">Create</button>
        </form>
      ) : (
        <p style={{ color: "#666", marginBottom: 16 }}>
          Sign in (top of page) to create, toggle, or delete games.
        </p>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {["Date", "Matchup", "Score", "Status", "", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #ddd",
                      padding: "8px",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <GameRow
                  key={g.id}
                  g={g}
                  onDelete={deleteGame}
                  onToggleStatus={toggleStatus}
                  canEdit={!!user}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button onClick={load} style={{ marginTop: 12 }}>
        Refresh
      </button>
    </div>
  );
}
