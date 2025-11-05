// src/pages/TeamPage.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

/* ---------- Tiny sparkline (no deps) ---------- */
function Sparkline({ points = [], width = 600, height = 160, stroke = "#3b82f6" }) {
  if (!points.length) return <div className="muted">No final games yet</div>;
  const pad = 8;
  const xs = points.map((_, i) => i);
  const minX = 0;
  const maxX = xs.length - 1 || 1;
  const vals = points.map((p) => p.diff ?? 0);
  const minY = Math.min(...vals, 0);
  const maxY = Math.max(...vals, 0);
  const xScale = (x) => pad + ((x - minX) / (maxX - minX || 1)) * (width - pad * 2);
  const yScale = (y) => {
    const rng = maxY - minY || 1;
    const t = (y - minY) / rng;
    return height - pad - t * (height - pad * 2);
  };
  const zeroY = yScale(0);
  const path = xs
    .map((x, i) => `${i ? "L" : "M"} ${xScale(x)} ${yScale(points[i].diff ?? 0)}`)
    .join(" ");
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img">
      <line x1={pad} y1={zeroY} x2={width - pad} y2={zeroY} stroke="#e5e7eb" />
      <path d={path} stroke={stroke} fill="none" strokeWidth="3" />
      {xs.map((x, i) => (
        <circle key={i} cx={xScale(x)} cy={yScale(points[i].diff ?? 0)} r="3.5" fill={stroke} />
      ))}
    </svg>
  );
}

/* ---------- Data hooks ---------- */
function useTeam(teamId) {
  const [team, setTeam] = React.useState(null);
  React.useEffect(() => {
    let stop = false;
    (async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id,name,short_name,logo_url")
        .eq("id", teamId)
        .single();
      if (!stop) {
        if (error) console.error(error);
        setTeam(data);
      }
    })();
    return () => (stop = true);
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
    let stop = false;
    (async () => {
      const { data: games, error } = await supabase
        .from("games")
        .select("id,game_date,home_team_id,away_team_id,home_score,away_score,status,went_ot")
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .order("game_date", { ascending: false })
        .limit(20);
      if (error) return console.error(error);

      let gp = 0, w = 0, l = 0, otl = 0, gf = 0, ga = 0;
      const recent = [];
      const chart = [];
      for (const g of games) {
        const isHome = g.home_team_id === Number(teamId);
        const tGF = isHome ? g.home_score : g.away_score;
        const tGA = isHome ? g.away_score : g.home_score;
        if (g.status === "final") {
          gp++; gf += tGF || 0; ga += tGA || 0;
          if (tGF > tGA) w++; else if (tGF < tGA) (g.went_ot ? otl++ : l++);
          if (recent.length < 5) recent.push(tGF > tGA ? "W" : "L");
          if (chart.length < 10)
            chart.push({ date: (g.game_date || "").slice(5, 10), diff: (tGF || 0) - (tGA || 0) });
        }
      }
      if (!stop) setSummary({ record: { gp, w, l, otl, gf, ga }, recent: recent.reverse(), chart: chart.reverse() });
    })();
    return () => (stop = true);
  }, [teamId]);
  return summary;
}

function useRoster(teamId) {
  const [players, setPlayers] = React.useState([]);
  const reload = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("players")
      .select("id,number,name,position")
      .eq("team_id", teamId)
      .order("number", { ascending: true });
    if (error) return console.error(error);
    setPlayers(data || []);
  }, [teamId]);
  React.useEffect(() => void reload(), [reload]);
  return { players, setPlayers, reload };
}

/** Pull skater stats like the Stats tab:
 *  - G/A/PTS from player_stats_current
 *  - GP from leaders_current
 *  Uses either column names (g/a/pts or goals/assists/points) safely.
 */
