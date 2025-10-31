// src/pages/GamesPage.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient.js";

function useMaybeI18n() {
  try { const { useI18n } = require("../i18n"); return useI18n(); }
  catch { return { t: (s) => s }; }
}

export default function GamesPage() {
  const { t } = useMaybeI18n();
  const navigate = useNavigate();

  const [teams, setTeams] = React.useState([]);
  const [teamMap, setTeamMap] = React.useState({});
  const [games, setGames] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const [filterDate, setFilterDate] = React.useState("");
  const [filterHome, setFilterHome] = React.useState("");
  const [filterAway, setFilterAway] = React.useState("");

  const [newDate, setNewDate] = React.useState("");
  const [newHome, setNewHome] = React.useState("");
  const [newAway, setNewAway] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const sortGames = (arr) => [...arr].sort((a,b)=>new Date(b.game_date||0)-new Date(a.game_date||0));
  const upsertGame = (row) => setGames(cur => {
    const m = new Map(cur.map(g=>[g.id,g])); m.set(row.id,{...(m.get(row.id)||{}),...row});
    return sortGames([...m.values()]);
  });

  React.useEffect(() => {
    let dead = false;
    (async () => {
      setLoading(true);
      const [{data:trows},{data:grows}] = await Promise.all([
        supabase.from("teams").select("id,name,short_name,logo_url").order("name"),
        supabase.from("games").select("id,game_date,home_team_id,away_team_id,home_score,away_score,status,went_ot,slug").order("game_date",{ascending:false})
      ]);
      if (dead) return;
      setTeams(trows||[]);
      setTeamMap(Object.fromEntries((trows||[]).map(t=>[t.id,t])));
      setGames(grows||[]);
      setLoading(false);
    })();
    return ()=>{dead=true};
  },[]);

  React.useEffect(()=>{
    const ch = supabase
      .channel("rt-games")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"games"},p=>upsertGame(p.new))
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"games"},p=>upsertGame(p.new))
      .on("postgres_changes",{event:"DELETE",schema:"public",table:"games"},p=>setGames(cur=>cur.filter(g=>g.id!==p.old.id)))
      .subscribe();
    return ()=>supabase.removeChannel(ch);
  },[]);

  const filtered = games.filter(g=>{
    const d=(g.game_date||"").slice(0,10);
    if (filterDate && d!==filterDate) return false;
    if (filterHome && String(g.home_team_id)!==String(filterHome)) return false;
    if (filterAway && String(g.away_team_id)!==String(filterAway)) return false;
    return true;
  });

  function makeSlug(dateIso, homeId, awayId){
    const d=(dateIso||"").slice(0,10).replaceAll("-","");
    const rand=Math.random().toString(36).slice(2,6);
    return `${d}-${homeId}-${awayId}-${rand}`;
  }

  async function handleCreate(){
    if(!newDate||!newHome||!newAway) return alert(t("Please fill date, home and away."));
    if(newHome===newAway) return alert(t("Home and away cannot be the same team."));
    setSaving(true);
    const { error } = await supabase.from("games").insert({
      game_date:newDate,home_team_id:+newHome,away_team_id:+newAway,
      home_score:0,away_score:0,status:"scheduled",went_ot:false,slug:makeSlug(newDate,newHome,newAway)
    });
    setSaving(false);
    if(error) return alert(error.message);
    // rely on realtime; no optimistic push (prevents double add)
    setNewDate(""); setNewHome(""); setNewAway("");
  }

  async function handleDelete(id){
    if(!window.confirm(t("Delete this game?"))) return;
    const { error } = await supabase.from("games").delete().eq("id",id);
    if (error) alert(error.message);
  }

  async function handleToggleFinal(id,isFinal){
    const { error } = await supabase.from("games").update({status: isFinal?"scheduled":"final"}).eq("id",id);
    if (error) alert(error.message);
  }

  return (
    <div>
      <h2 style={{margin:"8px 0 16px"}}>{t("Games")}</h2>

      {/* Filters */}
      <div style={{display:"grid",gridTemplateColumns:"170px 1fr 1fr auto",gap:10,alignItems:"center",marginBottom:12}}>
        <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)} style={inputS}/>
        <select value={filterHome} onChange={e=>setFilterHome(e.target.value)} style={inputS}>
          <option value="">{t("Team… (Home)")}</option>
          {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={filterAway} onChange={e=>setFilterAway(e.target.value)} style={inputS}>
          <option value="">{t("Team… (Away)")}</option>
          {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn secondary" onClick={()=>{setFilterDate("");setFilterHome("");setFilterAway("");}}>{t("Clear")}</button>
      </div>

      {/* Create */}
      <div className="card" style={{display:"grid",gridTemplateColumns:"170px 1fr 1fr auto",gap:10,alignItems:"center"}}>
        <input type="datetime-local" value={newDate} onChange={e=>setNewDate(e.target.value)} style={inputS}/>
        <select value={newHome} onChange={e=>setNewHome(e.target.value)} style={inputS}>
          <option value="">{t("Home team…")}</option>
          {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={newAway} onChange={e=>setNewAway(e.target.value)} style={inputS}>
          <option value="">{t("Away team…")}</option>
          {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn btn-blue" onClick={handleCreate} disabled={saving}>{saving?t("Creating…"):t("Create")}</button>
      </div>

      {/* List */}
      {loading ? (
        <div style={{padding:12}}>{t("Loading…")}</div>
      ) : filtered.length===0 ? (
        <div style={{padding:12}}>{t("No games match your filters.")}</div>
      ) : (
        <div style={{display:"grid",gap:12}}>
          {filtered.map(g=>{
            const home=teamMap[g.home_team_id]||{}, away=teamMap[g.away_team_id]||{};
            const d=new Date(g.game_date||""); const slug=g.slug||g.id; const isFinal=g.status==="final";
            return (
              <div key={g.id} className="card" style={{display:"grid",gridTemplateColumns:"1fr auto auto",alignItems:"center",gap:10}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <TeamChip team={home}/><span className="muted">{t("at")}</span><TeamChip team={away}/>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontWeight:700}}>{g.home_score} — {g.away_score}</div>
                  <div className="muted" style={{fontSize:12}}>{isNaN(d)?"":d.toLocaleString()}</div>
                  <div className="muted" style={{fontSize:12}}>{g.status}</div>
                </div>
                <div className="button-group">
                  <button className="btn btn-blue" onClick={()=>navigate(`/games/${slug}/live`)}>{t("Live")}</button>
                  <button className="btn btn-blue" onClick={()=>navigate(`/games/${slug}/roster`)}>{t("Roster")}</button>
                  <button
                    className={`btn ${isFinal?"btn-blue":"btn-disabled"}`}
                    disabled={!isFinal}
                    onClick={()=>isFinal && navigate(`/games/${slug}`)}
                    title={isFinal? t("Open boxscore"): t("Boxscore available when Final")}
                  >
                    {t("Boxscore")}
                  </button>
                  <button className={`btn ${isFinal?"btn-grey":"btn-green"}`} onClick={()=>handleToggleFinal(g.id,isFinal)}>
                    {isFinal?t("Open"):t("Mark as Final")}
                  </button>
                  <button className="btn btn-red" onClick={()=>handleDelete(g.id)}>{t("Delete")}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeamChip({team}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      {team.logo_url ? <img src={team.logo_url} alt={team.short_name||team.name||"team"} style={{width:22,height:22,objectFit:"contain"}}/> : <span style={{width:22}}/>}
      <span style={{fontWeight:600}}>{team.name||"—"}</span>
    </div>
  );
}
const inputS = {height:36,padding:"0 10px",borderRadius:8,border:"1px solid #ddd",outline:"none"};
