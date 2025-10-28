// src/pages/StandingsPage.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

// If you already use i18n, this will work; otherwise it’s a no-op.
function useMaybeI18n() {
  try {
    // eslint-disable-next-line global-require
    const { useI18n } = require("../i18n");
    return useI18n();
  } catch {
    return { t: (s) => s };
  }
}

export default function StandingsPage() {
  const { t } = useMaybeI18n();
  const navigate = useNavigate();

  const [rows, setRows] = React.useState([]);
  const [teamsById, setTeamsById] = React.useState({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1) standings rows
      const { data: standings, error: e1 } = await supabase
        .from("standings_current")
        .select("team_id, name, gp, w, l, otl, pts, gf, ga, diff")
        .order("pts", { ascending: false });

      if (e1) {
        console.error(e1);
        if (!cancelled) setLoading(false);
        return;
      }

      // 2) all teams -> logo map
      const { data: teams, error: e2 } = await supabase
        .from("teams")
        .select("id, short_name, logo_url");

      if (e2) {
        console.error(e2);
        if (!cancelled) setLoading(false);
        return;
      }

      const map = new Map(teams.map((t) => [t.id, t]));
      if (!cancelled) {
        setTeamsById(Object.fromEntries(map));
        setRows(standings || []);
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
      <h2 style={{ margin: "8px 0 16px" }}>{t("Standings")}</h2>

      <div
        style={{
          overflowX: "auto",
          borderRadius: 12,
          border: "1px solid #eee",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead style={{ background: "var(--table-head, #f4f5f8)" }}>
            <tr>
              <th style={thS}>{t("Team")}</th>
              <th style={thS}>GP</th>
              <th style={thS}>W</th>
              <th style={thS}>L</th>
              <th style={thS}>OTL</th>
              <th style={thS}>PTS</th>
              <th style={thS}>GF</th>
              <th style={thS}>GA</th>
              <th style={thS}>+/-</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td style={tdS} colSpan={9}>
                  {t("Loading…")}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td style={tdS} colSpan={9}>
                  {t("No teams yet.")}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const team = teamsById[r.team_id] || {};
                return (
                  <tr
                    key={r.team_id}
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(`/teams/${r.team_id}`)}
                    title={t("Open team page")}
                  >
                    <td style={{ ...tdS, display: "flex", alignItems: "center", gap: 10 }}>
                      {team.logo_url ? (
                        <img
                          src={team.logo_url}
                          alt={team.short_name || r.name}
                          style={{ width: 26, height: 26, objectFit: "contain" }}
                        />
                      ) : (
                        <span style={{ width: 26 }} />
                      )}
                      <span>{r.name}</span>
                    </td>
                    <td style={tdS}>{r.gp}</td>
                    <td style={tdS}>{r.w}</td>
                    <td style={tdS}>{r.l}</td>
                    <td style={tdS}>{r.otl}</td>
                    <td style={{ ...tdS, fontWeight: 700 }}>{r.pts}</td>
                    <td style={tdS}>{r.gf}</td>
                    <td style={tdS}>{r.ga}</td>
                    <td
                      style={{
                        ...tdS,
                        color: r.diff > 0 ? "green" : r.diff < 0 ? "crimson" : "inherit",
                        fontWeight: 600,
                      }}
                    >
                      {r.diff}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thS = {
  textAlign: "left",
  fontWeight: 600,
  padding: "10px 14px",
  borderBottom: "1px solid #eee",
  whiteSpace: "nowrap",
};

const tdS = {
  padding: "12px 14px",
  borderBottom: "1px solid #f0f0f0",
};
