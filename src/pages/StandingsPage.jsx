import React from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient.js";

export default function StandingsPage() {
  const [rows, setRows] = React.useState([]);
  const [teamById, setTeamById] = React.useState({});
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);

    // 1) Existing standings view (unchanged)
    const standingsPromise = supabase
      .from("standings_current")
      .select("team_id, name, gp, w, l, otl, pts, gf, ga, diff")
      .order("pts", { ascending: false });

    // 2) Teams for logos + short names (merged client-side)
    const teamsPromise = supabase
      .from("teams")
      .select("id, short_name, logo_url");

    const [{ data: sData, error: sErr }, { data: tData, error: tErr }] =
      await Promise.all([standingsPromise, teamsPromise]);

    if (sErr) console.error(sErr);
    if (tErr) console.error(tErr);

    const map = Object.fromEntries(
      (tData || []).map((t) => [
        t.id,
        { short_name: t.short_name, logo_url: t.logo_url },
      ])
    );

    setTeamById(map);
    setRows(sData || []);
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Realtime: refresh when games change (final/so/etc.)
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
              {["Team","GP","W","L","OTL","PTS","GF","GA","+/-"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
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
                  <td style={{ padding: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {t.logo_url ? (
                        <img
                          src={t.logo_url}
                          alt={r.name}
                          width={24}
                          height={24}
                          style={{ objectFit: "contain", borderRadius: 4 }}
                        />
                      ) : (
                        <div
                          title={r.name}
                          style={{
                            width: 24, height: 24, borderRadius: 4,
                            background: "#eee", color: "#666",
                            display: "grid", placeItems: "center", fontSize: 10,
                          }}
                        >
                          {(t.short_name || r.name).slice(0, 3)}
                        </div>
                      )}
                      <Link to={`/teams/${r.team_id}`} style={{ textDecoration: "none" }}>
                        {r.name}
                      </Link>
                    </div>
                  </td>
                  <td style={{ padding: "8px" }}>{r.gp}</td>
                  <td style={{ padding: "8px" }}>{r.w}</td>
                  <td style={{ padding: "8px" }}>{r.l}</td>
                  <td style={{ padding: "8px" }}>{r.otl}</td>
                  <td style={{ padding: "8px", fontWeight: "bold" }}>{r.pts}</td>
                  <td style={{ padding: "8px" }}>{r.gf}</td>
                  <td style={{ padding: "8px" }}>{r.ga}</td>
                  <td style={{ padding: "8px", color: r.diff >= 0 ? "green" : "red" }}>
                    {r.diff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
