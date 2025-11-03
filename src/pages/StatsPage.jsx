// src/pages/StatsPage.jsx
import React from "react";
import { supabase } from "../supabaseClient";
import PlayerLink from "../components/PlayerLink";

function useMaybeI18n() {
  try {
    const { useI18n } = require("../i18n");
    return useI18n();
  } catch {
    return { t: (s) => s };
  }
}

export default function StatsPage() {
  const { t } = useMaybeI18n();

  const [tab, setTab] = React.useState("skaters"); // "skaters" | "goalies"
  const [skaters, setSkaters] = React.useState([]);
  const [goalies, setGoalies] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1) GP from leaders_current
      // 2) G/A/PTS (and ranking) from player_stats_current
      const [
        { data: leaders, error: e1 },
        { data: stats, error: e2 },
        { data: gl, error: e3 },
      ] = await Promise.all([
        supabase
          .from("leaders_current")
          .select("player_id, player, team, gp"),
        supabase
          .from("player_stats_current")
          .select("player_id, player, team, g, a, pts")
          .order("pts", { ascending: false })
          .order("g", { ascending: false })
          .order("a", { ascending: false }),
        supabase
          .from("goalie_stats_current")
          .select("player_id, goalie, team, sa, ga, sv_pct, gaa, toi_seconds, wins, losses, otl, so")
          .order("sv_pct", { ascending: false, nullsFirst: false }),
      ]);

      if (!cancelled) {
        if (e1) console.error(e1);
        if (e2) console.error(e2);
        if (e3) console.error(e3);

        // Build a gp map from leaders_current (fallback 0)
        const gpMap = new Map();
        (leaders || []).forEach((r) => gpMap.set(String(r.player_id), r.gp ?? 0));

        // Merge: keep ordering from stats view, but overwrite/add gp
        const merged = (stats || []).map((s) => ({
          player_id: s.player_id,
          player: s.player,
          team: s.team,
          g: s.g ?? 0,
          a: s.a ?? 0,
          pts: s.pts ?? 0,
          gp: gpMap.get(String(s.player_id)) ?? 0,
        }));

        setSkaters(merged);
        setGoalies(gl || []);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>{t("Stats")}</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button
          className={tab === "skaters" ? "btn btn-primary" : "btn"}
          onClick={() => setTab("skaters")}
        >
          {t("Skaters")}
        </button>
        <button
          className={tab === "goalies" ? "btn btn-primary" : "btn"}
          onClick={() => setTab("goalies")}
        >
          {t("Goalies")}
        </button>
      </div>

      {loading ? (
        <div>{t("Loading…")}</div>
      ) : tab === "skaters" ? (
        <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
          <table style={tbl}>
            <thead style={thead}>
              <tr>
                <th style={th}>{t("Player")}</th>
                <th style={th}>{t("Team")}</th>
                <th style={th}>GP</th>
                <th style={th}>G</th>
                <th style={th}>A</th>
                <th style={th}>P</th>
              </tr>
            </thead>
            <tbody>
              {skaters.map((r) => (
                <tr key={r.player_id}>
                  <td style={td}>
                    <PlayerLink id={r.player_id}>{r.player}</PlayerLink>
                  </td>
                  <td style={td}>{r.team}</td>
                  <td style={tdRight}>{r.gp}</td>
                  <td style={tdRight}>{r.g}</td>
                  <td style={tdRight}>{r.a}</td>
                  <td style={{ ...tdRight, fontWeight: 700 }}>{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
          <table style={tbl}>
            <thead style={thead}>
              <tr>
                <th style={th}>{t("Goalie")}</th>
                <th style={th}>{t("Team")}</th>
                <th style={th}>SA</th>
                <th style={th}>GA</th>
                <th style={th}>{t("SV%")}</th>
                <th style={th}>{t("GAA")}</th>
                <th style={th}>{t("TOI")}</th>
                <th style={th}>{t("W-L-OTL")}</th>
                <th style={th}>SO</th>
              </tr>
            </thead>
            <tbody>
              {goalies.map((g) => (
                <tr key={g.player_id}>
                  <td style={td}>
                    <PlayerLink id={g.player_id}>{g.goalie}</PlayerLink>
                  </td>
                  <td style={td}>{g.team}</td>
                  <td style={tdRight}>{g.sa ?? 0}</td>
                  <td style={tdRight}>{g.ga ?? 0}</td>
                  <td style={tdRight}>{g.sv_pct != null ? `${g.sv_pct}%` : "—"}</td>
                  <td style={tdRight}>{g.gaa != null ? g.gaa : "—"}</td>
                  <td style={tdRight}>{fmtTOI(g.toi_seconds)}</td>
                  <td style={tdRight}>{`${g.wins ?? 0}-${g.losses ?? 0}-${g.otl ?? 0}`}</td>
                  <td style={tdRight}>{g.so ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function fmtTOI(sec) {
  const s = Number(sec || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const thead = { background: "var(--table-head, #f4f5f8)" };
const th = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" };
const td = { padding: "10px 12px", borderBottom: "1px solid #f3f3f3", whiteSpace: "nowrap" };
const tdRight = { ...td, textAlign: "right" };
