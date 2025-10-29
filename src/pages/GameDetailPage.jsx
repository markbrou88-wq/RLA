// src/pages/GameDetailPage.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

function fmtMMSS(totalSeconds) {
  const mm = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const ss = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}
function parseMMSS(mmss) {
  const [m, s] = (mmss || "00:00").split(":").map((x) => parseInt(x || "0", 10));
  return (m || 0) * 60 + (s || 0);
}
function groupEvents(raw) {
  const key = (e) => `${e.period}|${e.time_mmss}|${e.team_id}|goal`;
  const goals = new Map();
  for (const e of raw) if (e.event === "goal") goals.set(key(e), { goal: e, assists: [] });
  for (const e of raw) if (e.event === "assist" && goals.has(key(e))) goals.get(key(e)).assists.push(e);
  const others = raw.filter((e) => e.event !== "goal" && e.event !== "assist");
  const rows = [...goals.values(), ...others.map((o) => ({ single: o }))];
  rows.sort((a, b) => {
    const aP = a.goal ? a.goal.period : a.single.period;
    const bP = b.goal ? b.goal.period : b.single.period;
    if (aP !== bP) return aP - bP;
    const aT = parseMMSS(a.goal ? a.goal.time_mmss : a.single.time_mmss);
    const bT = parseMMSS(b.goal ? b.goal.time_mmss : b.single.time_mmss);
    return bT - aT;
  });
  return rows;
}

export default function GameDetailPage() {
  const { slug } = useParams();
  const [loading, setLoading] = React.useState(true);
  const [game, setGame] = React.useState(null);
  const [home, setHome] = React.useState(null);
  const [away, setAway] = React.useState(null);
  const [playersHome, setPlayersHome] = React.useState([]);
  const [playersAway, setPlayersAway] = React.useState([]);
  const [roster, setRoster] = React.useState(new Set());

  const [events, setEvents] = React.useState([]);
  const [rows, setRows] = React.useState([]);

  const [teamSide, setTeamSide] = React.useState("home");
  const [eventType, setEventType] = React.useState("goal");
  const [period, setPeriod] = React.useState(1);
  const [timeMMSS, setTimeMMSS] = React.useState("15:00");
  const [scorerId, setScorerId] = React.useState(null);
  const [a1Id, setA1Id] = React.useState(null);
  const [a2Id, setA2Id] = React.useState(null);

  const [goalieHome, setGoalieHome] = React.useState(null);
  const [goalieAway, setGoalieAway] = React.useState(null);

  const [clockSecs, setClockSecs] = React.useState(15 * 60);
  const [clockRun, setClockRun] = React.useState(false);

  React.useEffect(() => {
    let t;
    if (clockRun) t = setInterval(() => setClockSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [clockRun]);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: g, error: ge } = await supabase.from("games").select("*").eq("slug", slug).single();
      if (ge) {
        alert(ge.message);
        setLoading(false);
        return;
      }
      setGame(g);
      const [h, a] = await Promise.all([
        supabase.from("teams").select("*").eq("id", g.home_team_id).single(),
        supabase.from("teams").select("*").eq("id", g.away_team_id).single(),
      ]);
      setHome(h.data);
      setAway(a.data);

      const [ph, pa] = await Promise.all([
        supabase.from("players").select("*").eq("team_id", g.home_team_id).order("number"),
        supabase.from("players").select("*").eq("team_id", g.away_team_id).order("number"),
      ]);
      setPlayersHome(ph.data || []);
      setPlayersAway(pa.data || []);

      const { data: gr } = await supabase.from("game_rosters").select("player_id").eq("game_id", g.id);
      setRoster(new Set((gr || []).map((r) => r.player_id)));

      await reloadEvents(g.id);
      setLoading(false);
    })();
  }, [slug]);

  async function reloadEvents(gameId) {
    const { data: ev } = await supabase
      .from("events")
      .select(
        `
        id, game_id, team_id, player_id, period, time_mmss, event,
        players!events_player_id_fkey ( id, name, number )
      `
      )
      .eq("game_id", gameId)
      .order("period", { ascending: true })
      .order("time_mmss", { ascending: false });
    setEvents(ev || []);
    setRows(groupEvents(ev || []));
  }

  function playersFor(side) {
    return side === "home" ? playersHome : playersAway;
  }
  function teamIdFor(side) {
    return side === "home" ? game?.home_team_id : game?.away_team_id;
  }

  function computeScore(ev) {
    let hs = 0,
      as = 0;
    for (const e of ev) {
      if (e.event !== "goal") continue;
      if (e.team_id === game.home_team_id) hs += 1;
      else if (e.team_id === game.away_team_id) as += 1;
    }
    return { hs, as };
  }
  async function syncScore(ev) {
    if (!game) return;
    const { hs, as } = computeScore(ev);
    await supabase.from("games").update({ home_score: hs, away_score: as }).eq("id", game.id);
    setGame((x) => ({ ...x, home_score: hs, away_score: as }));
  }

  async function onAddEvent() {
    if (!game) return;
    const team_id = teamIdFor(teamSide);
    if (!team_id) return;

    const base = { game_id: game.id, team_id, period: Number(period), time_mmss: timeMMSS };
    const batch = [];
    if (eventType === "goal") {
      if (!scorerId) return alert("Select the scorer.");
      batch.push({ ...base, event: "goal", player_id: scorerId });
      if (a1Id) batch.push({ ...base, event: "assist", player_id: a1Id });
      if (a2Id) batch.push({ ...base, event: "assist", player_id: a2Id });
    } else if (eventType === "assist") {
      if (!scorerId) return alert("Select the assisting player.");
      batch.push({ ...base, event: "assist", player_id: scorerId });
    } else if (eventType === "penalty") {
      if (!scorerId) return alert("Select penalized player.");
      batch.push({ ...base, event: "penalty", player_id: scorerId });
    } else if (eventType === "shot") {
      if (!scorerId) return alert("Select shooter.");
      batch.push({ ...base, event: "shot", player_id: scorerId });
    }

    const { error } = await supabase.from("events").insert(batch);
    if (error) return alert(error.message);

    const { data: refreshed } = await supabase.from("events").select("*").eq("game_id", game.id);
    await reloadEvents(game.id);
    await syncScore(refreshed || []);
  }

  async function deleteGroup(g) {
    const { period, time_mmss, team_id } = g.goal;
    await supabase
      .from("events")
      .delete()
      .eq("game_id", game.id)
      .eq("period", period)
      .eq("time_mmss", time_mmss)
      .eq("team_id", team_id);

    const { data: refreshed } = await supabase.from("events").select("*").eq("game_id", game.id);
    await reloadEvents(game.id);
    await syncScore(refreshed || []);
  }
  async function deleteSingle(row) {
    await supabase.from("events").delete().eq("id", row.single.id);
    const { data: refreshed } = await supabase.from("events").select("*").eq("game_id", game.id);
    await reloadEvents(game.id);
    await syncScore(refreshed || []);
  }

  // IN GameDetailPage.jsx

