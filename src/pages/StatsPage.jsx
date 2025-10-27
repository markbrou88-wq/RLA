// src/pages/StatsPage.jsx
import React from "react";
import { supabase } from "../supabaseClient";
import { NavLink } from "react-router-dom";

export default function StatsPage() {
  const [tab, setTab] = React.useState("skaters"); // 'skaters' | 'goalies'
  const [skaters, setSkaters] = React.useState([]);
  const [goalies, setGoalies] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);

      // Skaters: your current view with GP/G/A/PTS (you called it leaders_current or player_stats_current).
      // Use the one you are currently using on the page.
      const { data: sk, error: skErr } = await supabase
        .from("player_stats_current")
        .select("player, team, gp, g, a, pts, pim")
        .order("pts", { ascending: false })
        .order("g", { ascending: false });

      // Goalies: your goalie stats current view/table
      const { data: gl, error: glErr } = await supabase
        .from("goalie_stats_current")
        .select("player, team, gp, sa, ga, svpct, gaa, toi_seconds, decision, so")
        .order("svpct", { ascending: false });

      if (!isMounted) return;

      if (skErr) console.error(skErr);
      if (glErr) console.error(glErr);

      setSkaters(sk || []);
      setGoalies(gl || []);
      setLoading(false);
    }

    load();
    return () => { isMounted = false; };
  }, []);

  function fmtTime(sec = 0) {
    const s = Math.max(0, Number(sec) || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>Stats</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          className={tab === "skaters" ? "btn primary" : "btn"}
          onClick={() => setTab("skaters")}
        >
          Skaters
        </button>
        <button
          className={tab === "goalies" ? "btn primary" : "btn"}
          onClick={() => setTab("goalies")}
        >
          Goalies
        </button>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : tab === "skaters" ? (
        <div className="card">
          <div className="table">
            <div className="thead">
              <div>Player</div>
              <div>Team</div>
              <div>GP</div>
              <div>G</div>
              <div>A</div>
              <div>P</div>
              <div>PIM</div>
            </div>
            {skaters.map((r, i) => (
              <div className="tr" key={i}>
                <div>{r.player}</div>
                <div>{r.team}</div>
                <div>{r.gp}</div>
                <div>{r.g}</div>
                <div>{r.a}</div>
                <div>{r.pts}</div>
                <div>{r.pim ?? 0}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table">
            <div className="thead">
              <div>Goalie</div>
              <div>Team</div>
              <div>GP</div>
              <div>SA</div>
              <div>GA</div>
              <div>SV%</div>
              <div>GAA</div>
              <div>TOI</div>
              <div>Decision</div>
              <div>SO</div>
            </div>
            {goalies.map((g, i) => (
              <div className="tr" key={i}>
                <div>{g.player}</div>
                <div>{g.team}</div>
                <div>{g.gp ?? 0}</div>
                <div>{g.sa ?? 0}</div>
                <div>{g.ga ?? 0}</div>
                <div>{(g.svpct ?? 0).toFixed(3)}</div>
                <div>{(g.gaa ?? 0).toFixed(2)}</div>
                <div>{fmtTime(g.toi_seconds)}</div>
                <div>{g.decision || ""}</div>
                <div>{g.so ?? 0}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
