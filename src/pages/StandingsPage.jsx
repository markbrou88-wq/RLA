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

  const [playoffGames, setPlayoffGames] = useState([]);

  useEffect(() => {
    if (!seasonId || !categoryId) {
      setLoading(true);
      return;
    }

    setLoading(true);

    const fetchAll = async () => {
      const { data: standingsData, error: standingsError } = await supabase
        .from("standings_current")
        .select("*")
        .eq("season_id", seasonId)
        .eq("category_id", categoryId)
        .order("pts", { ascending: false })
        .order("diff", { ascending: false });

      if (standingsError) {
        console.error("Standings fetch error:", standingsError);
        setRows([]);
      } else {
        setRows(standingsData || []);
      }

      const { data: gamesData, error: gamesError } = await supabase
        .from("games")
        .select("*")
        .eq("season_id", seasonId)
        .eq("category_id", categoryId)
        .in("game_type", ["semi", "final"]);

      if (gamesError) {
        console.error("Playoff games fetch error:", gamesError);
        setPlayoffGames([]);
      } else {
        setPlayoffGames(gamesData || []);
      }

      setLoading(false);
    };

    fetchAll();
  }, [seasonId, categoryId]);

  const top1 = rows[0];
  const top2 = rows[1];
  const top3 = rows[2];

  const semiGame = playoffGames.find((g) => g.game_type === "semi");
  const finalGame = playoffGames.find((g) => g.game_type === "final");

  const getTeamName = (id) => rows.find((r) => r.team_id === id)?.name || "TBD";

  const semiWinner =
    semiGame && semiGame.status === "final"
      ? semiGame.home_score > semiGame.away_score
        ? semiGame.home_team_id
        : semiGame.away_team_id
      : null;

  const finalWinner =
    finalGame && finalGame.status === "final"
      ? finalGame.home_score > finalGame.away_score
        ? finalGame.home_team_id
        : finalGame.away_team_id
      : null;

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
                  <strong>2.</strong> {top2?.name}
                </div>
                <div style={{ margin: "6px 0" }}>vs</div>
                <div>
                  <strong>3.</strong> {top3?.name}
                </div>

                {semiGame && (
                  <div style={{ marginTop: 10, fontWeight: "bold" }}>
                    {semiGame.home_score} – {semiGame.away_score}
                  </div>
                )}
              </div>

              {/* Final */}
              <div className="card" style={{ textAlign: "center" }}>
                <h4>Final</h4>
                <div style={{ marginTop: 8 }}>
                  <strong>1.</strong> {top1?.name}
                </div>
                <div style={{ margin: "6px 0" }}>vs</div>
                <div style={{ opacity: semiWinner ? 1 : 0.6 }}>
                  {semiWinner ? getTeamName(semiWinner) : "Winner of Semi-Final"}
                </div>

                {finalGame && (
                  <div style={{ marginTop: 10, fontWeight: "bold" }}>
                    {finalGame.home_score} – {finalGame.away_score}
                  </div>
                )}
              </div>

              {/* Champion */}
              <div className="card" style={{ textAlign: "center" }}>
                <h4>Champion</h4>
                <div style={{ marginTop: 20, fontSize: 18 }}>
                  {finalWinner ? (
                    <>
                      🏆 <strong>{getTeamName(finalWinner)}</strong>
                    </>
                  ) : (
                    <span style={{ opacity: 0.6 }}>🏆 TBD</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
