// src/pages/TeamPage.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

/* ---------- Tiny Sparkline (no deps) ---------- */
function Sparkline({ points = [], width = 600, height = 160, stroke = "#3b82f6" }) {
  if (!points.length) {
    return <div className="muted">No final games yet</div>;
  }
  const xs = points.map((_, i) => i);
  const minX = 0;
  const maxX = xs.length - 1 || 1;
  const vals = points.map((p) => p.diff ?? 0);
  const minY = Math.min(...vals, 0);
  const maxY = Math.max(...vals, 0);
  const pad = 8;

  const xScale = (x) =>
    pad + ((x - minX) / (maxX - minX || 1)) * (width - pad * 2);
  const yScale = (y) => {
    const rng = maxY - minY || 1;
    const t = (y - minY) / rng;
    return height - pad - t * (height - pad * 2);
  };

  const path = xs
    .map((x, i) => {
      const px = xScale(x);
      const py = yScale(points[i].diff ?? 0);
      return `${i === 0 ? "M" : "L"} ${px} ${py}`;
    })
    .join(" ");

  // zero line
  const zeroY = yScale(0);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img">
      <line x1={pad} y1={zeroY} x2={width - pad} y2={zeroY} stroke="#e5e7eb" />
      <path d={path} stroke={stroke} fill="none" strokeWidth="3" />
      {/* dots */}
      {xs.map((x, i) => {
        const px = xScale(x);
        const py = yScale(points[i].diff ?? 0);
        return <circle key={i} cx={px} cy={py} r="3.5" fill={stroke} />;
      })}
    </svg>
  );
}

/* ---------- Data hooks ---------- */
function useTeam(teamId) {
  const [team, setTeam] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, short_name, logo_url")
        .eq("id", teamId)
        .single();
      if (!cancelled) {
        if (error) console.error(error);
        setTeam(data);
      }
    })();
    return () => (cancelled = true);
  }, [teamId]);
  return team;
}

function useTeamSummary(teamId) {
  const [summary, setSummary] = React.useState({
    record: { gp: 0, w: 0, l: 0, otl: 0, gf: 0, ga: 0 },
    recent: [],
    chart: [],
  });
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: games, error } = await supabase
        .from("games")
        .select(
          "id, game_date, home_team_id, away_team_id, home_score, away_score, status, went_ot"
        )
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .order("game_date", { ascending: false })
        .limit(20);
      if (error) {
        console.error(error);
        return;
      }

      let gp = 0,
        w = 0,
        l = 0,
        otl = 0,
        gf = 0,
        ga = 0;

      const recent = [];
      const chart = [];

      for (const g of games) {
        const isHome = g.home_team_id === Number(teamId);
        const tGF = isHome ? g.home_score : g.away_score;
        const tGA = isHome ? g.away_score : g.home_score;

        if (g.status === "final") {
          gp++;
          gf += tGF || 0;
          ga += tGA || 0;

          if (tGF > tGA) w++;
          else if (tGF < tGA) (g.went_ot ? otl++ : l++);

          if (recent.length < 5) recent.push(tGF > tGA ? "W" : "L");
          if (chart.length < 10) {
            chart.push({
              date: (g.game_date || "").slice(5, 10),
              diff: (tGF || 0) - (tGA || 0),
            });
          }
        }
      }

      if (!cancelled) {
        setSummary({
          record: { gp, w, l, otl, gf, ga },
          recent: recent.reverse(),
          chart: chart.reverse(),
        });
      }
    })();
    return () => (cancelled = true);
  }, [teamId]);
  return summary;
}

function useRoster(teamId) {
  const [players, setPlayers] = React.useState([]);
  const reload = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("players")
      .select("id, number, name, position")
      .eq("team_id", teamId)
      .order("number", { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    setPlayers(data || []);
  }, [teamId]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  return { players, reload, setPlayers };
}

function useSkaterStats(teamName) {
  const [rows, setRows] = React.useState([]);
  const [sortKey, setSortKey] = React.useState("pts");
  const [dir, setDir] = React.useState("desc");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!teamName) return;
      const { data, error } = await supabase
        .from("leaders_current")
        .select("player_id, player, team, gp, g, a, pts")
        .eq("team", teamName)
        .order("pts", { ascending: false });
      if (!cancelled) {
        if (error) console.error(error);
        setRows(data || []);
      }
    })();
    return () => (cancelled = true);
  }, [teamName]);

  const sorted = React.useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const vA = a[sortKey] ?? "";
      const vB = b[sortKey] ?? "";
      if (typeof vA === "number" && typeof vB === "number") {
        return dir === "asc" ? vA - vB : vB - vA;
      }
      return dir === "asc"
        ? String(vA).localeCompare(String(vB))
        : String(vB).localeCompare(String(vA));
    });
    return copy;
  }, [rows, sortKey, dir]);

  const setSort = (key) => {
    if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir("desc");
    }
  };

  return { rows: sorted, sortKey, dir, setSort };
}

