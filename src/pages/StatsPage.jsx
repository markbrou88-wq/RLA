// StatsPage.jsx — no functional changes except ensuring goalie section TEST
// reads the aggregated goalie view so SA/GA/W/L/OTL/SO reflect edits.
// Also keeps existing styling/dark-mode friendly table head colors.
import React from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function StatsPage() {
  const [tab, setTab] = React.useState("skaters");
  const [skaters, setSkaters] = React.useState([]);
  const [goalies, setGoalies] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let dead = false;
    (async () => {
      setLoading(true);
      const [{ data: sk }, { data: gs }] = await Promise.all([
        supabase.from("player_stats_current").select("player_id, player, team, gp, g, a, pts").order("pts", { ascending: false }),
        supabase.from("goalie_stats_current").select("player_id, goalie, team, sa, ga, sv_pct, gaa, wins, losses, otl, so").order("sv_pct", { ascending: false }),
      ]);
      if (!dead) {
        setSkaters(sk || []);
        setGoalies(gs || []);
        setLoading(false);
      }
    })();
    return () => (dead = true);
  }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className={`btn ${tab === "skaters" ? "btn-blue" : "btn-grey"}`} onClick={() => setTab("skaters")}>Skaters</button>
        <button className={`btn ${tab === "goalies" ? "btn-blue" : "btn-grey"}`} onClick={() => setTab("goalies")}>Goalies</button>
      </div>

      {loading && <div>Loading…</div>}

      {!loading && tab === "skaters" && (
        <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "var(--table-head, #f4f5f8)" }}>
              <tr>
                <th style={thS}>Player</th>
                <th style={thS}>Team</th>
                <th style={thR}>GP</th>
                <th style={thR}>G</th>
                <th style={thR}>A</th>
                <th style={thR}>P</th>
              </tr>
            </thead>
            <tbody>
              {skaters.map((r) => (
                <tr key={r.player_id} style={rowS}>
                  <td style={tdS}><Link to={`/players/${r.player_id}`}>{r.player}</Link></td>
                  <td style={tdS}>{r.team}</td>
                  <td style={tdR}>{r.gp}</td>
                  <td style={tdR}>{r.g}</td>
                  <td style={tdR}>{r.a}</td>
                  <td style={tdR} className="strong">{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === "goalies" && (
        <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "var(--table-head, #f4f5f8)" }}>
              <tr>
                <th style={thS}>Goalie</th>
                <th style={thS}>Team</th>
                <th style={thR}>SA</th>
                <th style={thR}>GA</th>
                <th style={thR}>SV%</th>
                <th style={thR}>GAA</th>
                <th style={thR}>W</th>
                <th style={thR}>L</th>
                <th style={thR}>OTL</th>
                <th style={thR}>SO</th>
              </tr>
            </thead>
            <tbody>
              {goalies.map((r) => (
                <tr key={r.player_id} style={rowS}>
                  <td style={tdS}><Link to={`/players/${r.player_id}`}>{r.goalie}</Link></td>
                  <td style={tdS}>{r.team}</td>
                  <td style={tdR}>{r.sa ?? 0}</td>
                  <td style={tdR}>{r.ga ?? 0}</td>
                  <td style={tdR}>{r.sv_pct != null ? `${r.sv_pct}%` : "—"}</td>
                  <td style={tdR}>{r.gaa != null ? r.gaa : "—"}</td>
                  <td style={tdR}>{r.wins ?? 0}</td>
                  <td style={tdR}>{r.losses ?? 0}</td>
                  <td style={tdR}>{r.otl ?? 0}</td>
                  <td style={tdR}>{r.so ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thS = { textAlign: "left", padding: "10px 12px", whiteSpace: "nowrap", borderBottom: "1px solid #eee" };
const thR = { ...thS, textAlign: "right" };
const rowS = { borderBottom: "1px solid #f3f3f3" };
const tdS = { padding: "10px 12px" };
const tdR = { ...tdS, textAlign: "right" };
