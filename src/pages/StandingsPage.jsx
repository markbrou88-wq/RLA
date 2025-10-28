import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
let useI18n; try { useI18n = require("../i18n").useI18n; } catch { useI18n = () => ({ t:(s)=>s }); }

export default function StandingsPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    // Uses your existing "standings_current" view
    const { data, error } = await supabase
      .from("standings_current")
      .select("team_id,name,gp,w,l,otl,pts,gf,ga,diff")
      .order("pts", { ascending: false })
      .order("diff", { ascending: false });
    if (!error) setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <h2 style={{marginBottom:12}}>{t("Standings")}</h2>
      {loading ? <div>{t("Loading…")}</div> : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>{t("Team")}</th>
                <th>{t("GP")}</th>
                <th>{t("W")}</th>
                <th>{t("L")}</th>
                <th>{t("OTL")}</th>
                <th>{t("PTS")}</th>
                <th>{t("GF")}</th>
                <th>{t("GA")}</th>
                <th>{t("Diff")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.team_id}>
                  <td>{r.name}</td>
                  <td>{r.gp}</td>
                  <td>{r.w}</td>
                  <td>{r.l}</td>
                  <td>{r.otl}</td>
                  <td>{r.pts}</td>
                  <td>{r.gf}</td>
                  <td>{r.ga}</td>
                  <td>{r.diff}</td>
                </tr>
              ))}
              {rows.length===0 && <tr><td colSpan={9} style={{opacity:.7}}>{t("No standings yet.")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
