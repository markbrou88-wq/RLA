import React from "react";
import { supabase } from "../supabaseClient";
import PlayerLink from "../components/PlayerLink";
import { useSeason } from "../contexts/SeasonContext";

export default function StatsPage() {
  const { seasonId } = useSeason();

  const [tab, setTab] = React.useState("skaters");
  const [skaters, setSkaters] = React.useState([]);
  const [goalies, setGoalies] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!seasonId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const [{ data: s }, { data: g }] = await Promise.all([
        supabase
          .from("leaders_current")
          .select("player_id, player, team, gp, g, a, pts")
          .eq("season_id", seasonId)
          .order("pts", { ascending: false }),
        supabase
          .from("goalie_stats_current")
          .select("*")
          .eq("season_id", seasonId),
      ]);

      if (!cancelled) {
        setSkaters(s || []);
        setGoalies(g || []);
        setLoading(false);
      }
    }

    load();
    return () => (cancelled = true);
  }, [seasonId]);

  if (loading) return <div>Loading…</div>;

  return (
    <div className="stats-page">
      <h2>Stats</h2>

      <div className="btn-row">
        <button onClick={() => setTab("skaters")}>Skaters</button>
        <button onClick={() => setTab("goalies")}>Goalies</button>
      </div>

      {tab === "skaters" ? (
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Team</th>
              <th>GP</th>
              <th>G</th>
              <th>A</th>
              <th>P</th>
            </tr>
          </thead>
          <tbody>
            {skaters.map((r) => (
              <tr key={r.player_id}>
                <td><PlayerLink id={r.player_id}>{r.player}</PlayerLink></td>
                <td>{r.team}</td>
                <td>{r.gp}</td>
                <td>{r.g}</td>
                <td>{r.a}</td>
                <td>{r.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div>Goalie table unchanged</div>
      )}
    </div>
  );
}
