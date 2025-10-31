// src/pages/RosterPage.jsx
import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getGameBySlug } from "../lib/db.js";
import { supabase } from "../supabaseClient.js";

export default function RosterPage() {
  const { slug } = useParams();
  const [game, setGame] = useState(null);
  const [rosterMap, setRosterMap] = useState(new Map()); // `${team_id}:${player_id}` -> row
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);

  useEffect(() => {
    (async () => {
      const g = await getGameBySlug(slug);
      setGame(g);
      await load(g.id, g.home_team_id, g.away_team_id);
    })();
  }, [slug]);

  async function load(gameId, homeId, awayId) {
    const [{ data: rp }, { data: hp }, { data: ap }] = await Promise.all([
      supabase.from("game_rosters").select("*").eq("game_id", gameId),
      supabase.from("players").select("*").eq("team_id", homeId).order("number"),
      supabase.from("players").select("*").eq("team_id", awayId).order("number"),
    ]);
    setRosterMap(new Map((rp || []).map((r) => [`${r.team_id}:${r.player_id}`, r])));
    setHomePlayers(hp || []);
    setAwayPlayers(ap || []);
  }

  async function togglePlayed(teamId, player) {
    const key = `${teamId}:${player.id}`;
    const existing = rosterMap.get(key);

    if (!existing) {
      const { data, error } = await supabase
        .from("game_rosters")
        .insert({ game_id: game.id, team_id: teamId, player_id: player.id, dressed: true })
        .select()
        .single();
      if (error) return alert(error.message);
      setRosterMap((m) => new Map(m).set(key, data));
    } else {
      const { data, error } = await supabase
        .from("game_rosters")
        .update({ dressed: !existing.dressed })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) return alert(error.message);
      setRosterMap((m) => new Map(m).set(key, data));
    }
  }

  if (!game) return null;

  return (
    <div className="container">
      <div className="button-group" style={{ marginBottom: 12 }}>
        <Link className="btn btn-grey" to={`/games/${slug}/live`}>Live</Link>
        <Link className="btn btn-grey" to={`/games/${slug}`}>Boxscore</Link>
        <Link className="btn btn-grey" to="/games">Back to Games</Link>
      </div>

      <h2>Roster</h2>
      <p className="muted">{game.home?.name} vs {game.away?.name}</p>

      <div className="grid-two">
        <RosterColumn
          title={game.home?.name ?? "Home"}
          teamId={game.home_team_id}
          players={homePlayers}
          rosterMap={rosterMap}
          onToggle={togglePlayed}
        />
        <RosterColumn
          title={game.away?.name ?? "Away"}
          teamId={game.away_team_id}
          players={awayPlayers}
          rosterMap={rosterMap}
          onToggle={togglePlayed}
        />
      </div>
    </div>
  );
}

function RosterColumn({ title, teamId, players, rosterMap, onToggle }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="chips-wrap">
        {players.map((p) => {
          const row = rosterMap.get(`${teamId}:${p.id}`);
          const on = !!row?.dressed;
          return (
            <button
              key={p.id}
              className={`chip ${on ? "chip-on" : ""}`}
              title="Toggle played"
              onClick={() => onToggle(teamId, p)}
            >
              #{p.number} {p.name} {on ? "• played" : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
