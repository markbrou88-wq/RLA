// src/pages/StatsPage.jsx
import React from "react";
import { supabase } from "../supabaseClient.js";

export default function StatsPage() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState("points"); // goals | assists | points | gp
  const [limit, setLimit] = React.useState(50);

  const load = React.useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("player_stats_current")
      .select("*");

    // Sorting (descending for stats)
    const sortCol = ["goals","assists","points"].includes(sort) ? sort : "points";
    query = query.order(sortCol, { ascending: false });

    const { data, error } = await query;
    if (error) console.error(error);
    setRows(data || []);
    setLoading(false);
  }, [sort]);

  React.useEffect(() => { load(); }, [load]);

  // Auto-refresh when games change (finalized etc.)
  React.useEffect(() => {
    const ch = supabase
      .channel("stats-auto-refresh")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const filtered = rows.filter(r =>
    r.player_name.toLowerCase().includes(search.toLowerCase()) ||
    r.team_name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, limit);

  return (
    <div>
      <h2>Stats</h2>

      <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:12}}>
        <input
          placeholder="Search player or team…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label>Sort by:</label>
        <select value={sort} onChange={e => setSort(e.target.value)}>
          <option value="points">Points</option>
          <option value="goals">Goals</option>
          <option value="assists">Assists</option>
          <option value="gp">Games Played</option>
        </select>
        <label>Show:</label>
        <select value={limit} onChange={e => setLimit(Number(e.target.value))}>
          <option value={25}>Top 25</option>
          <option value={50}>Top 50</option>
          <option value={100}>Top 100</option>
          <option value={100000}>All</option>
        </select>
        <button onClick={load}>Refresh</button>
      </div>

      {loading ? <p>Loading…</p> : (
        <div style={{overflowX:"auto"}}>
          <table style={{ borderCollapse:"collapse", width:"100%", minWidth:700 }}>
            <thead>
              <tr>
                {["Player","Team","GP","G","A","PTS","+ PIM"].map(h => (
                  <th key={h} style={{textAlign:"left", padding:"6px 8px", borderBottom:"1px solid #ddd"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.player_id}>
                  <td style={{padding:"6px 8px"}}>{r.player_name}</td>
                  <td style={{padding:"6px 8px"}}>{r.team_name}</td>
                  <td style={{padding:"6px 8px"}}>{r.gp}</td>
                  <td style={{padding:"6px 8px"}}>{r.goals}</td>
                  <td style={{padding:"6px 8px"}}>{r.assists}</td>
                  <td style={{padding:"6px 8px", fontWeight:"bold"}}>{r.points}</td>
                  <td style={{padding:"6px 8px"}}>{r.pim}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
