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
            width: 24, height: 24, borderRadius: 4,
            background: "#eee", display: "grid", placeItems: "center",
            fontSize: 10, color: "#666",
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
  const [teamById, setTeamById] = React.useState({});
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);

    // fetch standings (existing view)
    const standingsPromise = supabase
      .from("standings_current")
      .select("team_id, name, gp, w, l, otl, pts, gf, ga, diff")
      .order("pts", { ascending: false });

    // fetch teams once for logos/short names
    const teamsPromise = supabase
      .from("teams")
      .select("id, short_name, logo_url");

    const [{ data: sData, error: sErr }, { data: tData, error: tErr }] =
      await Promise.all([standingsPromise, teamsPromise]);

    if (sErr) console.error(sErr);
    if (tErr) console.error(tErr);

    const map = Object.fromEntries(
      (tData || []).map((t) => [t.id, { short_name: t.short_name, logo_url: t.logo_url }])
    );

    setTeamById(map);
    setRows(sData || []);
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // realtime: refresh when games change
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
                <th key={h} style={{ textAlign:"left", borderBottom:"1px solid #ddd", padding:"8px" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const t = teamById[r.team_id] || {};
              return (
                <tr key={r.team_id}>
                  <td style={{ padding:"8px" }}>
                    <TeamCell name={r.name} logo={t.logo_url} short={t.short_name} />
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
