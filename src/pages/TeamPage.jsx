// src/pages/TeamPage.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useSeason } from "../contexts/SeasonContext";
import { useCategory } from "../contexts/CategoryContext";
import { useI18n } from "../i18n";


/* ---------- Tiny sparkline (no deps) ---------- */

function SparklineGFGA({
  points = [],
  width = 600,
  height = 160,
  colorGF = "#2563eb", // blue
  colorGA = "#dc2626", // red
}) {
  if (!points.length) return <div className="muted">Aucun match final</div>;

  const pad = 8;
  const xs = points.map((_, i) => i);
  const maxX = xs.length - 1 || 1;

  const values = points.flatMap(p => [p.gf, p.ga]);
  const minY = 0;
  const maxY = Math.max(...values, 1);

  const xScale = (x) =>
    pad + (x / maxX) * (width - pad * 2);

  const yScale = (y) =>
    height - pad - (y / maxY) * (height - pad * 2);


// last game info (SAFE)
const last = points[points.length - 1];
const lastDiff = (last?.gf ?? 0) - (last?.ga ?? 0);

const pathFor = (key) =>
  xs
    .map((x, i) =>
      `${i ? "L" : "M"} ${xScale(x)} ${yScale(points[i][key])}`
    )
    .join(" ");



  
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>

{/* Baseline */}
<line
  x1={pad}
  y1={yScale(0)}
  x2={width - pad}
  y2={yScale(0)}
  stroke="#e5e7eb"
/>

      
      {/* GF */}
      <path d={pathFor("gf")} stroke={colorGF} fill="none" strokeWidth="3" />

      {xs.map((x, i) => {
  const isLast = i === xs.length - 1;
  return (
    <circle
      key={`gf-${i}`}
      cx={xScale(x)}
      cy={yScale(points[i].gf)}
      r={isLast ? 5 : 3.5}
      fill={colorGF}
    />
  );
})}


      {/* GA */}
      <path d={pathFor("ga")} stroke={colorGA} fill="none" strokeWidth="3" />


      {xs.map((x, i) => {
  const isLast = i === xs.length - 1;
  return (
    <circle
      key={`ga-${i}`}
      cx={xScale(x)}
      cy={yScale(points[i].ga)}
      r={isLast ? 5 : 3.5}
      fill={colorGA}
    />
  );
})}


      {/* Last game diff label */}
<text
  x={xScale(xs.length - 1) + 6}
  y={yScale(last.gf)}
  fontSize="12"
  fontWeight="600"
  fill={lastDiff >= 0 ? colorGF : colorGA}
>
  {lastDiff >= 0 ? "+" : ""}
  {lastDiff}
</text>

      
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
    gf: tGF || 0,
    ga: tGA || 0,
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
 * (jersey number is team_players.number)
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
      .select("number, player:players(id,name,position)")
      .eq("team_id", Number(teamId))
      .eq("season_id", Number(seasonId))
      .eq("category_id", Number(categoryId))
      .eq("is_active", true)
      .order("number", { ascending: true, nullsFirst: false });

    if (error) return console.error(error);

    // Map into flat player objects but keep roster number from team_players
    setPlayers(
      (data || [])
        .map((r) => ({
          ...(r.player || {}),
          number: r.number ?? "",
        }))
        .filter((p) => p && p.id != null)
    );
  }, [teamId, seasonId, categoryId]);

  React.useEffect(() => void reload(), [reload]);
  return { players, setPlayers, reload };
}

