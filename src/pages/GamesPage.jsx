import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";

let useI18n;
try { useI18n = require("../i18n").useI18n; } catch { useI18n = () => ({ t:(s)=>s }); }

export default function GamesPage() {
  const { t } = useI18n();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchGames() {
    setLoading(true);
    const { data, error } = await supabase
      .from("games")
      .select(`
        id, slug, game_date, status, home_score, away_score,
        home_team:teams!games_home_team_id_fkey(id, short_name, name, logo_url),
        away_team:teams!games_away_team_id_fkey(id, short_name, name, logo_url)
      `)
      .order("game_date", { ascending: false });
    if (!error) setGames(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchGames();
    const sub = supabase
      .channel("games-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, fetchGames)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, []);

  async function deleteGame(id) {
    if (!window.confirm(t("Delete this game permanently?"))) return;
    await supabase.from("events").delete().eq("game_id", id); // clean events first (optional)
    await supabase.from("game_rosters").delete().eq("game_id", id);
    await supabase.from("game_goalies").delete().eq("game_id", id);
    await supabase.from("games").delete().eq("id", id);
    fetchGames();
  }

  return (
    <div>
      <h2 style={{marginBottom:12}}>{t("Games")}</h2>
      {loading && <div>{t("Loading…")}</div>}
      {!loading && games.length === 0 && <div>{t("No games yet.")}</div>}

      {games.map((g) => (
        <div key={g.id} className="card" style={{marginBottom:10}}>
          <div className="row" style={{justifyContent:"space-between", alignItems:"center"}}>
            <div className="row" style={{gap:10, alignItems:"center"}}>
              {g.away_team?.logo_url && <img src={g.away_team.logo_url} alt="" className="team-logo" />}
              <strong>{g.away_team?.short_name}</strong>
              <span style={{opacity:.7}}>{t("at")}</span>
              <strong>{g.home_team?.short_name}</strong>
              {g.home_team?.logo_url && <img src={g.home_team.logo_url} alt="" className="team-logo" />}
            </div>
            <div className="row" style={{gap:12, alignItems:"center"}}>
              <span style={{fontSize:18}}>
                {(g.away_score ?? 0)} <span style={{opacity:.6}}>—</span> {(g.home_score ?? 0)}
              </span>
              <span className="kicker">{new Date(g.game_date).toLocaleString()}</span>
              <span className="tag">{g.status}</span>
              <Link className="btn" to={`/games/${g.slug}`}>{t("Live")}</Link>
              <Link className="btn" to={`/games/${g.slug}/boxscore`}>{t("Boxscore")}</Link>
              <button className="btn danger" onClick={() => deleteGame(g.id)}>{t("Delete")}</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
