// src/pages/TeamPage.jsx
import React from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useI18n } from "../i18n.jsx";

const POSITIONS = ["C", "LW", "RW", "D", "G"];

export default function TeamPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const nav = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  // Team
  const [team, setTeam] = React.useState(null);
  const [name, setName] = React.useState("");
  const [shortName, setShortName] = React.useState("");
  const [logoUrl, setLogoUrl] = React.useState("");

  // Roster
  const [players, setPlayers] = React.useState([]);
  const [adding, setAdding] = React.useState(false);
  const [newPlayer, setNewPlayer] = React.useState({ name: "", number: "", position: "" });
  const [saving, setSaving] = React.useState(false);

  // Recent games (new: we’ll also compute team stats from these)
  const [games, setGames] = React.useState([]);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      // 1) Team
      const { data: t, error: te } = await supabase
        .from("teams")
        .select("id, name, short_name, logo_url")
        .eq("id", id)
        .maybeSingle();
      if (te || !t) {
        setErr(te?.message || "Team not found");
        setLoading(false);
        return;
      }
      setTeam(t);
      setName(t.name || "");
      setShortName(t.short_name || "");
      setLogoUrl(t.logo_url || "");

      // 2) Players
      const { data: ps, error: pe } = await supabase
        .from("players")
        .select("id, name, number, position")
        .eq("team_id", t.id)
        .order("number", { ascending: true });
      if (pe) setErr(pe.message);
      setPlayers(ps || []);

      // 3) Recent games (last 20 by date)
      const { data: gs, error: ge } = await supabase
        .from("games")
        .select(`
          id, slug, game_date, status, home_score, away_score,
          home_team_id, away_team_id,
          home_team:teams!games_home_team_id_fkey(id, name, short_name, logo_url),
          away_team:teams!games_away_team_id_fkey(id, name, short_name, logo_url)
        `)
        .or(`home_team_id.eq.${t.id},away_team_id.eq.${t.id}`)
        .order("game_date", { ascending: false })
        .limit(20);
      if (ge) setErr(ge.message);
      setGames(gs || []);

      setLoading(false);
    })();
  }, [id]);

  // -------- Team save --------
  const saveTeam = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("teams")
        .update({ name, short_name: shortName, logo_url: logoUrl })
        .eq("id", team.id);
      if (error) throw error;
      setTeam((t) => ({ ...t, name, short_name: shortName, logo_url: logoUrl }));
      alert("Team updated");
    } catch (e) {
      alert(e.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  // -------- Players CRUD --------
  const addPlayer = async () => {
    const nm = newPlayer.name.trim();
    const num = newPlayer.number === "" ? null : Number(newPlayer.number);
    const pos = (newPlayer.position || "").toUpperCase();

    if (!nm) {
      alert("Player name is required");
      return;
    }
    if (newPlayer.number !== "" && Number.isNaN(num)) {
      alert("Jersey number must be a number or blank");
      return;
    }
    try {
      setSaving(true);
      const { data, error } = await supabase
        .from("players")
        .insert({ team_id: team.id, name: nm, number: num, position: pos || null })
        .select("id, name, number, position");
      if (error) throw error;
      setPlayers((cur) =>
        [...cur, ...(data || [])].sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999))
      );
      setNewPlayer({ name: "", number: "", position: "" });
      setAdding(false);
    } catch (e) {
      alert(e.message || "Add failed");
    } finally {
      setSaving(false);
    }
  };

  const updatePlayer = async (pid, patch) => {
    const p = players.find((x) => x.id === pid);
    if (!p) return;
    const next = { ...p, ...patch };
    try {
      setPlayers((cur) => cur.map((x) => (x.id === pid ? next : x)));

      const { error } = await supabase
        .from("players")
        .update({
          name: next.name,
          number: next.number === "" ? null : Number(next.number),
          position: (next.position || "").toUpperCase() || null,
        })
        .eq("id", pid);
      if (error) throw error;
    } catch (e) {
      alert(e.message || "Update failed");
      // soft revert (reload)
      const { data } = await supabase
        .from("players")
        .select("id, name, number, position")
        .eq("team_id", team.id)
        .order("number", { ascending: true });
      setPlayers(data || []);
    }
  };

  const deletePlayer = async (pid) => {
    if (!window.confirm("Delete player? This cannot be undone.")) return;
    try {
      const { error } = await supabase.from("players").delete().eq("id", pid);
      if (error) throw error;
      setPlayers((cur) => cur.filter((x) => x.id !== pid));
    } catch (e) {
      alert(e.message || "Delete failed");
    }
  };

  // -------- Derived team stats (from 'games') --------
  const isHome = (g) => g.home_team_id === team?.id;
  const gf = (g) => (isHome(g) ? (g.home_score ?? 0) : (g.away_score ?? 0));
  const ga = (g) => (isHome(g) ? (g.away_score ?? 0) : (g.home_score ?? 0));

  const finished = games.filter((g) => g.status === "final");
  const last10 = finished.slice(0, 10);

  const totals = finished.reduce(
    (acc, g) => {
      const forG = gf(g);
      const agG = ga(g);
      acc.gf += forG;
      acc.ga += agG;
      if (forG > agG) acc.wins += 1;
      else if (forG < agG) acc.losses += 1;
      else acc.ot += 1; // if ties happen (or shootout flagged elsewhere), treat as OT
      return acc;
    },
    { wins: 0, losses: 0, ot: 0, gf: 0, ga: 0 }
  );
  const goalDiff = totals.gf - totals.ga;

  const last10Rec = last10.reduce(
    (acc, g) => {
      const forG = gf(g);
      const agG = ga(g);
      if (forG > agG) acc.w++;
      else if (forG < agG) acc.l++;
      else acc.o++;
      return acc;
    },
    { w: 0, l: 0, o: 0 }
  );

  // Build a simple sparkline (goal differential per game, last 10, reversed so oldest → newest)
  const sparkPoints = last10
    .slice()
    .reverse()
    .map((g) => gf(g) - ga(g));

  // Render a tiny SVG line chart (no deps)
  const Sparkline = ({ points, w = 220, h = 48 }) => {
    if (!points.length) return <div style={{ color: "#888" }}>No recent games</div>;
    const min = Math.min(...points, 0);
    const max = Math.max(...points, 0);
    const span = Math.max(1, max - min);
    const xStep = points.length > 1 ? w / (points.length - 1) : w;

    const path = points
      .map((v, i) => {
        const x = i * xStep;
        const y = h - ((v - min) / span) * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Goal differential last 10 games">
        {/* zero line */}
        {min < 0 && max > 0 && (
          <line
            x1="0"
            x2={w}
            y1={h - ((0 - min) / span) * h}
            y2={h - ((0 - min) / span) * h}
            stroke="#bbb"
            strokeDasharray="2,2"
          />
        )}
        <path d={path} fill="none" stroke="#3b5fff" strokeWidth="2" />
        {/* end dot */}
        {points.length > 0 && (
          <circle
            cx={(points.length - 1) * xStep}
            cy={h - ((points[points.length - 1] - min) / span) * h}
            r="3"
            fill="#3b5fff"
          />
        )}
      </svg>
    );
  };

  if (loading) return <div className="container">Loading…</div>;
  if (err) return <div className="container" style={{ color: "crimson" }}>{err}</div>;
  if (!team) return null;

  const scoreStr = (g) =>
    isHome(g)
      ? `${g.home_score ?? 0}–${g.away_score ?? 0}`
      : `${g.away_score ?? 0}–${g.home_score ?? 0}`;

  return (
    <div className="container">

      {/* Team header & edit */}
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="row">
            {team.logo_url && (
              <img
                src={team.logo_url}
                alt={team.name}
                style={{ width: 64, height: 64, objectFit: "contain", marginRight: 12 }}
              />
            )}
            <div>
              <div className="kicker">Team</div>
              <h2 className="m0">{team.name}</h2>
              <div className="kicker">({team.short_name || "—"})</div>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn secondary" onClick={() => nav(-1)}>← Back</button>
          </div>
        </div>

        <div className="row" style={{ gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <div>
            <div className="kicker">Team name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <div className="kicker">Short name</div>
            <input value={shortName} onChange={(e) => setShortName(e.target.value)} />
          </div>
          <div style={{ minWidth: 360 }}>
            <div className="kicker">Logo URL (PNG/SVG)</div>
            <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
          </div>
          <button className="btn" onClick={saveTeam} disabled={saving}>
            {saving ? "Saving…" : "Save Team"}
          </button>
        </div>
      </div>

      {/* Team Stats + Sparkline */}
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="kicker">Team Stats (final games)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, auto)", gap: 16, alignItems: "baseline" }}>
              <div><b>W-L-OT</b> {totals.wins}-{totals.losses}-{totals.ot}</div>
              <div><b>GF</b> {totals.gf}</div>
              <div><b>GA</b> {totals.ga}</div>
              <div><b>Diff</b> {goalDiff > 0 ? `+${goalDiff}` : goalDiff}</div>
              <div><b>Last 10</b> {last10Rec.w}-{last10Rec.l}-{last10Rec.o}</div>
            </div>
          </div>

          <div>
            <div className="kicker">Goal Differential (last 10)</div>
            <Sparkline points={sparkPoints} />
          </div>
        </div>
      </div>

      {/* Roster */}
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 className="m0">Roster</h3>
          {!adding ? (
            <button className="btn" onClick={() => setAdding(true)}>+ Add Player</button>
          ) : (
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              <input
                placeholder="Player name"
                value={newPlayer.name}
                onChange={(e) => setNewPlayer((p) => ({ ...p, name: e.target.value }))}
              />
              <input
                placeholder="#"
                type="number"
                value={newPlayer.number}
                onChange={(e) => setNewPlayer((p) => ({ ...p, number: e.target.value }))}
                style={{ width: 80 }}
              />
              <select
                value={newPlayer.position}
                onChange={(e) => setNewPlayer((p) => ({ ...p, position: e.target.value }))}
              >
                <option value="">Pos…</option>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <button className="btn" onClick={addPlayer} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button className="btn secondary" onClick={() => { setAdding(false); setNewPlayer({ name: "", number: "", position: "" }); }}>
                Cancel
              </button>
            </div>
          )}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 70 }}>#</th>
                <th>Name</th>
                <th style={{ width: 120 }}>Position</th>
                <th style={{ width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {players.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ color: "#888" }}>No players yet.</td>
                </tr>
              ) : (
                players.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input
                        type="number"
                        value={p.number ?? ""}
                        onChange={(e) => updatePlayer(p.id, { number: e.target.value })}
                        style={{ width: 80 }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updatePlayer(p.id, { name: e.target.value })}
                        style={{ minWidth: 240 }}
                      />
                    </td>
                    <td>
                      <select
                        value={(p.position || "").toUpperCase()}
                        onChange={(e) => updatePlayer(p.id, { position: e.target.value })}
                      >
                        <option value="">—</option>
                        {POSITIONS.map((pos) => (
                          <option key={pos} value={pos}>{pos}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button className="btn danger" onClick={() => deletePlayer(p.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent games */}
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 className="m0">Recent Games</h3>
          <Link to="/games" className="btn secondary">All Games →</Link>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Date</th>
                <th>Matchup</th>
                <th style={{ width: 90 }}>Score</th>
                <th style={{ width: 120 }}>Status</th>
                <th style={{ width: 200 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {games.length === 0 ? (
                <tr><td colSpan={5} style={{ color:"#888" }}>No games yet.</td></tr>
              ) : (
                games.map((g) => (
                  <tr key={g.id}>
                    <td>{g.game_date}</td>
                    <td>
                      <span style={{ whiteSpace: "nowrap" }}>
                        {g.away_team?.logo_url && <img src={g.away_team.logo_url} alt="" className="team-logo" />}
                        <Link to={`/teams/${g.away_team?.id}`}>{g.away_team?.name}</Link>
                      </span>
                      <span style={{ color:"#777", margin:"0 8px" }}>vs</span>
                      <span style={{ whiteSpace: "nowrap" }}>
                        {g.home_team?.logo_url && <img src={g.home_team.logo_url} alt="" className="team-logo" />}
                        <Link to={`/teams/${g.home_team?.id}`}>{g.home_team?.name}</Link>
                      </span>
                    </td>
                    <td>{scoreStr(g)}</td>
                    <td>{g.status}</td>
                    <td>
                      <Link to={`/games/${g.slug}`}>Open</Link>
                      {" · "}
                      <Link to={`/games/${g.slug}/boxscore`}>Boxscore</Link>
                      {" · "}
                      <Link to={`/games`}>Go to Games</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
