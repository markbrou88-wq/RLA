// src/pages/StatsPage.jsx
import React from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

/* Resolve season from URL when under /s/:seasonSlug/... */
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

/* Helper: run query, try with season filter first, if the column doesn't exist retry without */
async function tryWithOptionalSeason({ from, select, order, seasonId, extra = [] }) {
  const base = supabase.from(from).select(select, { head: false, count: null });
  const applyOrder = (q) => {
    if (!order) return q;
    for (const o of order) q = q.order(o.col, { ascending: !!o.asc });
    return q;
  };

  if (seasonId) {
    let q = base.eq("season_id", seasonId);
    for (const fn of extra) q = fn(q);
    let { data, error } = await applyOrder(q);
    if (error && /column .*season_id/i.test(error.message)) {
      let q2 = base;
      for (const fn of extra) q2 = fn(q2);
      return applyOrder(q2);
    }
    return { data, error };
  }

  let q = base;
  for (const fn of extra) q = fn(q);
  return applyOrder(q);
}

export default function StatsPage() {
  const { seasonSlug } = useParams();
  const [season, setSeason] = React.useState(null);
  const [leaders, setLeaders] = React.useState([]);
  const [goalies, setGoalies] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const s = await getSeasonBySlug(seasonSlug);
      if (!cancelled) setSeason(s);

      // Skaters (leaders_current)
      const sk = await tryWithOptionalSeason({
        from: "leaders_current",
        select: "player_id, player, team, gp, g, a, pts",
        order: [{ col: "pts", asc: false }, { col: "g", asc: false }],
        seasonId: s?.id,
      });

      // Goalies (goalie_stats_current) — whatever you display today
      const gl = await tryWithOptionalSeason({
        from: "goalie_stats_current",
        select: "player_id, goalie, team, sa, ga, sv_pct, gaa, toi_seconds, wins, losses, otl, so",
        order: [{ col: "sv_pct", asc: false }],
        seasonId: s?.id,
      });

      if (!cancelled) {
        if (sk.error) console.error(sk.error);
        if (gl.error) console.error(gl.error);
        setLeaders(sk.data || []);
        setGoalies(gl.data || []);
        setLoading(false);
      }
    }
    load();
    return () => (cancelled = true);
  }, [seasonSlug]);

  return (
    <div>
      <h2 className="h-title">
        {season ? `Stats — ${season.name}` : "Stats"}
      </h2>

      {loading ? (
        <div className="card pad">Loading…</div>
      ) : (
        <>
          {/* Skaters */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 className="h-sub">Skaters</h3>
            <div className="tbl">
              <div className="tr thead">
                <div className="td left">Player</div>
                <div className="td left">Team</div>
                <div className="td c">GP</div>
                <div className="td c">G</div>
                <div className="td c">A</div>
                <div className="td c">P</div>
              </div>
              {leaders.map((r) => (
                <div key={r.player_id} className="tr">
                  <div className="td left">{r.player}</div>
                  <div className="td left">{r.team}</div>
                  <div className="td c">{r.gp}</div>
                  <div className="td c">{r.g}</div>
                  <div className="td c">{r.a}</div>
                  <div className="td c b">{r.pts}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Goalies */}
          <div className="card">
            <h3 className="h-sub">Goalies</h3>
            <div className="tbl">
              <div className="tr thead">
                <div className="td left">Goalie</div>
                <div className="td left">Team</div>
                <div className="td c">SA</div>
                <div className="td c">GA</div>
                <div className="td c">SV%</div>
                <div className="td c">GAA</div>
                <div className="td c">W-L-OTL</div>
                <div className="td c">SO</div>
              </div>
              {goalies.map((g) => (
                <div key={g.player_id} className="tr">
                  <div className="td left">{g.goalie}</div>
                  <div className="td left">{g.team}</div>
                  <div className="td c">{g.sa}</div>
                  <div className="td c">{g.ga}</div>
                  <div className="td c">{g.sv_pct ?? "—"}</div>
                  <div className="td c">{g.gaa ?? "—"}</div>
                  <div className="td c">{[g.wins ?? 0, g.losses ?? 0, g.otl ?? 0].join("-")}</div>
                  <div className="td c b">{g.so ?? 0}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
