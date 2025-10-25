import React from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient.js";

function Table({ headers, rows }) {
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ borderCollapse:"collapse", width:"100%" }}>
        <thead>
          <tr>
            {headers.map(h=>(
              <th key={h} style={{ textAlign:"left", padding:"8px", borderBottom:"1px solid #ddd" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} style={{ padding:8, color:"#777" }}>—</td></tr>
          ) : rows.map((r,i)=>(
            <tr key={i}>
              {r.map((c,j)=>(
                <td key={j} style={{ padding:"8px", borderBottom:"1px solid #f3f3f3" }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StatsPage() {
  const [skaters, setSkaters] = React.useState([]);
  const [goalies, setGoalies] = React.useState([]);
  const [teams, setTeams] = React.useState({});
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);

    const teamsQ   = supabase.from("teams").select("id, short_name, logo_url");
    const skatersQ = supabase.from("player_stats_current")
      .select("player_id, player_name, team_id, team_name, gp, goals, assists, points, pim")
      .order("points", { ascending:false });
    const goaliesQ = supabase.from("goalie_stats_current")
      .select("player_id, player_name, team_id, team_name, gp, gs, w, l, otl, so, sa, ga, sv, sv_pct, toi_seconds, gaa")
      .order("sv_pct", { ascending:false });

    const [{ data: t }, { data: s }, { data: g }] =
      await Promise.all([teamsQ, skatersQ, goaliesQ]);

    setTeams(Object.fromEntries((t||[]).map(x=>[x.id, x])));
    setSkaters(s||[]);
    setGoalies(g||[]);
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Realtime refresh when games finalize
  React.useEffect(() => {
    const ch = supabase
      .channel("stats-refresh")
      .on("postgres_changes", { event: "*", schema:"public", table:"games" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  if (loading) return <p>Loading stats…</p>;

  return (
    <div>
      <h2>Stats</h2>

      {/* Skaters */}
      <h3>Skaters</h3>
      <Table
        headers={["Player","Team","GP","G","A","P","PIM"]}
        rows={(skaters||[]).map(s=>{
          const t = teams[s.team_id] || {};
          return [
            s.player_name,
            t.short_name || s.team_name,
            s.gp, s.goals, s.assists, s.points, s.pim
          ];
        })}
      />

      {/* Goalies */}
      <h3 style={{ marginTop: 24 }}>Goalies</h3>
      <Table
        headers={["Goalie","Team","GP","GS","W","L","OTL","SO","SA","GA","SV","SV%","GAA","TOI"]}
        rows={(goalies||[]).map(g=>{
          const t = teams[g.team_id] || {};
          const svp = (g.sv_pct == null) ? "" : g.sv_pct.toFixed(3);
          const toi = (()=>{ const m=Math.floor((g.toi_seconds||0)/60), s=(g.toi_seconds||0)%60; return `${m}:${String(s).padStart(2,"0")}`; })();
          return [
            g.player_name,
            t.short_name || g.team_name,
            g.gp, g.gs, g.w, g.l, g.otl, g.so, g.sa, g.ga, g.sv, svp, g.gaa ?? "", toi
          ];
        })}
      />
    </div>
  );
}
