import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useParams, Link } from "react-router-dom";
let useI18n; try { useI18n = require("../i18n").useI18n; } catch { useI18n = () => ({ t:(s)=>s }); }

export default function TeamPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [position, setPosition] = useState("");

  useEffect(() => {
    (async () => {
      const { data: tm } = await supabase.from("teams").select("id,name,short_name,logo_url").eq("id", id).maybeSingle();
      setTeam(tm || null);
      const { data: pl } = await supabase.from("players").select("id,name,number,position").eq("team_id", id).order("number");
      setPlayers(pl || []);
    })();
  }, [id]);

  async function addPlayer(e) {
    e.preventDefault();
    const { error } = await supabase.from("players").insert({
      team_id: Number(id),
      name,
      number: number===""? null : Number(number),
      position: position || null,
    });
    if (error) return alert(error.message);
    setName(""); setNumber(""); setPosition("");
    const { data: pl } = await supabase.from("players").select("id,name,number,position").eq("team_id", id).order("number");
    setPlayers(pl || []);
  }

  async function removePlayer(pid) {
    if (!window.confirm(t("Delete this player?"))) return;
    await supabase.from("players").delete().eq("id", pid);
    setPlayers(p => p.filter(x => x.id !== pid));
  }

  if (!team) return <div>{t("Loading…")}</div>;

  return (
    <div>
      <div style={{ marginBottom: 8 }}><Link to="/games">← {t("Back to Games")}</Link></div>
      <div className="card">
        <div className="row" style={{gap:10, alignItems:"center"}}>
          {team.logo_url && <img src={team.logo_url} alt="" className="team-logo" />}
          <h2 className="m0">{team.name}</h2>
        </div>
      </div>

      <div className="card" style={{marginTop:12}}>
        <h3 className="m0">{t("Roster")}</h3>
        <form onSubmit={addPlayer} className="row" style={{gap:8, flexWrap:"wrap", marginTop:10}}>
          <input placeholder={t("Name")} value={name} onChange={e=>setName(e.target.value)} required />
          <input placeholder={t("Number")} value={number} onChange={e=>setNumber(e.target.value)} style={{width:90}} />
          <input placeholder={t("Position (e.g., C, D, G)") } value={position} onChange={e=>setPosition(e.target.value)} style={{width:160}} />
          <button className="btn" type="submit">{t("Add player")}</button>
        </form>

        <div style={{marginTop:10}}>
          {players.length===0 && <div style={{opacity:.7}}>{t("No players yet.")}</div>}
          {players.map(p=>(
            <div key={p.id} className="row" style={{justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid #eee"}}>
              <span>#{p.number ?? "—"} {p.name} ({p.position || "-"})</span>
              <button className="btn danger" onClick={()=>removePlayer(p.id)}>{t("Delete")}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
