import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient.js";

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 8px", borderBottom: "1px solid #eee", paddingBottom: 4 }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function SmallTable({ headers, rows }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  borderBottom: "1px solid #ddd",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td style={{ padding: 8, color: "#777" }} colSpan={headers.length}>
                —
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td
                    key={j}
                    style={{
                      padding: "6px 8px",
                      borderBottom: "1px solid #f3f3f3",
                    }}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function RosterList({ title, logo, rows }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {logo ? (
          <img src={logo} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} />
        ) : null}
        <h3 style={{ margin: 0 }}>{title}</h3>
      </div>
      <SmallTable headers={["#", "Player", "Pos"]} rows={rows} />
    </div>
  );
}

export default function BoxscorePage() {
  const { slug } = useParams();
  const [game, setGame] = React.useState(null);
  const [events, setEvents] = React.useState([]);
  const [homeRoster, setHomeRoster] = React.useState([]);
  const [awayRoster, setAwayRoster] = React.useState([]);
  const [homeGoalies, setHomeGoalies] = React.useState([]);
  const [awayGoalies, setAwayGoalies] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    (async () => {
      setLoading(tru
