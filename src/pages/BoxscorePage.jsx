import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
let useI18n; try { useI18n = require("../i18n").useI18n; } catch { useI18n = () => ({ t:(s)=>s }); }

export default function BoxscorePage() {
  const { t } = useI18n();
  const { slug } = useParams();
  const [game, setGame] = useState(null);
  const [events, setEvents] = useState([]);
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);
  const [homeRoster, setHomeRoster] = useState([]);
  const [awayRoster, setAwayRoster] = useState([]);
  const [goalies, setGoalies] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: g } = await supabase
        .from("games")
        .select(`
          id, slug, game_date, status, home_score, away_score,
          home_team_id, away_team_id,
          home_team:teams!games_home_team_id_fkey(id, name, short_name, logo_url),
          away_team:teams!games_away_team_id_fkey(id, name, short_name, logo_url)
        `)
        .eq("slug", slug).maybeSingle();
      if (!g) return;
      setGame(g); setHomeTeam(g.home_team); setAwayTeam(g.away_team);

      const [{ data: evs }, { data: hr }, { data: ar }, { data: gs }] = await Promise.all([
        supabase.from("events").select("id,team_id,player_id,event,period,time_mmss").eq("game_id", g.id).order("period").order("time_mmss"),
        supabase.from("game_rosters").select("player_id").eq("game_id", g.id).eq("team_id", g.home_team_id),
        supabase.from("game_rosters").select("player_id").eq("game_id", g.id).eq("team_id", g.away_team_id),
        supabase.from("game_goalies").select("team_id,player_id,shots_against,goals_against").eq("game_id", g.id),
      ]);
      setEvents(evs||[]);
      setHomeRoster((hr||[]).map(x=>x.player_id));
      setAwayRoster((ar||[]).map(x=>x.player_id));
      setGoalies(gs||[]);
    })();
  }, [slug]);

  const [players, setPlayers] = useState({});
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("players").select("id,name,number,team_id");
      setPlayers(Object.fromEntries((data||[]).map(p => [p.id, p])));
    })();
  }, []);

  function nameOf(id) {
    const p = players[id];
    return p ? `#${p.number ?? "—"} ${p.name}` : `#${id}`;
    }

  if (!game) return <div>{t("Loading…")}</div>;

  const homeScore = events.filter(e => e.team_id===game.home_team_id && e.event==="goal").length;
  const awayScore = events.filter(e => e.team_id===game.away_team_id && e.event==="goal").length;

  return (
    <div>
      <div style={{ marginBottom: 8 }}><Link to="/games">← {t("Back to Games")}</Link></div>

      <div className="card" style={{marginBottom:10}}>
        <div className="row" style={{justifyContent:"space-between", alignItems:"center"}}>
          <div style={{width:"45%"}} className="row">
            {awayTeam?.logo_url && <img src={awayTeam.logo_url} alt="" className="team-logo" />}
            <strong>{awayTeam?.name}</strong>
          </div>
          <div style={{width:"10%", textAlign:"center", fontSize:28}}>
            {awayScore} <span style={{opacity:.6}}>vs</span> {homeScore}
          </div>
          <div style={{width:"45%", textAlign:"right"}} className="row">
            <strong>{homeTeam?.name}</strong>
            {homeTeam?.logo_url && <img src={homeTeam.logo_url} alt="" className="team-logo" />}
          </div>
        </div>
      </div>

      {/* Rosters */}
      <div className="row" style={{gap:16, flexWrap:"wrap"}}>
        <div className="card" style={{flex:"1 1 420px"}}>
          <h3 className="m0">{awayTeam?.short_name} {t("Roster")}</h3>
          <ul style={{marginTop:8}}>
            {awayRoster.length===0 && <li style={{opacity:.7}}>{t("No players selected.")}</li>}
            {awayRoster.map(pid => <li key={pid}>{nameOf(pid)}</li>)}
          </ul>
        </div>
        <div className="card" style={{flex:"1 1 420px"}}>
          <h3 className="m0">{homeTeam?.short_name} {t("Roster")}</h3>
          <ul style={{marginTop:8}}>
            {homeRoster.length===0 && <li style={{opacity:.7}}>{t("No players selected.")}</li>}
            {homeRoster.map(pid => <li key={pid}>{nameOf(pid)}</li>)}
          </ul>
        </div>
      </div>

      {/* Events */}
      <div className="card" style={{marginTop:12}}>
        <h3 className="m0">{t("Events")}</h3>
        {events.length===0 ? <div style={{opacity:.7, paddingTop:8}}>{t("No events yet.")}</div> : (
          <div style={{overflowX:"auto", marginTop:8}}>
            <table>
              <thead>
                <tr>
                  <th>{t("Period")}</th>
                  <th>{t("Time")}</th>
                  <th>{t("Team")}</th>
                  <th>{t("Type")}</th>
                  <th>{t("Player")}</th>
                </tr>
              </thead>
              <tbody>
                {events.map(e=>{
                  const team = e.team_id===game.home_team_id ? homeTeam : awayTeam;
                  return (
                    <tr key={e.id}>
                      <td>{e.period}</td>
                      <td>{e.time_mmss}</td>
                      <td>{team?.short_name}</td>
                      <td>{e.event}</td>
                      <td>{e.player_id ? nameOf(e.player_id) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Goalies quick block */}
      <div className="card" style={{marginTop:12}}>
        <h3 className="m0">{t("Goalies")}</h3>
        {goalies.length===0 ? <div style={{opacity:.7, paddingTop:8}}>{t("No goalie stats yet.")}</div> : (
          <div style={{overflowX:"auto", marginTop:8}}>
            <table>
              <thead>
                <tr>
                  <th>{t("Team")}</th>
                  <th>{t("Goalie")}</th>
                  <th>{t("SA")}</th>
                  <th>{t("GA")}</th>
                </tr>
              </thead>
              <tbody>
                {goalies.map(g=>{
                  const tm = g.team_id===game.home_team_id ? homeTeam : awayTeam;
                  return (
                    <tr key={`${g.team_id}-${g.player_id}`}>
                      <td>{tm?.short_name}</td>
                      <td>{nameOf(g.player_id)}</td>
                      <td>{g.shots_against ?? 0}</td>
                      <td>{g.goals_against ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
