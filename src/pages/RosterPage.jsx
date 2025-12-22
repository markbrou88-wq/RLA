import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
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
      // 🔹 Fetch game directly so we ALWAYS get season_id & category_id
      const { data: g, error } = await supabase
        .from("games")
        .select(
          `
          id,
          slug,
          season_id,
          category_id,
          home_team_id,
          away_team_id,
          home:teams!games_home_team_id_fkey(id,name,short_name,logo_url),
          away:teams!games_away_team_id_fkey(id,name,short_name,logo_url)
        `
        )
        .eq("slug", slug)
        .single();

      if (error) {
        console.error("Error loading game:", error);
        return;
      }

      setGame(g);

      setHomeTeam(g.home);
      setAwayTeam(g.away);

      await load(g);
    })();
  }, [slug]);

  
  async function load() {
    setLoading(true);
    try {
      const { data: g, error: gErr } = await supabase
        .from("games")
        .select("id, season_id, category_id, home_team_id, away_team_id")
        .eq("slug", slug)
        .single();

      if (gErr) throw gErr;
      setGame(g);

      const [homeNumsRes, awayNumsRes] = await Promise.all([
        supabase
          .from("team_players")
          .select("player_id, number")
          .eq("team_id", g.home_team_id)
          .eq("season_id", g.season_id)
          .eq("category_id", g.category_id)
          .eq("is_active", true),
        supabase
          .from("team_players")
          .select("player_id, number")
          .eq("team_id", g.away_team_id)
          .eq("season_id", g.season_id)
          .eq("category_id", g.category_id)
          .eq("is_active", true),
      ]);

      if (homeNumsRes.error) throw homeNumsRes.error;
      if (awayNumsRes.error) throw awayNumsRes.error;

      const homeNumMap = new Map((homeNumsRes.data || []).map((r) => [Number(r.player_id), r.number]));
      const awayNumMap = new Map((awayNumsRes.data || []).map((r) => [Number(r.player_id), r.number]));

      const { data, error } = await supabase
        .from("game_rosters")
        .select("team_id, player_id, dressed, players:player_id(id,name,position)")
        .eq("game_id", g.id);

      if (error) throw error;

      const rows = (data || []).map((r) => {
        const num =
          r.team_id === g.home_team_id
            ? homeNumMap.get(Number(r.player_id))
            : awayNumMap.get(Number(r.player_id));

        return { ...r, players: r.players ? { ...r.players, number: num ?? "" } : null };
      });

      setHomeRoster(rows.filter((r) => r.team_id === g.home_team_id));
      setAwayRoster(rows.filter((r) => r.team_id === g.away_team_id));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }


  async function togglePlayed(teamId, player) {
    const key = `${teamId}:${player.id}`;
    const existing = rosterMap.get(key);

    if (!existing) {
      const { data, error } = await supabase
        .from("game_rosters")
        .insert({
          game_id: game.id,
          team_id: teamId,
          player_id: player.id,
          dressed: true,
        })
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
    <div className="page">
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
          {awayTeam?.name ?? "Away"} vs {homeTeam?.name ?? "Home"}
        </p>

        <div className="roster-grid">
          <RosterColumn
            title={awayTeam?.name ?? "Away"}
            logo={awayTeam?.logo_url}
            teamId={game.away_team_id}
            players={awayPlayers}
            rosterMap={rosterMap}
            onToggle={togglePlayed}
            teamTint={teamTint(awayTeam?.name)}
          />

          <RosterColumn
            title={homeTeam?.name ?? "Home"}
            logo={homeTeam?.logo_url}
            teamId={game.home_team_id}
            players={homePlayers}
            rosterMap={rosterMap}
            onToggle={togglePlayed}
            teamTint={teamTint(homeTeam?.name)}
          />
        </div>
      </div>
    </div>
  );
}

function teamTint(name = "") {
  const n = name.toLowerCase();
  if (n.includes("black")) return { base: "#111111", text: "#ffffff" };
  if (n.includes("blue")) return { base: "#2563eb", text: "#ffffff" };
  if (n.includes("red")) return { base: "#dc2626", text: "#ffffff" };
  return { base: "#334155", text: "#ffffff" };
}

function RosterColumn({ title, logo, teamId, players, rosterMap, onToggle, teamTint }) {
  return (
    <div className="card roster-column">
      <div className="roster-header">
        {logo ? <img src={logo} alt={`${title} logo`} className="roster-logo" /> : null}
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
