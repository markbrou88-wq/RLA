import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

function toSeconds(mmss) {
  if (!mmss) return 0;
  const [m, s] = String(mmss).split(":").map((v) => parseInt(v || 0, 10));
  if (Number.isNaN(m) || Number.isNaN(s)) return 0;
  return m * 60 + s;
}
function toMMSS(seconds) {
  const sec = Math.max(0, parseInt(seconds || 0, 10));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function LineRow({ line, onChange, onRemove, players }) {
  const handle = (key, val) => {
    onChange({ ...line, [key]: val });
  };

  const goalieOptions = [...players]
    .sort((a, b) => {
      // goalies first, then by number
      const ag = (a.position || "").toUpperCase() === "G" ? 0 : 1;
      const bg = (b.position || "").toUpperCase() === "G" ? 0 : 1;
      if (ag !== bg) return ag - bg;
      const an = a.number ?? 9999;
      const bn = b.number ?? 9999;
      if (an !== bn) return an - bn;
      return (a.name || "").localeCompare(b.name || "");
    })
    .map((p) => ({
      value: p.id,
      label: `${p.number ?? ""} ${p.name} ${p.position ? `(${p.position})` : ""}`.trim(),
    }));

  return (
    <tr>
      <td style={{ width: "32px" }}>
        <button type="button" className="btn" onClick={onRemove} title="Remove">
          ✕
        </button>
      </td>

      <td>
        <select
          value={line.player_id || ""}
          onChange={(e) => handle("player_id", Number(e.target.value))}
          style={{ minWidth: 200 }}
        >
          <option value="">Choose goalie…</option>
          {goalieOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </td>

      <td style={{ textAlign: "center" }}>
        <input
          type="checkbox"
          checked={!!line.started}
          onChange={(e) => handle("started", e.target.checked)}
        />
      </td>

      <td style={{ width: 80 }}>
        <input
          type="number"
          min="0"
          value={line.shots_against ?? ""}
          onChange={(e) => handle("shots_against", e.target.value === "" ? null : Number(e.target.value))}
          placeholder="SA"
        />
      </td>

      <td style={{ width: 80 }}>
        <input
          type="number"
          min="0"
          value={line.goals_against ?? ""}
          onChange={(e) => handle("goals_against", e.target.value === "" ? null : Number(e.target.value))}
          placeholder="GA"
        />
      </td>

      <td style={{ width: 90 }}>
        <input
          type="text"
          value={toMMSS(line.minutes_seconds)}
          onChange={(e) => handle("minutes_seconds", toSeconds(e.target.value))}
          placeholder="mm:ss"
        />
      </td>

      <td style={{ width: 100 }}>
        <select
          value={line.decision || "ND"}
          onChange={(e) => handle("decision", e.target.value)}
        >
          <option value="ND">ND</option>
          <option value="W">W</option>
          <option value="L">L</option>
          <option value="OTL">OTL</option>
          <option value="SOL">SOL</option>
        </select>
      </td>

      <td style={{ textAlign: "center" }}>
        <input
          type="checkbox"
          checked={!!line.shutout}
          onChange={(e) => handle("shutout", e.target.checked)}
        />
      </td>
    </tr>
  );
}

export default function GoaliesPage() {
  const { slug } = useParams();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState("");

  const [game, setGame] = React.useState(null);
  const [homePlayers, setHomePlayers] = React.useState([]);
  const [awayPlayers, setAwayPlayers] = React.useState([]);

  const [homeLines, setHomeLines] = React.useState([]);
  const [awayLines, setAwayLines] = React.useState([]);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      // 1) Load game + teams
      const { data: g, error: ge } = await supabase
        .from("games")
        .select(`
          id, slug, game_date,
          home_team:teams!games_home_team_id_fkey(id, name, short_name, logo_url),
          away_team:teams!games_away_team_id_fkey(id, name, short_name, logo_url)
        `)
        .eq("slug", slug)
        .maybeSingle();
      if (ge || !g) {
        setErr(ge?.message || "Game not found");
        setLoading(false);
        return;
      }
      setGame(g);

      // 2) Load players for each team
      const [hp, ap] = await Promise.all([
        supabase
          .from("players")
          .select("id, name, number, position")
          .eq("team_id", g.home_team.id),
        supabase
          .from("players")
          .select("id, name, number, position")
          .eq("team_id", g.away_team.id),
      ]);
      setHomePlayers(hp.data || []);
      setAwayPlayers(ap.data || []);

      // 3) Load existing goalie lines
      const { data: gg } = await supabase
        .from("game_goalies")
        .select(
          "id, game_id, team_id, player_id, started, minutes_seconds, shots_against, goals_against, decision, shutout"
        )
        .eq("game_id", g.id);

      const home = (gg || []).filter((r) => r.team_id === g.home_team.id);
      const away = (gg || []).filter((r) => r.team_id === g.away_team.id);
      setHomeLines(home);
      setAwayLines(away);

      setLoading(false);
    })();
  }, [slug]);

  const addHome = () =>
    setHomeLines((cur) => [
      ...cur,
      {
        id: undefined,
        game_id: game.id,
        team_id: game.home_team.id,
        player_id: null,
        started: false,
        minutes_seconds: 0,
        shots_against: null,
        goals_against: null,
        decision: "ND",
        shutout: false,
      },
    ]);
  const addAway = () =>
    setAwayLines((cur) => [
      ...cur,
      {
        id: undefined,
        game_id: game.id,
        team_id: game.away_team.id,
        player_id: null,
        started: false,
        minutes_seconds: 0,
        shots_against: null,
        goals_against: null,
        decision: "ND",
        shutout: false,
      },
    ]);

  const saveAll = async () => {
    if (!game) return;
    setSaving(true);
    setErr("");

    // Basic validation: ignore lines without a player_id
    const clean = (lines) =>
      lines
        .filter((l) => !!l.player_id)
        .map((l) => ({
          game_id: game.id,
          team_id: l.team_id,
          player_id: l.player_id,
          started: !!l.started,
          minutes_seconds: l.minutes_seconds || 0,
          shots_against: l.shots_against ?? null,
          goals_against: l.goals_against ?? null,
          decision: l.decision || "ND",
          shutout: !!l.shutout,
        }));

    const payload = [...clean(homeLines), ...clean(awayLines)];

    try {
      // Clear existing for this game then insert fresh
      const del = await supabase.from("game_goalies").delete().eq("game_id", game.id);
      if (del.error) throw del.error;

      if (payload.length > 0) {
        const ins = await supabase.from("game_goalies").insert(payload);
        if (ins.error) throw ins.error;
      }
    } catch (e) {
      setErr(e.message || "Save failed");
      setSaving(false);
      return;
    }

    setSaving(false);
    alert("Goalie lines saved!");
  };

  if (loading) return <div className="container">Loading…</div>;
  if (err) return <div className="container" style={{ color: "crimson" }}>{err}</div>;
  if (!game) return null;

  return (
    <div className="container">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row">
          <div>
            <Link to="/games">← Back to Games</Link>
            <h2 className="m0">Goalies</h2>
            <div className="kicker">
              {new Date(game.game_date).toLocaleDateString()}
            </div>
          </div>
          <div className="right row">
            <button className="btn ghost" onClick={() => window.location.reload()}>
              Reset
            </button>
            <button className="btn primary" onClick={saveAll} disabled={saving}>
              {saving ? "Saving…" : "Save Goalies"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* HOME */}
        <div className="card">
          <div className="row mb8">
            {game.home_team.logo_url && (
              <img
                src={game.home_team.logo_url}
                alt=""
                className="team-logo"
                style={{ marginRight: 6 }}
              />
            )}
            <h3 className="m0">{game.home_team.name}</h3>
            <span className="kicker">({game.home_team.short_name})</span>
            <div className="right">
              <button className="btn" onClick={addHome}>
                + Add Goalie Line
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Goalie</th>
                  <th>Start</th>
                  <th>SA</th>
                  <th>GA</th>
                  <th>TOI</th>
                  <th>Decision</th>
                  <th>SO</th>
                </tr>
              </thead>
              <tbody>
                {homeLines.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ color: "#888" }}>
                      No lines yet
                    </td>
                  </tr>
                ) : (
                  homeLines.map((line, idx) => (
                    <LineRow
                      key={idx}
                      line={line}
                      players={homePlayers}
                      onChange={(l) =>
                        setHomeLines((cur) => cur.map((c, i) => (i === idx ? l : c)))
                      }
                      onRemove={() =>
                        setHomeLines((cur) => cur.filter((_, i) => i !== idx))
                      }
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* AWAY */}
        <div className="card">
          <div className="row mb8">
            {game.away_team.logo_url && (
              <img
                src={game.away_team.logo_url}
                alt=""
                className="team-logo"
                style={{ marginRight: 6 }}
              />
            )}
            <h3 className="m0">{game.away_team.name}</h3>
            <span className="kicker">({game.away_team.short_name})</span>
            <div className="right">
              <button className="btn" onClick={addAway}>
                + Add Goalie Line
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Goalie</th>
                  <th>Start</th>
                  <th>SA</th>
                  <th>GA</th>
                  <th>TOI</th>
                  <th>Decision</th>
                  <th>SO</th>
                </tr>
              </thead>
              <tbody>
                {awayLines.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ color: "#888" }}>
                      No lines yet
                    </td>
                  </tr>
                ) : (
                  awayLines.map((line, idx) => (
                    <LineRow
                      key={idx}
                      line={line}
                      players={awayPlayers}
                      onChange={(l) =>
                        setAwayLines((cur) => cur.map((c, i) => (i === idx ? l : c)))
                      }
                      onRemove={() =>
                        setAwayLines((cur) => cur.filter((_, i) => i !== idx))
                      }
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
