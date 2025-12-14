import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";

export default function StandingsPage({ seasonId, category }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!seasonId || !category) return;

    supabase
      .from("standings_current")
      .select("*")
      .eq("season_id", seasonId)
      .order("pts", { ascending: false })
      .then(({ data }) => setRows(data || []));
  }, [seasonId, category]);

  return (
    <div className="page">
      <h2>Standings</h2>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Team</th>
              <th>GP</th>
              <th>W</th>
              <th>L</th>
              <th>OTL</th>
              <th>GF</th>
              <th>GA</th>
              <th>DIFF</th>
              <th>PTS</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.team_id}>
                <td style={{ textAlign: "left" }}>
                  <Link to={`/teams/${r.team_id}`}>{r.name}</Link>
                </td>
                <td>{r.gp}</td>
                <td>{r.w}</td>
                <td>{r.l}</td>
                <td>{r.otl}</td>
                <td>{r.gf}</td>
                <td>{r.ga}</td>
                <td>{r.diff}</td>
                <td>
                  <strong>{r.pts}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