// --- ROSTER HELPERS (drop-in replacement) ---

async function reloadRoster(gameId) {
  const { data: gr, error: grErr } = await supabase
    .from("game_rosters")
    .select("player_id")
    .eq("game_id", gameId);

  if (grErr) {
    alert(grErr.message);
    return;
  }
  setRoster(new Set((gr || []).map((r) => r.player_id)));
}

async function toggleRoster(player) {
  if (!game) return;

  const on = roster.has(player.id);
  if (on) {
    // remove row -> player OUT
    const { error } = await supabase
      .from("game_rosters")
      .delete()
      .eq("game_id", game.id)
      .eq("player_id", player.id);

    if (error) {
      alert(error.message);
      return;
    }
  } else {
    // insert row if missing -> player IN
    const { error } = await supabase
      .from("game_rosters")
      .upsert(
        {
          game_id: game.id,
          team_id: player.team_id,
          player_id: player.id,
        },
        // Make sure this matches the unique index you have (see SQL below)
        { onConflict: "game_id,player_id" }
      );

    if (error) {
      alert(error.message);
      return;
    }
  }

  await reloadRoster(game.id);
}

// (optional) call reloadRoster anywhere you need to re-sync cached roster;
// e.g., it's already called after initial load in your effect.



  async function deltaShot(side, delta) {
    const pid = side === "home" ? goalieHome : goalieAway;
    if (!pid || !game) return;
    const team_id = side === "home" ? game.home_team_id : game.away_team_id;

    const { data: row } = await supabase
      .from("game_goalies")
      .select("*")
      .eq("game_id", game.id)
      .eq("player_id", pid)
      .maybeSingle();

    const shots = Math.max(0, (row?.shots_against || 0) + delta);
    if (row) await supabase.from("game_goalies").update({ shots_against: shots }).eq("id", row.id);
    else
      await supabase.from("game_goalies").insert({
        game_id: game.id,
        team_id,
        player_id: pid,
        shots_against: Math.max(0, delta),
      });
  }

  async function markFinal(next) {
    if (!game) return;
    await supabase.from("games").update({ status: next ? "final" : "open" }).eq("id", game.id);
    setGame((g) => ({ ...g, status: next ? "final" : "open" }));
  }

  if (loading || !game || !home || !away) return <div style={{ padding: 16 }}>Loading…</div>;

  const homeScore = game.home_score || 0;
  const awayScore = game.away_score || 0;
  const sidePlayers = playersFor(teamSide);

  // --- shared UI styles (alignment + accessible colors) ---
  const card = { padding: 12, border: "1px solid #e6e9f5", borderRadius: 10, background: "#fff" };
  const grid6 = { display: "grid", gridTemplateColumns: "repeat(6, minmax(140px, 1fr))", gap: 10 };
  const pill = (on) => ({
    padding: "6px 12px",
    borderRadius: 999,
    border: `1px solid ${on ? "#2c5fff" : "#c9d6ff"}`,
    background: on ? "#2c5fff" : "#f6f8ff",
    color: on ? "#fff" : "#1b2b5c",
    fontWeight: 600,
    boxShadow: on ? "0 2px 0 rgba(44,95,255,.2)" : "none",
  });

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <Link to="/games">← Back to Games</Link>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        <div>
          <strong>LIVE •</strong> {new Date(game.game_date).toLocaleDateString()}
        </div>
        <div>
          {game.status === "final" ? (
            <button onClick={() => markFinal(false)}>Reopen</button>
          ) : (
            <button onClick={() => markFinal(true)}>Final</button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div style={{ marginTop: 12, ...card }}>
        <div style={grid6}>
          <div>
            <div>Team</div>
            <select value={teamSide} onChange={(e) => setTeamSide(e.target.value)}>
              <option value="home">{home.short_name || "Home"}</option>
              <option value="away">{away.short_name || "Away"}</option>
            </select>
          </div>

          <div>
            <div>Type</div>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="goal">Goal</option>
              <option value="assist">Assist</option>
              <option value="penalty">Penalty</option>
              <option value="shot">Shot</option>
            </select>
          </div>

          <div>
            <div>{eventType === "goal" ? "Scorer" : eventType === "assist" ? "Assisting Player" : "Player"}</div>
            <select value={scorerId || ""} onChange={(e) => setScorerId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {sidePlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div>Assist 1</div>
            <select
              value={a1Id || ""}
              onChange={(e) => setA1Id(e.target.value ? Number(e.target.value) : null)}
              disabled={eventType !== "goal"}
            >
              <option value="">None</option>
              {sidePlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div>Assist 2</div>
            <select
              value={a2Id || ""}
              onChange={(e) => setA2Id(e.target.value ? Number(e.target.value) : null)}
              disabled={eventType !== "goal"}
            >
              <option value="">None</option>
              {sidePlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div>Period</div>
            <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>OT</option>
            </select>
          </div>

          <div>
            <div>Time (MM:SS)</div>
            <input value={timeMMSS} onChange={(e) => setTimeMMSS(e.target.value)} />
          </div>

          <div style={{ display: "flex", alignItems: "end", gap: 6 }}>
            <button type="button" onClick={() => setTimeMMSS(fmtMMSS(clockSecs))}>
              Stamp clock
            </button>
            <button onClick={onAddEvent} style={{ background: "#3b5fff", color: "#fff" }}>
              Add event
            </button>
          </div>

          <div style={{ gridColumn: "1 / span 6", display: "flex", gap: 8, marginTop: 6 }}>
            <button onClick={() => deltaShot("home", +1)}>{home.short_name} Shot +</button>
            <button onClick={() => deltaShot("home", -1)}>{home.short_name} Shot –</button>
            <button onClick={() => deltaShot("away", +1)}>{away.short_name} Shot +</button>
            <button onClick={() => deltaShot("away", -1)}>{away.short_name} Shot –</button>
          </div>

          <div>
            <div>{home.short_name} Goalie on ice</div>
            <select value={goalieHome || ""} onChange={(e) => setGoalieHome(e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {playersHome.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} — {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div>{away.short_name} Goalie on ice</div>
            <select value={goalieAway || ""} onChange={(e) => setGoalieAway(e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {playersAway.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div>Clock</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <strong>{fmtMMSS(clockSecs)}</strong>
              <button onClick={() => setClockRun((r) => !r)}>{clockRun ? "Stop" : "Start"}</button>
              <button onClick={() => setClockSecs(15 * 60)}>Reset</button>
            </div>
          </div>
          <div>
            <div>Set period (minutes)</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="number"
                min={1}
                max={30}
                value={Math.round(clockSecs / 60)}
                onChange={(e) => setClockSecs(Math.max(0, Number(e.target.value || 0) * 60))}
                style={{ width: 70 }}
              />
              <button onClick={() => setTimeMMSS(fmtMMSS(clockSecs))}>Apply</button>
            </div>
          </div>
        </div>
      </div>

      {/* Score strip */}
      <div
        style={{
          marginTop: 14,
          ...card,
          display: "grid",
          gridTemplateColumns: "1fr 120px 1fr",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontWeight: 700 }}>{home.name}</div>
          <div style={{ color: "#667", fontSize: 12 }}>{home.short_name}</div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 800 }}>
          {homeScore} <span style={{ color: "#9aa" }}>vs</span> {awayScore}
        </div>
        <div>
          <div style={{ fontWeight: 700 }}>{away.name}</div>
          <div style={{ color: "#667", fontSize: 12 }}>{away.short_name}</div>
        </div>
      </div>

      {/* Roster toggles */}
      <div style={{ marginTop: 16, ...card }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Roster (toggle players IN)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div style={{ color: "#667", marginBottom: 8 }}>{home.name}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {playersHome.map((p) => {
                const on = roster.has(p.id);
                return (
                  <button key={p.id} onClick={() => toggleRoster(p)} style={pill(on)}>
                    #{p.number} {p.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ color: "#667", marginBottom: 8 }}>{away.name}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {playersAway.map((p) => {
                const on = roster.has(p.id);
                return (
                  <button key={p.id} onClick={() => toggleRoster(p)} style={pill(on)}>
                    #{p.number} {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Events */}
      <div style={{ marginTop: 16, ...card }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Events</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#666" }}>
              <th style={{ padding: 8 }}>Period</th>
              <th style={{ padding: 8 }}>Time</th>
              <th style={{ padding: 8 }}>Team</th>
              <th style={{ padding: 8 }}>Type</th>
              <th style={{ padding: 8 }}>Player / Assists</th>
              <th style={{ padding: 8, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 12, color: "#888" }}>
                  —
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              if (r.goal) {
                const teamShort = r.goal.team_id === home.id ? home.short_name : away.short_name;
                const main =
                  r.goal.players?.name ||
                  (r.goal.players?.number ? `#${r.goal.players.number}` : "—");
                const assists = r.assists
                  .map((a) => a.players?.name || (a.players?.number ? `#${a.players.number}` : "—"))
                  .join(", ");
                return (
                  <tr key={`g${i}`} style={{ borderTop: "1px solid #f1f1f5" }}>
                    <td style={{ padding: 8 }}>{r.goal.period}</td>
                    <td style={{ padding: 8 }}>{r.goal.time_mmss}</td>
                    <td style={{ padding: 8 }}>{teamShort}</td>
                    <td style={{ padding: 8 }}>goal</td>
                    <td style={{ padding: 8 }}>
                      <strong>{main}</strong>
                      {assists && <span style={{ color: "#666" }}> (A: {assists})</span>}
                    </td>
                    <td style={{ padding: 8, textAlign: "right" }}>
                      <button onClick={() => deleteGroup(r)}>Delete</button>
                    </td>
                  </tr>
                );
              } else {
                const e = r.single;
                const teamShort = e.team_id === home.id ? home.short_name : away.short_name;
                const nm = e.players?.name || (e.players?.number ? `#${e.players.number}` : "—");
                return (
                  <tr key={`o${e.id}`} style={{ borderTop: "1px solid #f1f1f5" }}>
                    <td style={{ padding: 8 }}>{e.period}</td>
                    <td style={{ padding: 8 }}>{e.time_mmss}</td>
                    <td style={{ padding: 8 }}>{teamShort}</td>
                    <td style={{ padding: 8 }}>{e.event}</td>
                    <td style={{ padding: 8 }}>{nm}</td>
                    <td style={{ padding: 8, textAlign: "right" }}>
                      <button onClick={() => deleteSingle(r)}>Delete</button>
                    </td>
                  </tr>
                );
              }
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
