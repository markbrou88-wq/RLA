import React from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function GamesPage() {
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  const [teams, setTeams] = React.useState([]);
  const [games, setGames] = React.useState([]);

  // Filters & create fields
  const [filterDate, setFilterDate] = React.useState(""); // yyyy-mm-dd
  const [filterHome, setFilterHome] = React.useState("");
  const [filterAway, setFilterAway] = React.useState("");

  const [newDate, setNewDate] = React.useState("");
  const [newHomeId, setNewHomeId] = React.useState("");
  const [newAwayId, setNewAwayId] = React.useState("");

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      const [tRes, gRes] = await Promise.all([
        supabase.from("teams").select("id, name, short_name, logo_url").order("name", { ascending: true }),
        supabase
          .from("games")
          .select(`
            id, slug, game_date, status, home_score, away_score,
            home_team:teams!games_home_team_id_fkey(id, name, short_name, logo_url),
            away_team:teams!games_away_team_id_fkey(id, name, short_name, logo_url)
          `)
          .order("game_date", { ascending: false })
      ]);

      if (tRes.error) setErr(tRes.error.message);
      else setTeams(tRes.data || []);

      if (gRes.error) setErr(gRes.error.message);
      else setGames(gRes.data || []);

      setLoading(false);
    })();
  }, []);

  const reloadGames = async () => {
    const { data, error } = await supabase
      .from("games")
      .select(`
        id, slug, game_date, status, home_score, away_score,
        home_team:teams!games_home_team_id_fkey(id, name, short_name, logo_url),
        away_team:teams!games_away_team_id_fkey(id, name, short_name, logo_url)
      `)
      .order("game_date", { ascending: false });

    if (error) {
      setErr(error.message);
      return;
    }
    setGames(data || []);
  };

  const createGame = async () => {
    try {
      if (!newDate || !newHomeId || !newAwayId) {
        alert("Pick date, home team, and away team.");
        return;
      }
      if (newHomeId === newAwayId) {
        alert("Home and away cannot be the same team.");
        return;
      }
      const payload = {
        game_date: newDate,
        home_team_id: Number(newHomeId),
        away_team_id: Number(newAwayId),
        status: "scheduled"
      };
      const { error } = await supabase.from("games").insert(payload);
      if (error) throw error;
      setNewDate("");
      setNewHomeId("");
      setNewAwayId("");
      await reloadGames();
    } catch (e) {
      alert(e.message || "Create failed");
    }
  };

  const reopenGame = async (id) => {
    const { error } = await supabase.from("games").update({ status: "open" }).eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await reloadGames();
  };

  const deleteGame = async (id) => {
    if (!window.confirm("Delete this game? This cannot be undone.")) return;
    const { error } = await supabase.from("games").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await reloadGames();
  };

  const teamOpt = (t) => (
    <option key={t.id} value={t.id}>
      {t.short_name || t.name}
    </option>
  );

  // Filters
  const filtered = games.filter((g) => {
    if (filterDate && g.game_date !== filterDate) return false;
    if (filterHome && String(g.home_team?.id) !== String(filterHome)) return false;
    if (filterAway && String(g.away_team?.id) !== String(filterAway)) return false;
    return true;
  });

  if (loading) return <div className="container">Loading…</div>;
  return (
    <div className="container">
      <div className="row mb8">
        <h2 className="m0">Games</h2>
      </div>

      {err && <div style={{ color: "crimson", marginBottom: 8 }}>{err}</div>}

      {/* Filters & Create */}
      <div className="card">
        <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="kicker">Filter date</div>
            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          </div>

          <div>
            <div className="kicker">Home team</div>
            <select value={filterHome} onChange={(e) => setFilterHome(e.target.value)}>
              <option value="">All</option>
              {teams.map(teamOpt)}
            </select>
          </div>

          <div>
            <div className="kicker">Away team</div>
            <select value={filterAway} onChange={(e) => setFilterAway(e.target.value)}>
              <option value="">All</option>
              {teams.map(teamOpt)}
            </select>
          </div>

          <div className="flex-spacer" />

          <div className="kicker" style={{ width: "100%" }}>
            Create new game
          </div>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            title="Game date"
          />
          <select value={newHomeId} onChange={(e) => setNewHomeId(e.target.value)} title="Home team">
            <option value="">Home…</option>
            {teams.map(teamOpt)}
          </select>
          <select value={newAwayId} onChange={(e) => setNewAwayId(e.target.value)} title="Away team">
            <option value="">Away…</option>
            {teams.map(teamOpt)}
          </select>
          <button className="btn primary" onClick={createGame}>
            Create
          </button>
        </div>
      </div>

      {/* Games table */}
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 120 }}>Date</th>
              <th>Matchup</th>
              <th style={{ width: 90 }}>Score</th>
              <th style={{ width: 90 }}>Status</th>
              <th style={{ width: 240 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: "#888" }}>
                  No games found.
                </td>
              </tr>
            ) : (
              filtered.map((g) => (
                <tr key={g.id}>
                  <td>{g.game_date}</td>
                  <td>
                    {/* Away (left) vs Home (right) */}
                    <span style={{ whiteSpace: "nowrap" }}>
                      {/* away */}
                      {g.away_team?.logo_url && (
                        <img
                          src={g.away_team.logo_url}
                          alt=""
                          className="team-logo"
                          style={{ width: 18, height: 18, verticalAlign: "middle", marginRight: 6 }}
                        />
                      )}
                      <Link to={`/teams/${g.away_team?.id}`}>{g.away_team?.name}</Link>
                    </span>

                    <span style={{ color: "#777", margin: "0 8px" }}>vs</span>

                    <span style={{ whiteSpace: "nowrap" }}>
                      {/* home */}
                      {g.home_team?.logo_url && (
                        <img
                          src={g.home_team.logo_url}
                          alt=""
                          className="team-logo"
                          style={{ width: 18, height: 18, verticalAlign: "middle", marginRight: 6 }}
                        />
                      )}
                      <Link to={`/teams/${g.home_team?.id}`}>{g.home_team?.name}</Link>
                    </span>
                  </td>
                  <td>
                    {(g.home_score ?? 0)}–{(g.away_score ?? 0)}
                  </td>
                  <td>{g.status}</td>
                  <td>
                    {/* Only two links now */}
                    <Link to={`/games/${g.slug}`}>Open</Link>
                    {" · "}
                    <Link to={`/games/${g.slug}/boxscore`}>Boxscore</Link>

                    {/* Admin actions */}
                    {" · "}
                    <button className="btn" onClick={() => reopenGame(g.id)}>
                      Reopen
                    </button>
                    {" "}
                    <button className="btn" onClick={() => deleteGame(g.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
