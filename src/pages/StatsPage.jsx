import React from "react";
import { supabase } from "../supabaseClient.js";

function TeamCell({ name, logo, short }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {logo ? (
        <img
          src={logo}
          alt={name}
          width={20}
          height={20}
          style={{ objectFit: "contain", borderRadius: 4 }}
        />
      ) : null}
      <span>{short ? `${name} (${short})` : name}</span>
    </div>
  );
}

export default function StatsPage() {
  const [rows, setRows] = React.useState([]);
  const [teamById, setTeamById] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState("points"); // points|goals|assists|gp
  const [limit, setLimit] = React.useState(50);

  const load = React.useCallback(async () => {
    setLoading(true);

    const sortCol = ["points","goals","assists","gp"].includes(sort) ? sort : "points";

    const statsPromise = supabase
      .from("player_stats_current")
      .select("player_id, player_name, team_id, team_name, gp, goals, assists, points, pim")
      .order(sortCol, { ascending: false });

    const teamsPromise = supabase
      .from("teams")
      .select("id, short_name, logo_url");

    const [{ data: sData, error: sErr }, { data: tData, error: tErr }] =
      await Promise.all([statsPromise, teamsPromise]);

    if (sErr) console.error(sErr);
    if (tErr) console.error(tErr);

    const map = Object.fromEntries(
      (tData || []).map((t) => [t.id, { short_name: t.short_name, logo_url: t.logo_url }])
    );

    setTeamById(map);
    setRows(sData || []);
    setLoading(false);
  }, [sort]);

  React.useEffect(() => { load(); }, [load]);

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

  const filtered = rows
    .filter(
      (r) =>
        r.player_name.toLowerCase().includes(search.toLowerCase()) ||
        r.team_name.toLowerCase().includes(search.toLowerCase())
    )
    .slice(0, limit);

  return (
    <div>
      <h2>Stats</h2>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
        <input
          placeholder="Search player or team…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label>Sort by:</label>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="points">Points</option>
          <option value="goals">Goals</option>
          <option value="assists">Assists</option>
          <option value="gp">Games Played</option>
        </select>
        <label>Show:</label>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
          <option value={25}>Top 25</option>
          <option value={50}>Top 50</option>
          <option value={100}>Top 100</option>
          <option value={100000}>All</option>
        </select>
        <button onClick={load}>Refresh</button>
      </div>

      {loading ? <p>Loading…</p> : (
        <div style={{ overflowX:"auto" }}>
          <table style={{ borderCollapse:"collapse", width:"100%", minWidth: 720 }}>
            <thead>
              <tr>
                {["Player","Team","GP","G","A","PTS","PIM"].map((h) => (
                  <th key={h} style={{ textAlign:"left", borderBottom:"1px solid #ddd", padding:"8px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const t = teamById[r.team_id] || {};
                return (
                  <tr key={r.player_id}>
                    <td style={{ padding:"8px" }}>{r.player_name}</td>
                    <td style={{ padding:"8px" }}>
                      <TeamCell name={r.team_name} logo={t.logo_url} short={t.short_name} />
                    </td>
                    <td style={{ padding:"8px" }}>{r.gp}</td>
                    <td style={{ padding:"8px" }}>{r.goals}</td>
                    <td style={{ padding:"8px" }}>{r.assists}</td>
                    <td style={{ padding:"8px", fontWeight:"bold" }}>{r.points}</td>
                    <td style={{ padding:"8px" }}>{r.pim}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
