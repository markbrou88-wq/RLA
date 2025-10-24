import React from "react";
import { supabase } from "../supabaseClient.js";

function TeamCell({ name, logo, short }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {logo ? (
        <img
          src={logo}
          alt={name}
          width={24}
          height={24}
          style={{ objectFit: "contain", borderRadius: 4 }}
        />
      ) : (
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            background: "#eee",
            display: "grid",
            placeItems: "center",
            fontSize: 10,
            color: "#666",
          }}
          title={name}
        >
          {short?.slice(0, 3) || "—"}
        </div>
      )}
      <span>{name}</span>
    </div>
  );
}

export default function StandingsPage() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    // pull logo via embedded relation to teams
    const { data, error } = await supabase
      .from("standings_current")
      .select(`
        team_id,
        name,
        gp, w, l, otl, pts, gf, ga, diff,
        teams ( logo_url, short_name )
      `)
      .order("pts", { ascending: false });

    if (!error) setRows(data || []);
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // auto-refresh when games change (final/so/etc.)
  React.useEffect(() => {
    const ch = supabase
      .channel("standings-auto-refresh")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  if (loading) return <p>Loading standings…</p>;

  return (
    <div>
      <h2>Standings</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
          <thead>
            <tr>
              {["Team","GP","W","L","OTL","PTS","GF","GA","+/-"].map(h => (
                <th key={h} style={{ textAlign:"left", borderBottom:"1px solid #ddd", padding:"8px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.team_id}>
                <td style={{ padding:"8px" }}>
                  <TeamCell
                    name={r.name}
                    logo={r.teams?.logo_url}
                    short={r.teams?.short_name}
                  />
                </td>
                <td style={{ padding:"8px" }}>{r.gp}</td>
                <td style={{ padding:"8px" }}>{r.w}</td>
                <td style={{ padding:"8px" }}>{r.l}</td>
                <td style={{ padding:"8px" }}>{r.otl}</td>
                <td style={{ padding:"8px", fontWeight:"bold" }}>{r.pts}</td>
                <td style={{ padding:"8px" }}>{r.gf}</td>
                <td style={{ padding:"8px" }}>{r.ga}</td>
                <td style={{ padding:"8px", color: r.diff >= 0 ? "green" : "red" }}>{r.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
