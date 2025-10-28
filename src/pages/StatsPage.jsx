import React from "react";
import { supabase } from "../supabaseClient";
let useI18n; try { useI18n = require("../i18n").useI18n; } catch { useI18n = () => ({ t:(s)=>s }); }

function TOI(seconds) {
  if (!seconds || seconds<=0) return "00:00";
  const m = Math.floor(seconds/60), s = seconds%60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

export default function StatsPage() {
  const { t } = useI18n();
  const [tab, setTab] = React.useState("skaters");
  const [skaters, setSkaters] = React.useState([]);
  const [goalies, setGoalies] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr("");
      try {
        if (tab==="skaters") {
          const { data, error } = await supabase
            .from("player_stats_current")
            .select("*")
            .order("pts", { ascending:false })
            .order("g", { ascending:false })
            .order("a", { ascending:false })
            .order("gp", { ascending:false });
          if (error) throw error;
          if (!cancelled) setSkaters(data||[]);
        } else {
          const { data, error } = await supabase
            .from("goalie_stats_current")
            .select("*")
            .order("sv_pct", { ascending:false, nullsFirst:true })
            .order("gaa", { ascending:true, nullsFirst:true })
            .order("toi_seconds", { ascending:false });
          if (error) throw error;
          if (!cancelled) setGoalies(data||[]);
        }
      } catch (e) { if (!cancelled) setErr(e.message||String(e)); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tab]);

  return (
    <div>
      <h2 style={{marginBottom:12}}>{t("Stats")}</h2>
      <div style={{display:"flex", gap:8, marginBottom:12}}>
        <button className={tab==="skaters"?"btn":"btn secondary"} onClick={()=>setTab("skaters")}>{t("Skaters")}</button>
        <button className={tab==="goalies"?"btn":"btn secondary"} onClick={()=>setTab("goalies")}>{t("Goalies")}</button>
      </div>
      {err && <div className="alert alert-error" style={{marginBottom:10}}>{err}</div>}
      {loading ? <div>{t("Loading…")}</div> : tab==="skaters" ? (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>{t("Player")}</th><th>{t("Team")}</th><th>{t("GP")}</th><th>{t("G")}</th><th>{t("A")}</th><th>{t("P")}</th>
              </tr>
            </thead>
            <tbody>
              {skaters.map(r=>(
                <tr key={r.player_id}>
                  <td>{r.player}</td>
                  <td>{r.team}</td>
                  <td>{r.gp}</td>
                  <td>{r.g}</td>
                  <td>{r.a}</td>
                  <td>{r.pts}</td>
                </tr>
              ))}
              {skaters.length===0 && <tr><td colSpan={6} style={{opacity:.7}}>{t("No stats yet.")}</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>{t("Goalie")}</th><th>{t("Team")}</th><th>{t("SA")}</th><th>{t("GA")}</th><th>{t("SV%")}</th><th>{t("GAA")}</th><th>{t("TOI")}</th><th>{t("W")}</th><th>{t("L")}</th><th>{t("OTL")}</th><th>{t("SO")}</th>
              </tr>
            </thead>
            <tbody>
              {goalies.map(g=>(
                <tr key={g.player_id}>
                  <td>{g.goalie}</td>
                  <td>{g.team}</td>
                  <td>{g.sa}</td>
                  <td>{g.ga}</td>
                  <td>{g.sv_pct!=null ? (typeof g.sv_pct==="number"? g.sv_pct.toFixed(1): g.sv_pct) : "—"}</td>
                  <td>{g.gaa!=null ? (typeof g.gaa==="number"? g.gaa.toFixed(2): g.gaa) : "—"}</td>
                  <td>{TOI(g.toi_seconds)}</td>
                  <td>{g.wins}</td><td>{g.losses}</td><td>{g.otl}</td><td>{g.so}</td>
                </tr>
              ))}
              {goalies.length===0 && <tr><td colSpan={11} style={{opacity:.7}}>{t("No stats yet.")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
