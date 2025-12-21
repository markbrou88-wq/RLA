// src/pages/TeamPage.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useSeason } from "../contexts/SeasonContext";
import { useCategory } from "../contexts/CategoryContext";

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
          if (chart.length < 10)
            chart.push({
              date: (g.game_date || "").slice(5, 10),
              diff: (tGF || 0) - (tGA || 0),
            });
        }
      }
      if (!stop)
        setSummary({
          record: { gp, w, l, otl, gf, ga },
          recent: recent.reverse(),
          chart: chart.reverse(),
        });
    })();
    return () => (stop = true);
  }, [teamId]);
  return summary;
}

/**
 * Roster from team_players scoped to season/category
 */
function useRoster(teamId, seasonId, categoryId) {
  const [players, setPlayers] = React.useState([]);

  const reload = React.useCallback(async () => {
    if (!seasonId || !categoryId) {
      setPlayers([]);
      return;
    }

    const { data, error } = await supabase
      .from("team_players")
      .select("player:players(id,number,name,position)")
      .eq("team_id", Number(teamId))
      .eq("season_id", Number(seasonId))
      .eq("category_id", Number(categoryId))
      .eq("is_active", true)
      .order("player(number)", { ascending: true });

    if (error) return console.error(error);
    setPlayers((data || []).map((r) => r.player).filter(Boolean));
  }, [teamId, seasonId, categoryId]);

  React.useEffect(() => void reload(), [reload]);
  return { players, setPlayers, reload };
}