/* ---------- Page ---------- */
export default function TeamPage() {
  const { id } = useParams();
  const team = useTeam(id);
  const summary = useTeamSummary(id);
  const { players, reload, setPlayers } = useRoster(id);
  const { rows: statsRows, sortKey, dir, setSort } = useSkaterStats(team?.name || "");

  // roster CRUD
  const [adding, setAdding] = React.useState(false);
  const [newPlayer, setNewPlayer] = React.useState({
    number: "",
    name: "",
    position: "F",
  });

  async function addPlayer() {
    if (!newPlayer.name) return;
    const payload = {
      team_id: Number(id),
      number: newPlayer.number ? Number(newPlayer.number) : null,
      name: newPlayer.name,
      position: newPlayer.position || "F",
    };
    const { error } = await supabase.from("players").insert(payload);
    if (error) {
      alert(error.message);
      return;
    }
    setAdding(false);
    setNewPlayer({ number: "", name: "", position: "F" });
    reload();
  }
  async function deletePlayer(pid) {
    if (!window.confirm("Delete this player?")) return;
    const { error } = await supabase.from("players").delete().eq("id", pid);
    if (error) {
      alert(error.message);
      return;
    }
    reload();
  }
  function startEditRow(pid) {
    setPlayers((cur) =>
      cur.map((p) =>
        p.id === pid
          ? { ...p, __edit: { number: p.number ?? "", name: p.name, position: p.position || "F" } }
          : p
      )
    );
  }
  function cancelEditRow(pid) {
    setPlayers((cur) => cur.map((p) => (p.id === pid ? { ...p, __edit: undefined } : p)));
  }
  async function saveEditRow(pid) {
    const row = players.find((p) => p.id === pid);
    if (!row || !row.__edit) return;
    const payload = {
      number: row.__edit.number === "" ? null : Number(row.__edit.number),
      name: row.__edit.name,
      position: row.__edit.position || "F",
    };
    const { error } = await supabase.from("players").update(payload).eq("id", pid);
    if (error) {
      alert(error.message);
      return;
    }
    reload();
  }

  return (
    <div>
      <div className="row gap">
        <Link to="/standings" className="btn ghost small">← Back to Standings</Link>
      </div>

      {/* Header */}
      <div className="row gap wrap">
        <div className="card row gap align-center" style={{ minWidth: 280 }}>
          <img
            src={team?.logo_url || ""}
            alt={team?.short_name || team?.name || "team"}
            style={{ width: 96, height: 96, objectFit: "contain" }}
          />
          <div>
            <div className="h-title" style={{ marginBottom: 6 }}>{team?.name || "Team"}</div>
            <div className="muted">
              GP {summary.record.gp} • W {summary.record.w} • L {summary.record.l} • OTL{" "}
              {summary.record.otl}
            </div>
            <div className="muted">GF {summary.record.gf} • GA {summary.record.ga} • Diff{" "}
              {summary.record.gf - summary.record.ga}</div>
            <div className="row gap xs" style={{ marginTop: 6 }}>
              {summary.recent.map((r, i) => (
                <span key={i} className={`pill ${r === "W" ? "pill-green" : "pill-gray"}`}>{r}</span>
              ))}
              {summary.recent.length === 0 && <span className="muted">No final games yet</span>}
            </div>
          </div>
        </div>

        {/* mini chart, pure SVG */}
        <div className="card" style={{ flex: 1, minWidth: 320 }}>
          <div className="card-title">Goal Difference (last 10)</div>
          <div style={{ width: "100%", height: 160 }}>
            <Sparkline points={summary.chart} />
          </div>
        </div>
      </div>

      {/* Roster manager */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="row space-between align-center">
          <div className="card-title">Roster</div>
          {!adding ? (
            <button className="btn" onClick={() => setAdding(true)}>Add Player</button>
          ) : (
            <div className="row gap">
              <input
                className="in"
                placeholder="#"
                style={{ width: 70 }}
                value={newPlayer.number}
                onChange={(e) => setNewPlayer((s) => ({ ...s, number: e.target.value.replace(/\D/g, "") }))}
              />
              <input
                className="in"
                placeholder="Name"
                value={newPlayer.name}
                onChange={(e) => setNewPlayer((s) => ({ ...s, name: e.target.value }))}
              />
              <select
                className="in"
                value={newPlayer.position}
                onChange={(e) => setNewPlayer((s) => ({ ...s, position: e.target.value }))}
              >
                <option value="F">F</option>
                <option value="D">D</option>
                <option value="G">G</option>
              </select>
              <button className="btn" onClick={addPlayer}>Save</button>
              <button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          )}
        </div>

        <div className="tbl">
          <div className="tr thead">
            <div className="td c">#</div>
            <div className="td left">Player</div>
            <div className="td c">POS</div>
            <div className="td right">Actions</div>
          </div>
          {players.map((p) =>
            p.__edit ? (
              <div className="tr" key={p.id}>
                <div className="td c" style={{ width: 90 }}>
                  <input
                    className="in"
                    style={{ width: 70, textAlign: "center" }}
                    value={p.__edit.number}
                    onChange={(e) =>
                      setPlayers((cur) =>
                        cur.map((x) =>
                          x.id === p.id ? { ...x, __edit: { ...x.__edit, number: e.target.value.replace(/\D/g, "") } } : x
                        )
                      )
                    }
                  />
                </div>
                <div className="td left">
                  <input
                    className="in"
                    value={p.__edit.name}
                    onChange={(e) =>
                      setPlayers((cur) =>
                        cur.map((x) =>
                          x.id === p.id ? { ...x, __edit: { ...x.__edit, name: e.target.value } } : x
                        )
                      )
                    }
                  />
                </div>
                <div className="td c" style={{ width: 110 }}>
                  <select
                    className="in"
                    value={p.__edit.position}
                    onChange={(e) =>
                      setPlayers((cur) =>
                        cur.map((x) =>
                          x.id === p.id ? { ...x, __edit: { ...x.__edit, position: e.target.value } } : x
                        )
                      )
                    }
                  >
                    <option value="F">F</option>
                    <option value="D">D</option>
                    <option value="G">G</option>
                  </select>
                </div>
                <div className="td right" style={{ width: 220 }}>
                  <button className="btn" onClick={() => saveEditRow(p.id)}>Save</button>
                  <button className="btn ghost" onClick={() => cancelEditRow(p.id)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="tr" key={p.id}>
                <div className="td c" style={{ width: 90 }}>{p.number ?? ""}</div>
                <div className="td left">{p.name}</div>
                <div className="td c" style={{ width: 110 }}>{p.position || ""}</div>
                <div className="td right" style={{ width: 220 }}>
                  <button className="btn" onClick={() => startEditRow(p.id)}>Edit</button>
                  <button className="btn danger" onClick={() => deletePlayer(p.id)}>Delete</button>
                </div>
              </div>
            )
          )}
          {players.length === 0 && (
            <div className="tr">
              <div className="td left muted">No players yet.</div>
            </div>
          )}
        </div>
      </div>

      {/* Skater stats */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Player Stats (sortable)</div>
        <div className="tbl">
          <div className="tr thead">
            <div className="td left clickable" onClick={() => setSort("player")}>
              Player {sortKey === "player" ? (dir === "asc" ? "▲" : "▼") : ""}
            </div>
            <div className="td c clickable" onClick={() => setSort("gp")}>
              GP {sortKey === "gp" ? (dir === "asc" ? "▲" : "▼") : ""}
            </div>
            <div className="td c clickable" onClick={() => setSort("g")}>
              G {sortKey === "g" ? (dir === "asc" ? "▲" : "▼") : ""}
            </div>
            <div className="td c clickable" onClick={() => setSort("a")}>
              A {sortKey === "a" ? (dir === "asc" ? "▲" : "▼") : ""}
            </div>
            <div className="td c clickable" onClick={() => setSort("pts")}>
              PTS {sortKey === "pts" ? (dir === "asc" ? "▲" : "▼") : ""}
            </div>
            <div className="td right" />
          </div>
          {statsRows.map((r) => (
            <div className="tr" key={r.player_id}>
              <div className="td left">
                <Link className="link" to={`/players/${r.player_id}`}>{r.player}</Link>
              </div>
              <div className="td c">{r.gp}</div>
              <div className="td c">{r.g}</div>
              <div className="td c">{r.a}</div>
              <div className="td c b">{r.pts}</div>
              <div className="td right">
                <Link className="btn ghost small" to={`/players/${r.player_id}`}>Profile</Link>
              </div>
            </div>
          ))}
          {statsRows.length === 0 && (
            <div className="tr"><div className="td muted">No stats yet.</div></div>
          )}
        </div>
      </div>
    </div>
  );
}