function useGoaliesForTeam(teamId, seasonId, categoryId) {
  const [goalies, setGoalies] = React.useState([]);

  React.useEffect(() => {
    if (!teamId || !seasonId || !categoryId) {
      setGoalies([]);
      return;
    }

    let stop = false;

    (async () => {
     const { data, error } = await supabase
        .from("goalie_stats_current")
        .select(`
          player_id,
          goalie,
          team,
          gp,
          sa,
          ga,
          sv_pct,
          gaa,
          toi_seconds,
          wins,
          losses,
          otl,
          sol
        `)
        .eq("team_id", Number(teamId))
        .eq("season_id", Number(seasonId))
        .eq("category_id", Number(categoryId));

      if (!stop) {
        if (error) {
          console.error(error);
          setGoalies([]);
        } else {
          setGoalies(data || []);
        }
      }
    })();

    return () => (stop = true);
  }, [teamId, seasonId, categoryId]);

  return goalies;
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
  const { t } = useI18n();


  const team = useTeam(id);
  const summary = useTeamSummary(id);
  const { players, setPlayers, reload } = useRoster(id, seasonId, categoryId);
 const goalies = useGoaliesForTeam(id, seasonId, categoryId);



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
const [addMode, setAddMode] = React.useState("existing"); // default = existing

  // NEW player (jersey number goes to team_players.number)
  const [newPlayer, setNewPlayer] = React.useState({ number: "", name: "", position: "F" });

  // EXISTING player selection + jersey input
  const [existingPlayers, setExistingPlayers] = React.useState([]);
  const [selectedExisting, setSelectedExisting] = React.useState("");
  const [existingNumber, setExistingNumber] = React.useState("");

  // Load existing players not already on this roster (for this team/season/category)
  React.useEffect(() => {
    if (!adding || addMode !== "existing" || !seasonId || !categoryId) {
      setExistingPlayers([]);
      return;
    }

    (async () => {
      try {
        const { data: usedRows, error: usedErr } = await supabase
          .from("team_players")
          .select("player_id")
          .eq("team_id", Number(id))
          .eq("season_id", Number(seasonId))
          .eq("category_id", Number(categoryId))
          .eq("is_active", true);

        if (usedErr) {
          console.error("team_players fetch error", usedErr);
          setExistingPlayers([]);
          return;
        }

        const usedIds = (usedRows || []).map((r) => r.player_id).filter((x) => x != null);

        // IMPORTANT: players table no longer has "number"
        let q = supabase.from("players").select("id,name,position").order("name", { ascending: true });

        if (usedIds.length > 0) {
          q = q.not("id", "in", `(${usedIds.join(",")})`);
        }

        const { data: avail, error: availErr } = await q;

        if (availErr) {
          console.error("players fetch error", availErr);
          setExistingPlayers([]);
          return;
        }

        setExistingPlayers(avail || []);
      } catch (e) {
        console.error("existing players load crash", e);
        setExistingPlayers([]);
      }
    })();
  }, [adding, addMode, id, seasonId, categoryId]);

  async function addPlayer() {
    if (!newPlayer.name) return;
    if (!seasonId || !categoryId) {
      alert("Please select a Season and Category first.");
      return;
    }

    const payloadPlayer = {
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
      number: newPlayer.number === "" ? null : Number(newPlayer.number),
      is_active: true,
    };

    const { error: tpErr } = await supabase.from("team_players").insert(payloadTeamPlayer);
    if (tpErr) return alert(tpErr.message);

    setAdding(false);
    setAddMode("existing");
    setNewPlayer({ number: "", name: "", position: "F" });
    setSelectedExisting("");
    setExistingNumber("");
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
      number: existingNumber === "" ? null : Number(existingNumber),
      is_active: true,
    });
    if (error) return alert(error.message);

    setAdding(false);
    setAddMode("existing");
    setSelectedExisting("");
    setExistingNumber("");
    reload();
  }

  function beginEdit(pid) {
    setPlayers((cur) =>
      cur.map((p) =>
        p.id === pid
          ? {
              ...p,
              __edit: { number: p.number ?? "", name: p.name, position: p.position || "F" },
            }
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

    if (!seasonId || !categoryId) {
      alert("Please select a Season and Category first.");
      return;
    }

    // Update players table (name, position)
    const { error: pErr } = await supabase
      .from("players")
      .update({
        name: row.__edit.name,
        position: row.__edit.position || "F",
      })
      .eq("id", pid);

    if (pErr) return alert(pErr.message);

    // Update team_players.number for THIS roster context
    const { error: tpErr } = await supabase
      .from("team_players")
      .update({
        number: row.__edit.number === "" ? null : Number(row.__edit.number),
      })
      .eq("team_id", Number(id))
      .eq("player_id", Number(pid))
      .eq("season_id", Number(seasonId))
      .eq("category_id", Number(categoryId));

    if (tpErr) return alert(tpErr.message);

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

  // ---- Build rows (SKATERS ONLY) ----
 const rows = React.useMemo(() => {
  return players
    .filter(p => p.position !== "G") // ⬅️ REMOVE GOALIES HERE
    .map((p) => {
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

// ----- Derived team metrics (safe for render) -----
const avgGF =
  summary.record.gp > 0
    ? (summary.record.gf / summary.record.gp).toFixed(1)
    : "0.0";

const avgGA =
  summary.record.gp > 0
    ? (summary.record.ga / summary.record.gp).toFixed(1)
    : "0.0";

const trend10 = summary.chart.reduce(
  (sum, g) => sum + ((g.gf ?? 0) - (g.ga ?? 0)),
  0
);


  
  const Th = ({ col, label, sortKeyFor }) => (
    <div className="td th-resizable" style={{ width: widths[col], minWidth: widths[col], maxWidth: widths[col] }}>
      <button className="th-btn" onClick={() => clickSort(sortKeyFor ?? col)} title="Click to sort">
        {label}{" "}
        {sortKey === (sortKeyFor ?? col) ? <span className="muted">{sortDir === "asc" ? "▲" : "▼"}</span> : null}
      </button>
      <span className="col-resize grip" onMouseDown={(e) => startResize(col, e.clientX)} aria-hidden />
    </div>
  );

  return (
    <div className="team-page">
      <div className="row gap">
        <Link to="/" className="btn ghost small">
         ← {t("Back to Standings")}
        </Link>
      </div>

      <div className="row gap wrap">
        <div className="card row gap align-center" style={{ minWidth: 300 }}>
          <img
            src={team?.logo_url || ""}
            alt={team?.short_name || team?.name || "team"}
            style={{ width: 96, height: 96, objectFit: "contain" }}
          />
          <div>
            <div className="h-title" style={{ marginBottom: 6 }}>
              {team?.name || t("Team")}
            </div>
            <div className="muted">
              {t("GP")} {summary.record.gp} • {t("W")} {summary.record.w} • {t("L")} {summary.record.l} • {t("OTL")} {summary.record.otl}

            </div>
            <div className="muted">
              {t("GF")} {summary.record.gf} • {t("GA")} {summary.record.ga} • {t("Diff")} {summary.record.gf - summary.record.ga}

            </div>
            <div className="row gap xs" style={{ marginTop: 6 }}>
              {summary.recent.map((r, i) => (
                <span key={i} className={`pill ${r === "W" ? "pill-green" : "pill-gray"}`}>
                  {r}
                </span>
              ))}
             {summary.recent.length === 0 && <span className="muted">{t("No final games yet")}</span>}

            </div>

<div className="muted" style={{ marginTop: 10 }}>
  <div className="row gap xs">
    <span>⚡ {t("Attack")} :</span>
<strong>{avgGF} {t("GF per game")}</strong>
  </div>

  <div className="row gap xs">
   <span>🛡️ {t("Defense")} :</span>
<strong>{avgGA} {t("GA per game")}</strong>
  </div>

  <div className="row gap xs">
    <span>📈 {t("Trend (10)")} :</span>
    <strong style={{ color: trend10 >= 0 ? "#2563eb" : "#dc2626" }}>
      {trend10 >= 0 ? "+" : ""}
      {trend10}
    </strong>
  </div>
</div>

            

            
          </div>
        </div>


        <div className="card" style={{ flex: 1, minWidth: 320 }}>
  <div className="card-title">
  {t("Goals For vs Goals Against (Last 10)")}
</div>

  <div className="row gap xs muted" style={{ marginBottom: 6 }}>
    <span>🔵 {t("For")}</span>
<span>🔴 {t("Against")}</span>
  </div>

  <div style={{ width: "100%", height: 160 }}>
    <SparklineGFGA points={summary.chart} />
  </div>
</div>
</div>

      {/* Add player bar */}
      <div className="row space-between align-center" style={{ marginTop: 16, marginBottom: 8 }}>
        <div className="card-title">{t("Roster & Player Stats")}</div>

        {isLoggedIn && (
          <>
            {!adding ? (
              <button className="btn" onClick={() => setAdding(true)}>
               {t("Add Player")}
              </button>
            ) : (
              <div className="row gap wrap">
                <select
                  className="in"
                  value={addMode}
                  onChange={(e) => {
                    setAddMode(e.target.value);
                    setSelectedExisting("");
                    setExistingNumber("");
                  }}
                >
                  <option value="new">New</option>
                  <option value="existing">Existing</option>
                </select>

                {addMode === "new" ? (
                  <>
                    <input
                      className="in"
                      placeholder="#"
                      style={{ width: 70, textAlign: "center" }}
                      value={newPlayer.number}
                      onChange={(e) => setNewPlayer((s) => ({ ...s, number: e.target.value.replace(/\D/g, "") }))}
                    />
                    <input
                      className="in"
                      placeholder="Player name"
                      style={{ width: 260 }}
                      value={newPlayer.name}
                      onChange={(e) => setNewPlayer((s) => ({ ...s, name: e.target.value }))}
                    />
                    <select
                      className="in"
                      style={{ width: 80 }}
                      value={newPlayer.position}
                      onChange={(e) => setNewPlayer((s) => ({ ...s, position: e.target.value }))}
                    >
                      <option value="F">F</option>
                      <option value="D">D</option>
                      <option value="G">G</option>
                    </select>
                    <button className="btn" onClick={addPlayer}>
                      {t("Save")}
                    </button>
                  </>
                ) : (
                  <>
                    <select className="in" style={{ width: 260 }} value={selectedExisting} onChange={(e) => setSelectedExisting(e.target.value)}>
                      <option value="">Select existing player…</option>
                      {existingPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>

                    <input
                      className="in"
                      placeholder="#"
                      style={{ width: 70, textAlign: "center" }}
                      value={existingNumber}
                      onChange={(e) => setExistingNumber(e.target.value.replace(/\D/g, ""))}
                      title="Jersey number for this team/season/category"
                    />

                    <button className="btn" onClick={addExistingPlayer}>
                      {t("Add")}
                    </button>
                  </>
                )}

                <button
                  className="btn ghost"
                  onClick={() => {
                    setAdding(false);
                    setAddMode("existing");
                    setNewPlayer({ number: "", name: "", position: "F" });
                    setSelectedExisting("");
                    setExistingNumber("");
                  }}
                >
                  {t("Cancel")}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Table */}
      <div className="tbl">
        <div className="tr thead">
          <Th col="player" label={t("Player")} sortKeyFor="name" />
          <Th col="number" label="#" sortKeyFor="number" />
          <Th col="pos" label={t("Pos")} sortKeyFor="position" />
          <Th col="gp" label={t("GP")} />
          <Th col="g" label={t("G")} />
          <Th col="a" label={t("A")} />
          <Th col="pts" label={t("PTS")} />
          {isLoggedIn && <Th col="actions" label={t("Actions")} />}
        </div>



        

        {sortedRows.map((r) =>
          r.__edit ? (
            <div className="tr" key={r.id}>
              <div className="td" style={{ width: widths.player }}>
                <input
                  className="in"
                  value={r.__edit.name}
                  onChange={(e) =>
                    setPlayers((cur) =>
                      cur.map((x) => (x.id === r.id ? { ...x, __edit: { ...x.__edit, name: e.target.value } } : x))
                    )
                  }
                />
              </div>
              <div className="td c" style={{ width: widths.number }}>
                <input
                  className="in"
                  style={{ textAlign: "center" }}
                  value={r.__edit.number}
                  onChange={(e) =>
                    setPlayers((cur) =>
                      cur.map((x) =>
                        x.id === r.id
                          ? { ...x, __edit: { ...x.__edit, number: e.target.value.replace(/\D/g, "") } }
                          : x
                      )
                    )
                  }
                />
              </div>
              <div className="td c" style={{ width: widths.pos }}>
                <select
                  className="in"
                  value={r.__edit.position}
                  onChange={(e) =>
                    setPlayers((cur) =>
                      cur.map((x) =>
                        x.id === r.id ? { ...x, __edit: { ...x.__edit, position: e.target.value } } : x
                      )
                    )
                  }
                >
                  <option value="F">F</option>
                  <option value="D">D</option>
                  <option value="G">G</option>
                </select>
              </div>
              <div className="td c" style={{ width: widths.gp }}>
                {r.gp}
              </div>
              <div className="td c" style={{ width: widths.g }}>
                {r.g}
              </div>
              <div className="td c" style={{ width: widths.a }}>
                {r.a}
              </div>
              <div className="td c b" style={{ width: widths.pts }}>
                {r.pts}
              </div>
              {isLoggedIn && (
                <div className="td right" style={{ width: widths.actions }}>
                  <button className="btn" onClick={() => saveEdit(r.id)}>
                    Save
                  </button>
                  <button className="btn ghost" style={{ marginLeft: 8 }} onClick={() => cancelEdit(r.id)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="tr" key={r.id}>
              <div className="td left ellipsis" style={{ width: widths.player }} title={r.name}>
                <Link className="link" to={`/players/${r.id}`}>
                  {r.name}
                </Link>
              </div>
              <div className="td c" style={{ width: widths.number }}>
                {r.number}
              </div>
              <div className="td c" style={{ width: widths.pos }}>
                {r.position}
              </div>
              <div className="td c" style={{ width: widths.gp }}>
                {r.gp}
              </div>
              <div className="td c" style={{ width: widths.g }}>
                {r.g}
              </div>
              <div className="td c" style={{ width: widths.a }}>
                {r.a}
              </div>
              <div className="td c b" style={{ width: widths.pts }}>
                {r.pts}
              </div>
              {isLoggedIn && (
                <div className="td right" style={{ width: widths.actions }}>
                  <button className="btn" onClick={() => beginEdit(r.id)}>
                    {t("Edit")}
                  </button>
                  <button className="btn danger" style={{ marginLeft: 8 }} onClick={() => deletePlayer(r.id)}>
                    {t("Delete")}
                  </button>
                </div>
              )}
            </div>
          )
        )}

        {sortedRows.length === 0 && (
          <div className="tr">
            <div className="td muted">
              {!seasonId || !categoryId
  ? t("Select a Season and Category to view this team's roster.")
  : t("No players found.")}
            </div>
          </div>
        )}


        {/* ---------- GOALIES ---------- */}
{goalies.length > 0 && (
  <>
    <div className="tr thead">
      <div className="td"style={{ fontSize: 12, whiteSpace: "nowrap" }}>{t("Goalie")}</div>
      <div className="td c"style={{ fontSize: 12, whiteSpace: "nowrap" }}>{t("GP")}</div>
      <div className="td c"style={{ fontSize: 12, whiteSpace: "nowrap" }}>{t("SA")}</div>
      <div className="td c"style={{ fontSize: 12, whiteSpace: "nowrap" }}>{t("GA")}</div>
      <div className="td c"style={{ fontSize: 12, whiteSpace: "nowrap" }}>{t("SV%")}</div>
      <div className="td c"style={{ fontSize: 12, whiteSpace: "nowrap" }}>{t("GAA")}</div>
      
      <div className="td c"style={{ fontSize: 12, whiteSpace: "nowrap" }}>
        {t("W-L-OTL-SOL")}
      </div>
    </div>

    {goalies.map((g) => (
      <div className="tr" key={`goalie-${g.player_id}`}>
        <div className="td left">
          <Link className="link" to={`/players/${g.player_id}`}>
            {g.goalie}
          </Link>
        </div>

        <div className="td c"style={{ fontSize: 12, whiteSpace: "nowrap" }}>{g.gp ?? 0}</div>
        <div className="td c"style={{ fontSize: 12, whiteSpace: "nowrap" }}>{g.sa ?? 0}</div>
        <div className="td c"style={{ fontSize: 12, whiteSpace: "nowrap" }}>{g.ga ?? 0}</div>

        <div className="td c"style={{ fontSize: 12, whiteSpace: "nowrap" }}>{g.sv_pct != null ? `${g.sv_pct}%` : "—"}</div>
        <div className="td c"style={{ fontSize: 12, whiteSpace: "nowrap" }}>{g.gaa != null ? Number(g.gaa).toFixed(2) : "—"}</div>

       <div className="td c" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
  {(g.wins ?? 0)}-{(g.losses ?? 0)}-{(g.otl ?? 0)}-{(g.sol ?? 0)}
</div>

      
      </div>
    ))}
  </>
)}


        
      </div>
    </div>
  );
}