/** Stats from leaders_current */
function useStatsForPlayers(playerIds, seasonId, categoryId) {
  const [map, setMap] = React.useState(new Map());

  React.useEffect(() => {
    if (!seasonId || !categoryId || !playerIds || playerIds.length === 0) {
      setMap(new Map());
      return;
    }
    let stop = false;
    (async () => {
      const { data, error } = await supabase
        .from("leaders_current")
        .select("player_id, gp, g, a, pts")
        .eq("season_id", Number(seasonId))
        .eq("category_id", Number(categoryId))
        .in("player_id", playerIds);

      if (error) {
        console.error("stats fetch error", error);
        if (!stop) setMap(new Map());
        return;
      }
      const m = new Map();
      for (const r of data || []) {
        m.set(Number(r.player_id), {
          gp: r.gp ?? 0,
          g: r.g ?? 0,
          a: r.a ?? 0,
          pts: r.pts ?? 0,
        });
      }
      if (!stop) setMap(m);
    })();

    return () => {
      stop = true;
    };
  }, [playerIds, seasonId, categoryId]);

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
  const { seasonId } = useSeason();
  const { categoryId } = useCategory();

  const team = useTeam(id);
  const summary = useTeamSummary(id);
  const { players, setPlayers, reload } = useRoster(id, seasonId, categoryId);

  const playerIds = React.useMemo(() => players.map((p) => p.id), [players]);
  const statsMap = useStatsForPlayers(playerIds, seasonId, categoryId);

  const { widths, startResize } = useResizableColumns(id, {
    player: 260,
    number: 70,
    pos: 70,
    gp: 70,
    g: 70,
    a: 70,
    pts: 80,
    actions: 200,
  });

  // ---- Auth ----
  const [user, setUser] = React.useState(null);
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (mounted) setUser(data?.user ?? null);
    })();
    const { data: authListener } = supabase.auth.onAuthStateChange((_e, s) => {
      if (mounted) setUser(s?.user ?? null);
    });
    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);
  const isLoggedIn = !!user;

  // ---- Add / Edit / Delete ----
  const [adding, setAdding] = React.useState(false);
  const [addMode, setAddMode] = React.useState("new"); // NEW: "new" | "existing"
  const [newPlayer, setNewPlayer] = React.useState({ number: "", name: "", position: "F" });

  // NEW: existing players list
  const [existingPlayers, setExistingPlayers] = React.useState([]);
  const [selectedExisting, setSelectedExisting] = React.useState("");

  // Load existing players not already on this roster
  React.useEffect(() => {
    if (!adding || addMode !== "existing" || !seasonId || !categoryId) {
      setExistingPlayers([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id,number,name,position")
        .not(
          "id",
          "in",
          `(${supabase
            .from("team_players")
            .select("player_id")
            .eq("team_id", Number(id))
            .eq("season_id", Number(seasonId))
            .eq("category_id", Number(categoryId))})`
        );
      if (error) console.error(error);
      setExistingPlayers(data || []);
    })();
  }, [adding, addMode, id, seasonId, categoryId]);

  async function addPlayer() {
    if (!newPlayer.name) return;
    if (!seasonId || !categoryId) {
      alert("Please select a Season and Category first.");
      return;
    }

    const payloadPlayer = {
      number: newPlayer.number === "" ? null : Number(newPlayer.number),
      name: newPlayer.name,
      position: newPlayer.position || "F",
    };

    const { data: insertedPlayer, error: pErr } = await supabase
      .from("players")
      .insert(payloadPlayer)
      .select("id")
      .single();
    if (pErr) return alert(pErr.message);

    const payloadTeamPlayer = {
      team_id: Number(id),
      player_id: Number(insertedPlayer.id),
      season_id: Number(seasonId),
      category_id: Number(categoryId),
      is_active: true,
    };

    const { error: tpErr } = await supabase.from("team_players").insert(payloadTeamPlayer);
    if (tpErr) return alert(tpErr.message);

    setAdding(false);
    setNewPlayer({ number: "", name: "", position: "F" });
    reload();
  }

  async function addExistingPlayer() {
    if (!selectedExisting) return;
    if (!seasonId || !categoryId) {
      alert("Please select a Season and Category first.");
      return;
    }

    const { error } = await supabase.from("team_players").insert({
      team_id: Number(id),
      player_id: Number(selectedExisting),
      season_id: Number(seasonId),
      category_id: Number(categoryId),
      is_active: true,
    });
    if (error) return alert(error.message);

    setAdding(false);
    setSelectedExisting("");
    reload();
  }

  function beginEdit(pid) {
    setPlayers((cur) =>
      cur.map((p) =>
        p.id === pid
          ? { ...p, __edit: { number: p.number ?? "", name: p.name, position: p.position || "F" } }
          : p
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
    if (!window.confirm("Remove this player from this team roster for the selected season?")) return;
    if (!seasonId || !categoryId) {
      alert("Please select a Season and Category first.");
      return;
    }
    const { error } = await supabase
      .from("team_players")
      .update({ is_active: false })
      .eq("team_id", Number(id))
      .eq("player_id", Number(pid))
      .eq("season_id", Number(seasonId))
      .eq("category_id", Number(categoryId));
    if (error) return alert(error.message);
    reload();
  }

  // ---- Build rows ----
  const rows = React.useMemo(() => {
    return players.map((p) => {
      const s = statsMap.get(p.id) || { gp: 0, g: 0, a: 0, pts: 0 };
      return {
        id: p.id,
        number: p.number ?? "",
        name: p.name,
        position: p.position || "",
        gp: s.gp,
        g: s.g,
        a: s.a,
        pts: s.pts,
        __edit: p.__edit,
      };
    });
  }, [players, statsMap]);

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
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const Th = ({ col, label, sortKeyFor }) => (
    <div className="td th-resizable" style={{ width: widths[col], minWidth: widths[col], maxWidth: widths[col] }}>
      <button className="th-btn" onClick={() => clickSort(sortKeyFor ?? col)} title="Click to sort">
        {label}{" "}
        {sortKey === (sortKeyFor ?? col) ? <span className="muted">{sortDir === "asc" ? "▲" : "▼"}</span> : null}
      </button>
      <span
        className="col-resize grip"
        onMouseDown={(e) => startResize(col, e.clientX)}
        aria-hidden
      />
    </div>
  );

  return (
    <div className="team-page">
      <div className="row gap">
        <Link to="/" className="btn ghost small">← Back to Standings</Link>
      </div>

      <div className="row gap wrap">
        <div className="card row gap align-center" style={{ minWidth: 300 }}>
          <img src={team?.logo_url || ""} alt={team?.short_name || team?.name || "team"} style={{ width: 96, height: 96, objectFit: "contain" }} />
          <div>
            <div className="h-title" style={{ marginBottom: 6 }}>{team?.name || "Team"}</div>
            <div className="muted">GP {summary.record.gp} • W {summary.record.w} • L {summary.record.l} • OTL {summary.record.otl}</div>
            <div className="muted">GF {summary.record.gf} • GA {summary.record.ga} • Diff {summary.record.gf - summary.record.ga}</div>
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
        {isLoggedIn && (
          <>
            {!adding ? (
              <button className="btn" onClick={() => setAdding(true)}>Add Player</button>
            ) : (
              <div className="row gap wrap">
                <select className="in" value={addMode} onChange={(e) => setAddMode(e.target.value)}>
                  <option value="new">New</option>
                  <option value="existing">Existing</option>
                </select>

                {addMode === "new" ? (
                  <>
                    <input className="in" placeholder="#" style={{ width: 70, textAlign: "center" }}
                      value={newPlayer.number}
                      onChange={(e) => setNewPlayer((s) => ({ ...s, number: e.target.value.replace(/\D/g, "") }))} />
                    <input className="in" placeholder="Player name" style={{ width: 260 }}
                      value={newPlayer.name}
                      onChange={(e) => setNewPlayer((s) => ({ ...s, name: e.target.value }))} />
                    <select className="in" style={{ width: 80 }} value={newPlayer.position}
                      onChange={(e) => setNewPlayer((s) => ({ ...s, position: e.target.value }))}>
                      <option value="F">F</option>
                      <option value="D">D</option>
                      <option value="G">G</option>
                    </select>
                    <button className="btn" onClick={addPlayer}>Save</button>
                  </>
                ) : (
                  <>
                    <select className="in" style={{ width: 260 }} value={selectedExisting}
                      onChange={(e) => setSelectedExisting(e.target.value)}>
                      <option value="">Select existing player…</option>
                      {existingPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          #{p.number ?? ""} {p.name}
                        </option>
                      ))}
                    </select>
                    <button className="btn" onClick={addExistingPlayer}>Add</button>
                  </>
                )}

                <button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Table */}
      <div className="tbl">
        <div className="tr thead">
          <Th col="player" label="Player" sortKeyFor="name" />
          <Th col="number" label="#" />
          <Th col="pos" label="POS" sortKeyFor="position" />
          <Th col="gp" label="GP" />
          <Th col="g" label="G" />
          <Th col="a" label="A" />
          <Th col="pts" label="PTS" />
          {isLoggedIn && <Th col="actions" label="Actions" />}
        </div>

        {sortedRows.map((r) =>
          r.__edit ? (
            <div className="tr" key={r.id}>
              <div className="td" style={{ width: widths.player }}><input className="in" value={r.__edit.name}
                onChange={(e) => setPlayers((cur) =>
                  cur.map((x) => (x.id === r.id ? { ...x, __edit: { ...x.__edit, name: e.target.value } } : x))
                )} /></div>
              <div className="td c" style={{ width: widths.number }}><input className="in" style={{ textAlign: "center" }} value={r.__edit.number}
                onChange={(e) => setPlayers((cur) =>
                  cur.map((x) =>
                    x.id === r.id
                      ? { ...x, __edit: { ...x.__edit, number: e.target.value.replace(/\D/g, "") } }
                      : x
                  )
                )} /></div>
              <div className="td c" style={{ width: widths.pos }}>
                <select className="in" value={r.__edit.position}
                  onChange={(e) => setPlayers((cur) =>
                    cur.map((x) =>
                      x.id === r.id ? { ...x, __edit: { ...x.__edit, position: e.target.value } } : x
                    )
                  )}>
                  <option value="F">F</option>
                  <option value="D">D</option>
                  <option value="G">G</option>
                </select>
              </div>
              <div className="td c" style={{ width: widths.gp }}>{r.gp}</div>
              <div className="td c" style={{ width: widths.g }}>{r.g}</div>
              <div className="td c" style={{ width: widths.a }}>{r.a}</div>
              <div className="td c b" style={{ width: widths.pts }}>{r.pts}</div>
              {isLoggedIn && (
                <div className="td right" style={{ width: widths.actions }}>
                  <button className="btn" onClick={() => saveEdit(r.id)}>Save</button>
                  <button className="btn ghost" style={{ marginLeft: 8 }} onClick={() => cancelEdit(r.id)}>Cancel</button>
                </div>
              )}
            </div>
          ) : (
            <div className="tr" key={r.id}>
              <div className="td left ellipsis" style={{ width: widths.player }} title={r.name}>
                <Link className="link" to={`/players/${r.id}`}>{r.name}</Link>
              </div>
              <div className="td c" style={{ width: widths.number }}>{r.number}</div>
              <div className="td c" style={{ width: widths.pos }}>{r.position}</div>
              <div className="td c" style={{ width: widths.gp }}>{r.gp}</div>
              <div className="td c" style={{ width: widths.g }}>{r.g}</div>
              <div className="td c" style={{ width: widths.a }}>{r.a}</div>
              <div className="td c b" style={{ width: widths.pts }}>{r.pts}</div>
              {isLoggedIn && (
                <div className="td right" style={{ width: widths.actions }}>
                  <button className="btn" onClick={() => beginEdit(r.id)}>Edit</button>
                  <button className="btn danger" style={{ marginLeft: 8 }} onClick={() => deletePlayer(r.id)}>Delete</button>
                </div>
              )}
            </div>
          )
        )}

        {sortedRows.length === 0 && (
          <div className="tr">
            <div className="td muted">
              {!seasonId || !categoryId
                ? "Select a Season and Category to view this team's roster."
                : "No players found."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