function useLeadersForPlayers(playerIds) {
  const [map, setMap] = React.useState(new Map());

  React.useEffect(() => {
    if (!playerIds.length) { setMap(new Map()); return; }
    let stop = false;
    (async () => {
      const [ps, gp] = await Promise.all([
        supabase
          .from("player_stats_current")
          .select("player_id, g, a, pts, goals, assists, points")
          .in("player_id", playerIds),
        supabase
          .from("leaders_current")
          .select("player_id, gp")
          .in("player_id", playerIds),
      ]);

      if (ps.error) console.error(ps.error);
      if (gp.error) console.error(gp.error);

      const gpMap = new Map();
      (gp.data || []).forEach((r) => gpMap.set(r.player_id, r.gp ?? 0));

      const m = new Map();
      for (const r of ps.data || []) {
        const g = r.g ?? r.goals ?? 0;
        const a = r.a ?? r.assists ?? 0;
        const pts = r.pts ?? r.points ?? (g + a);
        const val = { g, a, pts, gp: gpMap.get(r.player_id) ?? 0 };
        m.set(r.player_id, val);
      }
      if (!stop) setMap(m);
    })();
    return () => { stop = true; };
  }, [playerIds]);

  return map;
}

/* ---------- Column resizing ---------- */
const MIN_W = 56;
function useResizableColumns(teamId, defaults) {
  const key = React.useMemo(() => `teamTableWidths:${teamId}`, [teamId]);
  const [widths, setWidths] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved && typeof saved === "object") return { ...defaults, ...saved };
    } catch {}
    return { ...defaults };
  });
  React.useEffect(() => localStorage.setItem(key, JSON.stringify(widths)), [key, widths]);

  const startResize = (col, startX) => {
    const startW = widths[col] ?? defaults[col] ?? 120;
    const onMove = (e) => {
      const dx = e.clientX - startX;
      setWidths((w) => ({ ...w, [col]: Math.max(MIN_W, startW + dx) }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  return { widths, startResize };
}

/* ---------- Page ---------- */
export default function TeamPage() {
  const { id } = useParams();
  const team = useTeam(id);
  const summary = useTeamSummary(id);
  const { players, setPlayers, reload } = useRoster(id);

  const playerIds = React.useMemo(() => players.map((p) => p.id), [players]);
  const statsMap = useLeadersForPlayers(playerIds);

  const { widths, startResize } = useResizableColumns(id, {
    player: 260, number: 70, pos: 70, gp: 70, g: 70, a: 70, pts: 80, actions: 200,
  });

  // Add / Edit / Delete (unchanged behaviors)
  const [adding, setAdding] = React.useState(false);
  const [newPlayer, setNewPlayer] = React.useState({ number: "", name: "", position: "F" });

  async function addPlayer() {
    if (!newPlayer.name) return;
    const payload = {
      team_id: Number(id),
      number: newPlayer.number === "" ? null : Number(newPlayer.number),
      name: newPlayer.name,
      position: newPlayer.position || "F",
    };
    const { error } = await supabase.from("players").insert(payload);
    if (error) return alert(error.message);
    setAdding(false);
    setNewPlayer({ number: "", name: "", position: "F" });
    reload();
  }
  function beginEdit(pid) {
    setPlayers((cur) =>
      cur.map((p) =>
        p.id === pid ? { ...p, __edit: { number: p.number ?? "", name: p.name, position: p.position || "F" } } : p
      )
    );
  }
  function cancelEdit(pid) {
    setPlayers((cur) => cur.map((p) => (p.id === pid ? { ...p, __edit: undefined } : p)));
  }
  async function saveEdit(pid) {
    const row = players.find((p) => p.id === pid);
    if (!row || !row.__edit) return;
    const payload = {
      number: row.__edit.number === "" ? null : Number(row.__edit.number),
      name: row.__edit.name,
      position: row.__edit.position || "F",
    };
    const { error } = await supabase.from("players").update(payload).eq("id", pid);
    if (error) return alert(error.message);
    reload();
  }
  async function deletePlayer(pid) {
    if (!window.confirm("Delete this player?")) return;
    const { error } = await supabase.from("players").delete().eq("id", pid);
    if (error) return alert(error.message);
    reload();
  }

  // Display rows (merge stats from maps)
  const rows = React.useMemo(() => {
    return players.map((p) => {
      const s = statsMap.get(p.id) || { gp: 0, g: 0, a: 0, pts: 0 };
      return {
        id: p.id, number: p.number ?? "", name: p.name, position: p.position || "",
        gp: s.gp, g: s.g, a: s.a, pts: s.pts, __edit: p.__edit,
      };
    });
  }, [players, statsMap]);

  // sorting
  const [sortKey, setSortKey] = React.useState("pts");
  const [sortDir, setSortDir] = React.useState("desc");
  const sortedRows = React.useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const A = a[sortKey] ?? "";
      const B = b[sortKey] ?? "";
      const isNum = typeof A === "number" && typeof B === "number";
      const cmp = isNum ? A - B : String(A).localeCompare(String(B));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);
  const clickSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const Th = ({ col, label, sortKeyFor }) => (
    <div
      className="td th-resizable"
      style={{ width: widths[col], minWidth: widths[col], maxWidth: widths[col] }}
    >
      <button
        className="th-btn"
        onClick={() => clickSort(sortKeyFor ?? col)}
        title="Click to sort"
        style={{ color: "#111" }}  // keep header readable on any theme
      >
        {label} {sortKey === (sortKeyFor ?? col) ? <span className="muted">{sortDir === "asc" ? "▲" : "▼"}</span> : null}
      </button>
      {/* visible resize grip */}
      <span
        className="col-resize grip"
        onMouseDown={(e) => startResize(col, e.clientX)}
        aria-hidden
        style={{
          width: 8, right: -3, borderLeft: "2px solid #d0d5dd",
          background: "repeating-linear-gradient(180deg,#e5e7eb 0,#e5e7eb 4px,#fff 4px,#fff 8px)"
        }}
      />
    </div>
  );

  return (
    <div>
      {/* Back + header */}
      <div className="row gap">
        <Link to="/standings" className="btn ghost small">← Back to Standings</Link>
      </div>

      <div className="row gap wrap">
        <div className="card row gap align-center" style={{ minWidth: 300 }}>
          <img src={team?.logo_url || ""} alt={team?.short_name || team?.name || "team"} style={{ width: 96, height: 96, objectFit: "contain" }} />
          <div>
            <div className="h-title" style={{ marginBottom: 6 }}>{team?.name || "Team"}</div>
            <div className="muted">
              GP {summary.record.gp} • W {summary.record.w} • L {summary.record.l} • OTL {summary.record.otl}
            </div>
            <div className="muted">
              GF {summary.record.gf} • GA {summary.record.ga} • Diff {summary.record.gf - summary.record.ga}
            </div>
            <div className="row gap xs" style={{ marginTop: 6 }}>
              {summary.recent.map((r, i) => (
                <span key={i} className={`pill ${r === "W" ? "pill-green" : "pill-gray"}`}>{r}</span>
              ))}
              {summary.recent.length === 0 && <span className="muted">No final games yet</span>}
            </div>
          </div>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 320 }}>
          <div className="card-title">Goal Difference (last 10)</div>
          <div style={{ width: "100%", height: 160 }}>
            <Sparkline points={summary.chart} />
          </div>
        </div>
      </div>

      {/* Add player bar */}
      <div className="row space-between align-center" style={{ marginTop: 16, marginBottom: 8 }}>
        <div className="card-title">Roster &amp; Player Stats</div>
        {!adding ? (
          <button className="btn" onClick={() => setAdding(true)}>Add Player</button>
        ) : (
          <div className="row gap">
            <input className="in" placeholder="#" style={{ width: 70, textAlign: "center" }}
              value={newPlayer.number}
              onChange={(e) => setNewPlayer((s) => ({ ...s, number: e.target.value.replace(/\D/g, "") }))} />
            <input className="in" placeholder="Player name" style={{ width: 260 }}
              value={newPlayer.name} onChange={(e) => setNewPlayer((s) => ({ ...s, name: e.target.value }))} />
            <select className="in" style={{ width: 80 }} value={newPlayer.position}
              onChange={(e) => setNewPlayer((s) => ({ ...s, position: e.target.value }))}>
              <option value="F">F</option><option value="D">D</option><option value="G">G</option>
            </select>
            <button className="btn" onClick={addPlayer}>Save</button>
            <button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        )}
      </div>

      {/* Combined table */}
      <div className="tbl">
        <div className="tr thead">
          <Th col="player" label="Player" sortKeyFor="name" />
          <Th col="number" label="#" />
          <Th col="pos" label="POS" sortKeyFor="position" />
          <Th col="gp" label="GP" />
          <Th col="g" label="G" />
          <Th col="a" label="A" />
          <Th col="pts" label="PTS" />
          <Th col="actions" label="Actions" />
        </div>

        {sortedRows.map((r) =>
          r.__edit ? (
            <div className="tr" key={r.id}>
              <div className="td" style={{ width: widths.player, minWidth: widths.player, maxWidth: widths.player }}>
                <input className="in" value={r.__edit.name}
                  onChange={(e) =>
                    setPlayers((cur) => cur.map((x) => x.id === r.id ? { ...x, __edit: { ...x.__edit, name: e.target.value } } : x))
                  } />
              </div>
              <div className="td c" style={{ width: widths.number, minWidth: widths.number, maxWidth: widths.number }}>
                <input className="in" style={{ textAlign: "center" }} value={r.__edit.number}
                  onChange={(e) =>
                    setPlayers((cur) =>
                      cur.map((x) => x.id === r.id
                        ? { ...x, __edit: { ...x.__edit, number: e.target.value.replace(/\D/g, "") } }
                        : x)
                    )} />
              </div>
              <div className="td c" style={{ width: widths.pos, minWidth: widths.pos, maxWidth: widths.pos }}>
                <select className="in" value={r.__edit.position}
                  onChange={(e) =>
                    setPlayers((cur) => cur.map((x) => x.id === r.id ? { ...x, __edit: { ...x.__edit, position: e.target.value } } : x))
                  }>
                  <option value="F">F</option><option value="D">D</option><option value="G">G</option>
                </select>
              </div>
              <div className="td c" style={{ width: widths.gp, minWidth: widths.gp, maxWidth: widths.gp }}>{r.gp}</div>
              <div className="td c" style={{ width: widths.g, minWidth: widths.g, maxWidth: widths.g }}>{r.g}</div>
              <div className="td c" style={{ width: widths.a, minWidth: widths.a, maxWidth: widths.a }}>{r.a}</div>
              <div className="td c b" style={{ width: widths.pts, minWidth: widths.pts, maxWidth: widths.pts }}>{r.pts}</div>
              <div className="td right" style={{ width: widths.actions, minWidth: widths.actions, maxWidth: widths.actions }}>
                <button className="btn" onClick={() => saveEdit(r.id)}>Save</button>
                <button className="btn ghost" style={{ marginLeft: 8 }} onClick={() => cancelEdit(r.id)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="tr" key={r.id}>
              <div className="td left ellipsis"
                   style={{ width: widths.player, minWidth: widths.player, maxWidth: widths.player }}
                   title={r.name}>
                <Link className="link" to={`/players/${r.id}`}>{r.name}</Link>
              </div>
              <div className="td c" style={{ width: widths.number, minWidth: widths.number, maxWidth: widths.number }}>{r.number}</div>
              <div className="td c" style={{ width: widths.pos, minWidth: widths.pos, maxWidth: widths.pos }}>{r.position}</div>
              <div className="td c" style={{ width: widths.gp, minWidth: widths.gp, maxWidth: widths.gp }}>{r.gp}</div>
              <div className="td c" style={{ width: widths.g, minWidth: widths.g, maxWidth: widths.g }}>{r.g}</div>
              <div className="td c" style={{ width: widths.a, minWidth: widths.a, maxWidth: widths.a }}>{r.a}</div>
              <div className="td c b" style={{ width: widths.pts, minWidth: widths.pts, maxWidth: widths.pts }}>{r.pts}</div>
              <div className="td right" style={{ width: widths.actions, minWidth: widths.actions, maxWidth: widths.actions }}>
                <button className="btn" onClick={() => beginEdit(r.id)}>Edit</button>
                <button className="btn danger" style={{ marginLeft: 8 }} onClick={() => deletePlayer(r.id)}>Delete</button>
              </div>
            </div>
          )
        )}

        {sortedRows.length === 0 && (
          <div className="tr">
            <div className="td muted">No players found.</div>
          </div>
        )}
      </div>
    </div>
  );
}
