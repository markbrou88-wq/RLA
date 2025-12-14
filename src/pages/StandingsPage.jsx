import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";
import { useSeason } from "../contexts/SeasonContext";
import { useCategory } from "../contexts/CategoryContext";

export default function StandingsPage() {
  const { seasonId } = useSeason();
  const { categoryId } = useCategory();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Guard: wait for selectors to be ready
    if (!seasonId || !categoryId) {
      setLoading(true);
      return;
    }

    setLoading(true);

    supabase
      .from("standings_current")
      .select("*")
      .eq("season_id", seasonId)
      .eq("category_id", categoryId)
      .order("pts", { ascending: false })
      .order("diff", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error("Standings fetch error:", error);
          setRows([]);
        } else {
          setRows(data || []);
        }
        setLoading(false);
      });
  }, [seasonId, categoryId]);

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
            {loading && (
              <tr>
                <td colSpan="9" style={{ textAlign: "center" }}>
                  Loading…
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan="9" style={{ textAlign: "center" }}>
                  No standings available
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((r) => (
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
