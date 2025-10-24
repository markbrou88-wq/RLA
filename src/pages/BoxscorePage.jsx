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
              <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #ddd" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td style={{ padding: 8, color: "#777" }} colSpan={headers.length}>—</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} style={{ padding: "6px 8px", borderBottom: "1px solid #f3f3f3" }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BoxscorePage() {
  const { slug } = useParams();
  const [game, setGame] = React.useState(null);
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      // 1) Game + team info
      const { data: g, error: ge } = await supabase
        .from("games")
        .select(`
          id, slug, game_date, status,
          home_score, away_score,
          home_team:teams!games_home_team_id_fkey ( id, name, short_name, logo_url ),
          away_team:teams!games_away_team_id_fkey ( id, name, short_name, logo_url )
        `)
        .eq("slug", slug)
        .maybeSingle();

      if (ge || !g) { setErr(ge?.message || "Game not found"); setLoading(false); return; }

      setGame(g);

      // 2) Events (goals, assists, penalties), sorted by period + time
      const { data: ev, error: ee } = await supabase
        .from("events")
        .select(`
          id, game_id, team_id, player_id, event, period, time_mmss,
          team:teams ( id, short_name ),
          player:players ( id, name )
        `)
        .eq("game_id", g.id)
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: true });

      if (ee) { setErr(ee.message); setLoading(false); return; }

      setEvents(ev || []);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return <div style={{ padding: 16 }}>Loading boxscore…</div>;
  if (err) return <div style={{ padding: 16, color: "crimson" }}>{err}</div>;
  if (!game) return null;

  const home = game.home_team;
  const away = game.away_team;

  // Build goal rows with assists grouped after each goal
  const goalRows = [];
  const penalties = [];
  const goalsByPeriod = { home: {1:0,2:0,3:0,OT:0}, away: {1:0,2:0,3:0,OT:0} };

  events.forEach((e, idx) => {
    if (e.event === "goal") {
      const teamSide = e.team_id === home.id ? "home" : "away";
      const perKey = e.period >= 1 && e.period <= 3 ? e.period : "OT";
      goalsByPeriod[teamSide][perKey] = (goalsByPeriod[teamSide][perKey] || 0) + 1;

      // find immediate assists following this goal (until next goal or period change)
      const assists = [];
      for (let j = idx + 1; j < events.length; j++) {
        const n = events[j];
        if (n.event === "goal") break;
        if (n.event === "assist" && n.team_id === e.team_id && n.period === e.period) {
          assists.push(n.player?.name || "—");
        }
      }
      goalRows.push([
        e.team?.short_name || "",
        e.period,
        e.player?.name || "—",
        assists.join(", "),
        e.time_mmss || ""
      ]);
    } else if (e.event === "penalty") {
      penalties.push([
        e.team?.short_name || "",
        e.period,
        e.player?.name || "—",
        e.time_mmss || ""
      ]);
    }
  });

  const goalsPerPeriodRows = [
    [home.short_name || home.name, goalsByPeriod.home[1]||0, goalsByPeriod.home[2]||0, goalsByPeriod.home[3]||0, (goalsByPeriod.home.OT||0), game.home_score],
    [away.short_name || away.name, goalsByPeriod.away[1]||0, goalsByPeriod.away[2]||0, goalsByPeriod.away[3]||0, (goalsByPeriod.away.OT||0), game.away_score],
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <Link to="/games" style={{ textDecoration: "none" }}>← Back to Games</Link>
          <h2 style={{ margin: "4px 0 0" }}>Boxscore</h2>
          <div style={{ color: "#666" }}>{new Date(game.game_date).toLocaleDateString()}</div>
        </div>
        <div>
          <button onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </div>

      {/* Header: Logos + Score */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {home.logo_url && <img src={home.logo_url} alt={home.name} style={{ width: 72, height: 72, objectFit: "contain" }} />}
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{home.name}</div>
            <div style={{ color: "#666" }}>{home.short_name}</div>
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: 40, fontWeight: 700 }}>
          {game.home_score} <span style={{ fontSize: 16, color: "#777", padding: "0 8px" }}>vs</span> {game.away_score}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{away.name}</div>
            <div style={{ color: "#666" }}>{away.short_name}</div>
          </div>
          {away.logo_url && <img src={away.logo_url} alt={away.name} style={{ width: 72, height: 72, objectFit: "contain" }} />}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        <Section title="Goals">
          <SmallTable
            headers={["Team", "Period", "Scorer", "Assists", "Time"]}
            rows={goalRows}
          />
        </Section>

        <Section title="Penalties">
          <SmallTable
            headers={["Team", "Period", "Player", "Time"]}
            rows={penalties}
          />
        </Section>

        <Section title="Goals by Period">
          <SmallTable
            headers={["Team", "1", "2", "3", "OT", "Total"]}
            rows={goalsPerPeriodRows}
          />
        </Section>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          a, button { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          table { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
