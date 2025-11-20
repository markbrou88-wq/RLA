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
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);

  useEffect(() => {
    (async () => {
      const g = await getGameBySlug(slug);
      setGame(g);

      // Load players + existing roster rows
      await load(g.id, g.home_team_id, g.away_team_id);

      // Load team meta for logos (use any already attached first)
      const h = g.home ?? (await fetchTeam(g.home_team_id));
      const a = g.away ?? (await fetchTeam(g.away_team_id));
      setHomeTeam(h);
      setAwayTeam(a);
    })();
  }, [slug]);

  async function fetchTeam(teamId) {
    const { data } = await supabase
      .from("teams")
      .select("id,name,short_name,logo_url")
      .eq("id", teamId)
      .single();
    return data ?? null;
  }

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
    <div className="container roster-page">
      <div className="button-group" style={{ marginBottom: 12 }}>
        <Link className="btn btn-grey" to={`/games/${slug}/live`}>
          Live
        </Link>
        <Link className="btn btn-grey" to={`/games/${slug}`}>
          Boxscore
        </Link>
        <Link className="btn btn-grey" to="/games">
          Back to Games
        </Link>
      </div>

      <h2>Roster</h2>
      <p className="muted">
        {awayTeam?.name ?? game.away?.name ?? "Away"} vs{" "}
        {homeTeam?.name ?? game.home?.name ?? "Home"}
      </p>

      {/* Side-by-side on desktop, stacked on small screens */}
      <div className="roster-grid">
        {/* Away column (left) */}
        <RosterColumn
          title={awayTeam?.name ?? game.away?.name ?? "Away"}
          logo={awayTeam?.logo_url ?? game.away?.logo_url}
          teamId={game.away_team_id}
          players={awayPlayers}
          rosterMap={rosterMap}
          onToggle={togglePlayed}
          teamTint={teamTint(awayTeam?.name ?? game.away?.name)}
        />

        {/* Home column (right) */}
        <RosterColumn
          title={homeTeam?.name ?? game.home?.name ?? "Home"}
          logo={homeTeam?.logo_url ?? game.home?.logo_url}
          teamId={game.home_team_id}
          players={homePlayers}
          rosterMap={rosterMap}
          onToggle={togglePlayed}
          teamTint={teamTint(homeTeam?.name ?? game.home?.name)}
        />
      </div>
    </div>
  );
}

function teamTint(name = "") {
  const n = name.toLowerCase();
  if (n.includes("black")) {
    return { base: "#111111", text: "#ffffff" }; // Black
  }
  if (n.includes("blue")) {
    return { base: "#2563eb", text: "#ffffff" }; // Blue 600
  }
  if (n.includes("red")) {
    return { base: "#dc2626", text: "#ffffff" }; // Red 600
  }
  // fallback neutral
  return { base: "#334155", text: "#ffffff" }; // slate-700
}

function RosterColumn({
  title,
  logo,
  teamId,
  players,
  rosterMap,
  onToggle,
  teamTint,
}) {
  return (
    <div className="card roster-column">
      <div className="roster-header">
        {logo ? (
          <img
            src={logo}
            alt={`${title} logo`}
            className="roster-logo"
          />
        ) : null}
        <h3 className="roster-title">{title}</h3>
      </div>

      <div className="chips-wrap">
        {players.map((p) => {
          const row = rosterMap.get(`${teamId}:${p.id}`);
          const on = !!row?.dressed;
          return (
            <button
              key={p.id}
              onClick={() => onToggle(teamId, p)}
              title="Toggle dressed"
              className="chip roster-chip"
              style={{
                border: `1px solid ${on ? teamTint.base : "#e5e7eb"}`,
                background: on ? teamTint.base : "#ffffff",
                color: on ? teamTint.text : "#111827",
              }}
            >
              #{p.number} {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
