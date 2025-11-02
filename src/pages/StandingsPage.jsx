// src/pages/StandingsPage.jsx
import React from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function StandingsPage() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("standings_current") // view
        .select("team_id, name, gp, w, l, otl, pts, gf, ga, diff")
        .order("pts", { ascending: false })
        .order("diff", { ascending: false });
      if (!cancelled) {
        if (error) console.error(error);
        setRows(data || []);
        setLoading(false);
      }
    }
    load();
    // live-ish refresh when you navigate back
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  return (
    <div>
      <h2 className="h-title">Standings</h2>

      {loading ? (
        <div className="card pad">Loading…</div>
      ) : (
        <div className="card">
          <div className="tbl">
            <div className="tr thead">
              <div className="td left">Team</div>
              <div className="td c">GP</div>
              <div className="td c">W</div>
              <div className="td c">L</div>
              <div className="td c">OTL</div>
              <div className="td c">GF</div>
              <div className="td c">GA</div>
              <div className="td c">DIFF</div>
              <div className="td c">PTS</div>
            </div>
            {rows.map((r) => (
              <div key={r.team_id} className="tr">
                <div className="td left">
                  {/* Clickable team name → Team page (same tab) */}
                  <Link className="link" to={`/teams/${r.team_id}`}>{r.name}</Link>
                </div>
                <div className="td c">{r.gp}</div>
                <div className="td c">{r.w}</div>
                <div className="td c">{r.l}</div>
                <div className="td c">{r.otl}</div>
                <div className="td c">{r.gf}</div>
                <div className="td c">{r.ga}</div>
                <div className="td c">{r.diff}</div>
                <div className="td c b">{r.pts}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
