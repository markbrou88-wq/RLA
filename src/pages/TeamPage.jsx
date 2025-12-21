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
        .select(
          "id,game_date,home_team_id,away_team_id,home_score,away_score,status,went_ot"
        )
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

/* 🔁 Roster now comes from game_rosters → players */
function useRoster(teamId) {
  const [players, setPlayers] = React.useState([]);

  const reload = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("game_rosters")
      .select("player:players(id,number,name,position)")
      .eq("team_id", teamId);

    if (error) return console.error(error);

    const seen = new Map();
    (data || []).forEach((r) => {
      if (r.player && !seen.has(r.player.id)) {
        seen.set(r.player.id, r.player);
      }
    });

    setPlayers(Array.from(seen.values()).sort((a, b) => (a.number ?? 0) - (b.number ?? 0)));
  }, [teamId]);

  React.useEffect(() => void reload(), [reload]);
  return { players, setPlayers, reload };
}

/** Skater stats from leaders_current (GP/G/A/PTS) */
function useStatsForPlayers(playerIds) {
  const [map, setMap] = React.useState(new Map());

  React.useEffect(() => {
    if (!playerIds || playerIds.length === 0) {
      setMap(new Map());
      return;
    }
    let stop = false;
    (async () => {
      const { data, error } = await supabase
        .from("leaders_current")
        .select("player_id, gp, g, a, pts")
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
  }, [playerIds]);

  return map;
}

/* ---------- Page ---------- */
export default function TeamPage() {
  const { id } = useParams();
  const team = useTeam(id);
  const summary = useTeamSummary(id);
  const { players, setPlayers, reload } = useRoster(id);

  const playerIds = React.useMemo(() => players.map((p) => p.id), [players]);
  const statsMap = useStatsForPlayers(playerIds);

  // ---- Auth ----
  const [user, setUser] = React.useState(null);
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (mounted) setUser(data?.user ?? null);
    })();
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (mounted) setUser(session?.user ?? null);
      }
    );
    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);
  const isLoggedIn = !!user;

  // Add / Edit / Delete
  const [adding, setAdding] = React.useState(false);
  const [newPlayer, setNewPlayer] = React.useState({ number: "", name: "", position: "F" });

  async function addPlayer() {
    if (!newPlayer.name) return;

    // 1) create player
    const { data: p, error } = await supabase
      .from("players")
      .insert({
        number: newPlayer.number === "" ? null : Number(newPlayer.number),
        name: newPlayer.name,
        position: newPlayer.position || "F",
      })
      .select()
      .single();

    if (error) return alert(error.message);

    // 2) attach to this team via latest game (if exists)
    const { data: games } = await supabase
      .from("games")
      .select("id")
      .or(`home_team_id.eq.${id},away_team_id.eq.${id}`)
      .order("game_date", { ascending: false })
      .limit(1);

    if (games && games.length > 0) {
      await supabase.from("game_rosters").insert({
        game_id: games[0].id,
        team_id: Number(id),
        player_id: p.id,
        dressed: true,
      });
    }

    setAdding(false);
    setNewPlayer({ number: "", name: "", position: "F" });
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
    if (!window.confirm("Delete this player?")) return;
    await supabase.from("game_rosters").delete().eq("player_id", pid).eq("team_id", id);
    const { error } = await supabase.from("players").delete().eq("id", pid);
    if (error) return alert(error.message);
    reload();
  }

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

  return (
    <div className="team-page">
      <div className="row gap">
        <Link to="/" className="btn ghost small">
          ← Back to Standings
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
              {team?.name || "Team"}
            </div>
            <div className="muted">
              GP {summary.record.gp} • W {summary.record.w} • L {summary.record.l} • OTL{" "}
              {summary.record.otl}
            </div>
            <div className="muted">
              GF {summary.record.gf} • GA {summary.record.ga} • Diff{" "}
              {summary.record.gf - summary.record.ga}
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

      <div className="row space-between align-center" style={{ marginTop: 16, marginBottom: 8 }}>
        <div className="card-title">Roster &amp; Player Stats</div>
        {isLoggedIn && (
          <button className="btn" onClick={() => setAdding(true)}>
            Add Player
          </button>
        )}
      </div>

      {rows.length === 0 && <div className="muted">No players found.</div>}
    </div>
  );
}
