import React from "react";
import { supabase } from "../supabaseClient.js";

// Displays the standings table (auto-updates when games change)
export default function StandingsPage() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [user, setUser] = React.useState(null);

  // Track logged in user
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Fetch standings from your Supabase view
  const load = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("standings_current")
      .select("*")
      .order("pts", { ascending: false });

    if (error) console.error(error);
    else setRows(data || []);
    setLoading(false);
  }, []);

  // Auto-load
  React.useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh when games change
  React.useEffect(() => {
    const channel = supabase
      .channel("standings-auto-refresh")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  if (loading) return <p>Loading standings…</p>;

  return (
    <div>
      <h2>Standings</h2>

      <table
        style={{
          borderCollapse: "collapse",
          width: "100%",
          minWidth: 600,
          marginTop: 10,
        }}
      >
        <thead>
          <tr>
            {[
              "Team",
              "GP",
              "W",
              "L",
              "OTL",
              "PTS",
              "GF",
              "GA",
              "+/-",
            ].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  borderBottom: "1px solid #ccc",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team_id}>
              <td style={{ padding: "6px 8px" }}>{r.name}</td>
              <td style={{ padding: "6px 8px" }}>{r.gp}</td>
              <td style={{ padding: "6px 8px" }}>{r.w}</td>
              <td style={{ padding: "6px 8px" }}>{r.l}</td>
              <td style={{ padding: "6px 8px" }}>{r.otl}</td>
              <td style={{ padding: "6px 8px", fontWeight: "bold" }}>{r.pts}</td>
              <td style={{ padding: "6px 8px" }}>{r.gf}</td>
              <td style={{ padding: "6px 8px" }}>{r.ga}</td>
              <td
                style={{
                  padding: "6px 8px",
                  color: r.diff >= 0 ? "green" : "red",
                }}
              >
                {r.diff}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
