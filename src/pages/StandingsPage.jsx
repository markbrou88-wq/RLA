// src/pages/StandingsPage.jsx
import React from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

// Helper: resolve season by slug when URL has /s/:seasonSlug
async function getSeasonBySlug(slug) {
  if (!slug) return null;
  const { data, error } = await supabase
    .from("seasons")
    .select("id, slug, name")
    .eq("slug", slug)
    .single();
  if (error) {
    console.warn("getSeasonBySlug:", error.message);
    return null;
  }
  return data;
}

// Generic loader that tries season filter first and falls back if the view has no column
async function loadStandings({ seasonId }) {
  const base = supabase.from("standings_current")
    .select("team_id, name, gp, w, l, otl, pts, gf, ga, diff")
    .order("pts", { ascending: false })
    .order("diff", { ascending: false });

  if (!seasonId) {
    // No season → old behavior
    return base;
  }

  // Try with season filter
  let { data, error } = await base.eq("season_id", seasonId);
  if (error && /column .*season_id/i.test(error.message)) {
    // View not seasonized yet → try again without eq
    const res = await base;
    return res;
  }
  return { data, error };
}

export default function StandingsPage() {
  const { seasonSlug } = useParams(); // undefined for back-compat URLs
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [season, setSeason] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      // get season id if slug in URL
      const s = await getSeasonBySlug(seasonSlug);
      if (!cancelled) setSeason(s);

      const { data, error } = await loadStandings({ seasonId: s?.id });
      if (!cancelled) {
        if (error) console.error(error);
        setRows(data || []);
        setLoading(false);
      }
    }
    run();

    const vis = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", vis);
    };
  }, [seasonSlug]);

  return (
    <div>
      <h2 className="h-title">
        {season ? `Standings — ${season.name}` : "Standings"}
      </h2>

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

/* Built from your original StandingsPage.jsx with season-awareness added.  :contentReference[oaicite:4]{index=4} */
