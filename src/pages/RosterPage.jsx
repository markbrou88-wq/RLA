// src/pages/RosterPage.jsx
import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getGameBySlug } from "../lib/db";
import { supabase } from "../supabaseClient";

export default function RosterPage() {
  const { slug } = useParams();
  const [game, setGame] = useState(null);
  const [rosters, setRosters] = useState([]);
  const [goalies, setGoalies] = useState([]);

  useEffect(() => {
    (async () => {
      const g = await getGameBySlug(slug);
      setGame(g);
      await load(g.id);
    })();
  }, [slug]);

  async function load(gameId) {
    const { data: r1 } = await supabase.from("game_rosters").select("*").eq("game_id", gameId).order("team_id, player_id");
    const { data: g1 } = await supabase.from("game_goalies").select("*").eq("game_id", gameId).order("team_id");
    setRosters(r1 || []);
    setGoalies(g1 || []);
  }

  async function toggleDressed(row) {
    const { data, error } = await supabase.from("game_rosters").update({ dressed: !row.dressed }).eq("id", row.id).select().single();
    if (!error) setRosters(prev => prev.map(r => (r.id === row.id ? data : r)));
  }

  async function setActiveGoalie(teamId, goalieRow) {
    await supabase.from("game_goalies").update({ started: false }).eq("game_id", goalieRow.game_id).eq("team_id", teamId);
    const { data } = await supabase.from("game_goalies").update({ started: true }).eq("id", goalieRow.id).select().single();
    setGoalies(prev => prev.map(g => g.team_id === teamId ? (g.id === data.id ? data : { ...g, started: false }) : g));
  }

  if (!game) return null;

  const homeRoster = rosters.filter(r => r.team_id === game.home_team_id);
  const awayRoster = rosters.filter(r => r.team_id === game.away_team_id);
  const homeGoalies = goalies.filter(g => g.team_id === game.home_team_id);
  const awayGoalies = goalies.filter(g => g.team_id === game.away_team_id);

  return (
    <div className="container">
      <div className="button-group" style={{ marginBottom: 12 }}>
        <Link className="btn btn-grey" to={`/games/${slug}/live`}>Live</Link>
        <Link className="btn btn-grey" to={`/games/${slug}`}>Boxscore</Link>
      </div>

      <h2>Roster</h2>
      <p className="muted">{game.home?.name} vs {game.away?.name}</p>

      <div className="grid-two">
        <TeamRosterBlock
          title={game.home?.name ?? "Home"}
          roster={homeRoster}
          goalies={homeGoalies}
          onToggle={toggleDressed}
          onSetActive={(row) => setActiveGoalie(game.home_team_id, row)}
        />
        <TeamRosterBlock
          title={game.away?.name ?? "Away"}
          roster={awayRoster}
          goalies={awayGoalies}
          onToggle={toggleDressed}
          onSetActive={(row) => setActiveGoalie(game.away_team_id, row)}
        />
      </div>
    </div>
  );
}

function TeamRosterBlock({ title, roster, goalies, onToggle, onSetActive }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="mb-2">
        <strong>Active goalie: </strong>
        {goalies.length ? goalies.map(g => (
          <button key={g.id} className={`chip ${g.started ? "chip-active" : ""}`} onClick={() => onSetActive(g)}>
            #{g.player_id} {g.started ? "• active" : ""}
          </button>
        )) : <span className="muted">No goalie set</span>}
      </div>

      <div className="chips-wrap">
        {roster.map(r => (
          <button
            key={r.id}
            className={`chip ${r.dressed ? "chip-on" : ""}`}
            onClick={() => onToggle(r)}
            title="Toggle dressed"
          >
            #{r.player_id} {r.dressed ? "IN" : "OUT"}
          </button>
        ))}
      </div>
    </div>
  );
}
