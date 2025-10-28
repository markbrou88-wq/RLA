import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

function SectionCard({ title, children }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 16, background: "#fff" }}>
      {title ? <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div> : null}
      {children}
    </div>
  );
}

function TinyLogo({ url, alt }) {
  if (!url) return null;
  return <img src={url} alt={alt || ""} style={{ height: 22, objectFit: "contain", marginLeft: 8 }} />;
}

function Table({ columns, rows, emptyText = "—" }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align || "left", padding: "6px 8px", borderBottom: "1px solid #eee", fontWeight: 600 }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 10, color: "#888" }}>{emptyText}</td>
            </tr>
          ) : (
            rows.map((r, idx) => (
              <tr key={r.id || idx}>
                {columns.map((c) => (
                  <td key={c.key} style={{ padding: "6px 8px", borderBottom: "1px solid #f3f3f3", textAlign: c.align || "left", whiteSpace: "nowrap" }}>
                    {typeof c.render === "function" ? c.render(r) : r[c.key]}
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

export default function BoxscorePage() {
  const { slug } = useParams();

  const [loading, setLoading] = React.useState(true);
  const [game, setGame] = React.useState(null);
  const [homeTeam, setHomeTeam] = React.useState(null);
  const [awayTeam, setAwayTeam] = React.useState(null);

  const [lineupHome, setLineupHome] = React.useState([]);
  const [lineupAway, setLineupAway] = React.useState([]);

  const [goaliesHome, setGoaliesHome] = React.useState([]);
  const [goaliesAway, setGoaliesAway] = React.useState([]);

  const [events, setEvents] = React.useState([]);
  const [score, setScore] = React.useState({ home: 0, away: 0 });
  const [goalsByPeriod, setGoalsByPeriod] = React.useState({ home: { 1: 0, 2: 0, 3: 0, OT: 0 }, away: { 1: 0, 2: 0, 3: 0, OT: 0 } });

  React.useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      // 1) Game by slug
      const { data: gRows, error: gErr } = await supabase
        .from("games")
        .select("id, slug, game_date, home_team_id, away_team_id, status, went_ot, home_score, away_score")
        .eq("slug", slug)
        .maybeSingle();

      if (gErr) {
        alert(gErr.message);
        setLoading(false);
        return;
      }
      if (!gRows) {
        alert("Game not found.");
        setLoading(false);
        return;
      }
      const g = gRows;
      if (!mounted) return;
      setGame(g);

      // 2) Teams
      const teamIds = [g.home_team_id, g.away_team_id].filter(Boolean);
      const { data: tRows, error: tErr } = await supabase
        .from("teams")
        .select("id, name, short_name, logo_url")
        .in("id", teamIds);

      if (tErr) {
        alert(tErr.message);
        setLoading(false);
        return;
      }
      const home = tRows.find((t) => t.id === g.home_team_id) || null;
      const away = tRows.find((t) => t.id === g.away_team_id) || null;
      if (!mounted) return;
      setHomeTeam(home);
      setAwayTeam(away);

      // 3) Rosters (join players)
      const { data: rosterRows, error: rErr } = await supabase
        .from("game_rosters")
        .select("team_id, player:players(id, name, number, position)")
        .eq("game_id", g.id);

      if (rErr) {
        alert(rErr.message);
        setLoading(false);
        return;
      }
      const homeList = rosterRows
        .filter((r) => r.team_id === g.home_team_id)
        .map((r) => r.player)
        .sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999));
      const awayList = rosterRows
        .filter((r) => r.team_id === g.away_team_id)
        .map((r) => r.player)
        .sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999));
      if (!mounted) return;
      setLineupHome(homeList);
      setLineupAway(awayList);

      // 4) Goalies
      const { data: goalieRows, error: gErr2 } = await supabase
        .from("game_goalies")
        .select("team_id, shots_against, goals_against, minutes_seconds, decision, shutout, player:players(id, name, number, position)")
        .eq("game_id", g.id);

      if (gErr2) {
        alert(gErr2.message);
        setLoading(false);
        return;
      }
      const gHome = goalieRows.filter((x) => x.team_id === g.home_team_id);
      const gAway = goalieRows.filter((x) => x.team_id === g.away_team_id);
      if (!mounted) return;
      setGoaliesHome(gHome);
      setGoaliesAway(gAway);

      // 5) Events (goals/assists/penalties); order by period, then time
      const { data: eRows, error: eErr } = await supabase
        .from("events")
        .select("id, period, time_mmss, team_id, event, player:players(id, name, number)")
        .eq("game_id", g.id)
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: true });

      if (eErr) {
        alert(eErr.message);
        setLoading(false);
        return;
      }
      if (!mounted) return;
      setEvents(eRows);

      // 6) Derived score & goals by period (from 'goal' events)
      const derived = { home: 0, away: 0 };
      const byP = { home: { 1: 0, 2: 0, 3: 0, OT: 0 }, away: { 1: 0, 2: 0, 3: 0, OT: 0 } };
      eRows
        .filter((x) => x.event === "goal")
        .forEach((x) => {
          const side = x.team_id === g.home_team_id ? "home" : "away";
          derived[side] += 1;
          const pKey = x.period === 4 ? "OT" : String(x.period);
          if (!byP[side][pKey]) byP[side][pKey] = 0;
          byP[side][pKey] += 1;
        });
      setScore(derived);
      setGoalsByPeriod(byP);

      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, [slug]);

  if (loading) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }
  if (!game || !homeTeam || !awayTeam) {
    return <div style={{ padding: 16 }}>Game not found.</div>;
  }

  const isFinal = game.status === "final";
  const dateStr = game.game_date ? new Date(game.game_date).toLocaleDateString() : "";

  const headerStyle = { display: "grid", gridTemplateColumns: "1fr 120px 1fr", alignItems: "center", gap: 12 };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Link to="/games">← Back to Games</Link>
        <button onClick={() => window.print()} style={{ padding: "6px 10px" }}>Print / Save PDF</button>
      </div>

      {/* HEADER */}
      <div style={{ ...headerStyle, marginBottom: 8 }}>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 14, color: "#666" }}>{dateStr}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>{awayTeam?.name}</div>
            <TinyLogo url={awayTeam?.logo_url} alt={awayTeam?.short_name} />
            <div style={{ fontSize: 12, color: "#888" }}>{awayTeam?.short_name}</div>
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 22 }}>
            {score.away} vs {score.home}
          </div>
          <div style={{ fontSize: 12, color: isFinal ? "#b00020" : "#666" }}>
            {isFinal ? "FINAL" : "LIVE"} {game.went_ot ? "• OT" : ""}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            <div style={{ fontWeight: 700 }}>{homeTeam?.name}</div>
            <TinyLogo url={homeTeam?.logo_url} alt={homeTeam?.short_name} />
            <div style={{ fontSize: 12, color: "#888" }}>{homeTeam?.short_name}</div>
          </div>
        </div>
      </div>

      {/* LINEUPS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          alignItems: "flex-start",
          marginTop: 12,
        }}
      >
        <SectionCard title={`${awayTeam?.short_name} Lineup`}>
          <Table
            columns={[
              { key: "number", label: "#", align: "right" },
              { key: "name", label: "Player" },
              { key: "position", label: "Pos", align: "center" },
            ]}
            rows={lineupAway}
          />
        </SectionCard>

        <SectionCard title={`${homeTeam?.short_name} Lineup`}>
          <Table
            columns={[
              { key: "number", label: "#", align: "right" },
              { key: "name", label: "Player" },
              { key: "position", label: "Pos", align: "center" },
            ]}
            rows={lineupHome}
          />
        </SectionCard>
      </div>

      {/* GOALIES */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          alignItems: "flex-start",
          marginTop: 12,
        }}
      >
        <SectionCard title={`${awayTeam?.short_name} Goalies`}>
          <Table
            columns={[
              { key: "goalie", label: "Goalie", render: (r) => r.player?.name || "—" },
              { key: "sa", label: "SA", align: "right", render: (r) => r.shots_against ?? 0 },
              { key: "ga", label: "GA", align: "right", render: (r) => r.goals_against ?? 0 },
              {
                key: "svp", label: "SV%", align: "right",
                render: (r) => {
                  const sa = r.shots_against || 0;
                  const ga = r.goals_against || 0;
                  if (sa <= 0) return "—";
                  const sv = (1 - ga / sa) * 100;
                  return `${sv.toFixed(1)}`;
                }
              },
              {
                key: "gaa", label: "GAA", align: "right",
                render: (r) => {
                  const secs = r.minutes_seconds || 0;
                  const ga = r.goals_against || 0;
                  if (secs <= 0) return "—";
                  const minutes = secs / 60;
                  const gaa = (ga * 60) / minutes;
                  return gaa.toFixed(2);
                }
              },
              {
                key: "toi", label: "TOI", align: "right",
                render: (r) => {
                  const s = r.minutes_seconds || 0;
                  const mm = Math.floor(s / 60);
                  const ss = String(Math.floor(s % 60)).padStart(2, "0");
                  return `${mm}:${ss}`;
                }
              },
              { key: "decision", label: "Decision", align: "center", render: (r) => r.decision || "—" },
              { key: "so", label: "SO", align: "center", render: (r) => (r.shutout ? "1" : "0") },
            ]}
            rows={goaliesAway}
          />
        </SectionCard>

        <SectionCard title={`${homeTeam?.short_name} Goalies`}>
          <Table
            columns={[
              { key: "goalie", label: "Goalie", render: (r) => r.player?.name || "—" },
              { key: "sa", label: "SA", align: "right", render: (r) => r.shots_against ?? 0 },
              { key: "ga", label: "GA", align: "right", render: (r) => r.goals_against ?? 0 },
              {
                key: "svp", label: "SV%", align: "right",
                render: (r) => {
                  const sa = r.shots_against || 0;
                  const ga = r.goals_against || 0;
                  if (sa <= 0) return "—";
                  const sv = (1 - ga / sa) * 100;
                  return `${sv.toFixed(1)}`;
                }
              },
              {
                key: "gaa", label: "GAA", align: "right",
                render: (r) => {
                  const secs = r.minutes_seconds || 0;
                  const ga = r.goals_against || 0;
                  if (secs <= 0) return "—";
                  const minutes = secs / 60;
                  const gaa = (ga * 60) / minutes;
                  return gaa.toFixed(2);
                }
              },
              {
                key: "toi", label: "TOI", align: "right",
                render: (r) => {
                  const s = r.minutes_seconds || 0;
                  const mm = Math.floor(s / 60);
                  const ss = String(Math.floor(s % 60)).padStart(2, "0");
                  return `${mm}:${ss}`;
                }
              },
              { key: "decision", label: "Decision", align: "center", render: (r) => r.decision || "—" },
              { key: "so", label: "SO", align: "center", render: (r) => (r.shutout ? "1" : "0") },
            ]}
            rows={goaliesHome}
          />
        </SectionCard>
      </div>

      {/* GOALS (expanded events list) */}
      <div style={{ marginTop: 16 }}>
        <SectionCard title="Goals">
          <Table
            columns={[
              { key: "team", label: "Team", render: (r) => (r.team_id === game.home_team_id ? homeTeam.short_name : awayTeam.short_name) },
              { key: "period", label: "Period", align: "center" },
              { key: "time_mmss", label: "Time", align: "center" },
              { key: "scorer", label: "Scorer", render: (r) => (r.player?.name ? `#${r.player?.number ?? ""} — ${r.player?.name}` : "—") },
            ]}
            rows={events.filter((e) => e.event === "goal")}
          />
        </SectionCard>
      </div>

      {/* PENALTIES (if you track them) */}
      <div style={{ marginTop: 16 }}>
        <SectionCard title="Penalties">
          <Table
            columns={[
              { key: "team", label: "Team", render: (r) => (r.team_id === game.home_team_id ? homeTeam.short_name : awayTeam.short_name) },
              { key: "period", label: "Period", align: "center" },
              { key: "time_mmss", label: "Time", align: "center" },
              { key: "player", label: "Player", render: (r) => (r.player?.name ? `#${r.player?.number ?? ""} — ${r.player?.name}` : "—") },
              { key: "detail", label: "Infraction", render: () => "—" }, // fill if you later add penalty type/minutes
            ]}
            rows={events.filter((e) => e.event === "penalty")}
            emptyText="—"
          />
        </SectionCard>
      </div>

      {/* GOALS BY PERIOD */}
      <div style={{ marginTop: 16 }}>
        <SectionCard title="Goals by Period">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #eee" }}>Team</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid #eee" }}>1</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid #eee" }}>2</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid #eee" }}>3</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid #eee" }}>OT</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid #eee" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid #f3f3f3" }}>{awayTeam?.short_name}</td>
                  <td style={{ textAlign: "center" }}>{goalsByPeriod.away["1"] || 0}</td>
                  <td style={{ textAlign: "center" }}>{goalsByPeriod.away["2"] || 0}</td>
                  <td style={{ textAlign: "center" }}>{goalsByPeriod.away["3"] || 0}</td>
                  <td style={{ textAlign: "center" }}>{goalsByPeriod.away["OT"] || 0}</td>
                  <td style={{ textAlign: "center" }}>{score.away}</td>
                </tr>
                <tr>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid #f3f3f3" }}>{homeTeam?.short_name}</td>
                  <td style={{ textAlign: "center" }}>{goalsByPeriod.home["1"] || 0}</td>
                  <td style={{ textAlign: "center" }}>{goalsByPeriod.home["2"] || 0}</td>
                  <td style={{ textAlign: "center" }}>{goalsByPeriod.home["3"] || 0}</td>
                  <td style={{ textAlign: "center" }}>{goalsByPeriod.home["OT"] || 0}</td>
                  <td style={{ textAlign: "center" }}>{score.home}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
