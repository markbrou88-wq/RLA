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
  const [tab, setTab] = useState("standings"); // "standings" | "playoffs"

  useEffect(() => {
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

  const top1 = rows[0];
  const top2 = rows[1];
  const top3 = rows[2];

  return (
    <div className="page">
      <h2>Standings</h2>

      {/* Tabs */}
      <div className="row gap" style={{ marginBottom: 12 }}>
        <button
          className={`btn ${tab === "standings" ? "" : "secondary"}`}
          onClick={() => setTab("standings")}
        >
          Standings
        </button>
        <button
          className={`btn ${tab === "playoffs" ? "" : "secondary"}`}
          onClick={() => setTab("playoffs")}
        >
          Playoffs
        </button>
      </div>

      {/* ===== Standings Tab ===== */}
      {tab === "standings" && (
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
      )}

      {/* ===== Playoffs Tab ===== */}
      {tab === "playoffs" && (
        <div className="card">
          {loading && <div style={{ textAlign: "center" }}>Loading…</div>}

          {!loading && rows.length < 3 && (
            <div style={{ textAlign: "center" }}>
              Not enough teams to build playoffs.
            </div>
          )}

          {!loading && rows.length >= 3 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 24,
                alignItems: "center",
              }}
            >
              {/* Semi Final */}
              <div className="card" style={{ textAlign: "center" }}>
                <h4>Semi-Final</h4>
                <div style={{ marginTop: 8 }}>
                  <Link to={`/teams/${top2.team_id}`}>
                    <strong>2.</strong> {top2.name}
                  </Link>
                </div>
                <div style={{ margin: "6px 0" }}>vs</div>
                <div>
                  <Link to={`/teams/${top3.team_id}`}>
                    <strong>3.</strong> {top3.name}
                  </Link>
                </div>
              </div>

              {/* Final */}
              <div className="card" style={{ textAlign: "center" }}>
                <h4>Final</h4>
                <div style={{ marginTop: 8 }}>
                  <Link to={`/teams/${top1.team_id}`}>
                    <strong>1.</strong> {top1.name}
                  </Link>
                </div>
                <div style={{ margin: "6px 0" }}>vs</div>
                <div style={{ opacity: 0.6 }}>
                  Winner of Semi-Final
                </div>
              </div>

              {/* Champion */}
              <div className="card" style={{ textAlign: "center" }}>
                <h4>Champion</h4>
                <div style={{ marginTop: 20, fontSize: 18, opacity: 0.6 }}>
                  🏆 TBD
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
