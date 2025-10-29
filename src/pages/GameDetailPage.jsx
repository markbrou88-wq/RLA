// src/pages/GameDetailPage.jsx
import React from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

// ---------- Config (edit here only if your schema differs) ----------
const ROSTERS_TABLE = "game_rosters";          // public.game_rosters
const ROSTER_ACTIVE_COL = "active";            // boolean column
const EVENTS_TABLE = "events";                 // public.events
const GAMES_TABLE = "games";                   // public.games
const PLAYERS_TABLE = "players";               // public.players
const TEAMS_TABLE = "teams";                   // public.teams

// UI helpers
const Pill = ({ active, children, onClick }) => (
  <button
    onClick={onClick}
    className={`roster-pill ${active ? "in" : "out"}`}
    type="button"
  >
    {children}
  </button>
);

const SectionCard = ({ title, right, children }) => (
  <div className="card">
    <div className="card-head">
      <h3>{title}</h3>
      <div>{right}</div>
    </div>
    <div className="card-body">{children}</div>
  </div>
);

export default function GameDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();

  // ---------- state ----------
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [game, setGame] = React.useState(null);
  const [homeTeam, setHomeTeam] = React.useState(null);
  const [awayTeam, setAwayTeam] = React.useState(null);

  const [homePlayers, setHomePlayers] = React.useState([]); // [{id, number, name, position}]
  const [awayPlayers, setAwayPlayers] = React.useState([]);

  // active roster (player ids) for this game
  const [homeActive, setHomeActive] = React.useState(new Set());
  const [awayActive, setAwayActive] = React.useState(new Set());

  // events
  const [events, setEvents] = React.useState([]);

  // event form
  const [efTeam, setEfTeam] = React.useState("home"); // 'home'|'away'
  const [efType, setEfType] = React.useState("goal"); // goal|assist|penalty
  const [efScorer, setEfScorer] = React.useState(null);
  const [efAssist1, setEfAssist1] = React.useState(null);
  const [efAssist2, setEfAssist2] = React.useState(null);
  const [efPeriod, setEfPeriod] = React.useState(1);
  const [efTime, setEfTime] = React.useState("15:00");

  // scoreboard/clock
  const [clockRunning, setClockRunning] = React.useState(false);
  const [clock, setClock] = React.useState(900); // seconds; default 15:00
  const [periodLenMin, setPeriodLenMin] = React.useState(15);

  // ---------- derived ----------
  const gameId = game?.id;
  const homeId = homeTeam?.id;
  const awayId = awayTeam?.id;

  // map helpers
  const homePlayersMap = React.useMemo(
    () => new Map(homePlayers.map((p) => [p.id, p])),
    [homePlayers]
  );
  const awayPlayersMap = React.useMemo(
    () => new Map(awayPlayers.map((p) => [p.id, p])),
    [awayPlayers]
  );

  // ---------- effects ----------
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);

      // 1) load game + teams
      const { data: g, error: ge } = await supabase
        .from(GAMES_TABLE)
        .select(
          "id, slug, status, game_date, home_team_id, away_team_id, home_score, away_score"
        )
        .eq("slug", slug)
        .single();

      if (ge) {
        alert(ge.message);
        setLoading(false);
        return;
      }

      if (!mounted) return;

      setGame(g);

      const { data: teams, error: te } = await supabase
        .from(TEAMS_TABLE)
        .select("id, name, short_name, logo_url")
        .in("id", [g.home_team_id, g.away_team_id]);

      if (te) {
        alert(te.message);
        setLoading(false);
        return;
      }

      const ht = teams.find((t) => t.id === g.home_team_id);
      const at = teams.find((t) => t.id === g.away_team_id);
      setHomeTeam(ht);
      setAwayTeam(at);

      // 2) load players by team
      const { data: hp, error: hpe } = await supabase
        .from(PLAYERS_TABLE)
        .select("id, number, name, position, team_id")
        .eq("team_id", g.home_team_id)
        .order("number", { ascending: true });

      if (hpe) {
        alert(hpe.message);
        setLoading(false);
        return;
      }
      setHomePlayers(hp ?? []);

      const { data: ap, error: ape } = await supabase
        .from(PLAYERS_TABLE)
        .select("id, number, name, position, team_id")
        .eq("team_id", g.away_team_id)
        .order("number", { ascending: true });

      if (ape) {
        alert(ape.message);
        setLoading(false);
        return;
      }

      setAwayPlayers(ap ?? []);

      // 3) load active roster from game_rosters
      const { data: ros, error: re } = await supabase
        .from(ROSTERS_TABLE)
        .select("player_id, team_id, active")
        .eq("game_id", g.id);

      if (re) {
        alert(re.message);
        setLoading(false);
        return;
      }
      const hActive = new Set(
        (ros ?? [])
          .filter((r) => r.team_id === g.home_team_id && r[ROSTER_ACTIVE_COL])
          .map((r) => r.player_id)
      );
      const aActive = new Set(
        (ros ?? [])
          .filter((r) => r.team_id === g.away_team_id && r[ROSTER_ACTIVE_COL])
          .map((r) => r.player_id)
      );

      setHomeActive(hActive);
      setAwayActive(aActive);

      // 4) load events for the table
      await refreshEvents(g.id);

      setLoading(false);

      // 5) Realtime on roster row changes
      const chan = supabase
        .channel(`roster-${g.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: ROSTERS_TABLE,
            filter: `game_id=eq.${g.id}`,
          },
          async () => {
            // Reload rosters; simplest + safest
            const { data: ros2 } = await supabase
              .from(ROSTERS_TABLE)
              .select("player_id, team_id, active")
              .eq("game_id", g.id);

            if (!ros2) return;
            const hA = new Set(
              ros2
                .filter((r) => r.team_id === g.home_team_id && r[ROSTER_ACTIVE_COL])
                .map((r) => r.player_id)
            );
            const aA = new Set(
              ros2
                .filter((r) => r.team_id === g.away_team_id && r[ROSTER_ACTIVE_COL])
                .map((r) => r.player_id)
            );
            setHomeActive(hA);
            setAwayActive(aA);
          }
        )
        .subscribe();

      // 6) Realtime on events
      const chan2 = supabase
        .channel(`events-${g.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: EVENTS_TABLE,
            filter: `game_id=eq.${g.id}`,
          },
          () => refreshEvents(g.id)
        )
        .subscribe();

      return () => {
        supabase.removeChannel(chan);
        supabase.removeChannel(chan2);
      };
    })();

    return () => {
      mounted = false;
    };
  }, [slug]);

  // simple ticking clock
  React.useEffect(() => {
    if (!clockRunning) return;
    const id = setInterval(() => {
      setClock((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [clockRunning]);

  async function refreshEvents(gid = gameId) {
    if (!gid) return;
    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .select(
        "id, game_id, team_id, player_id, period, time_mmss, event, assist1_id, assist2_id, players!events_player_id_fkey(name,number), a1:players!events_assist1_id_fkey(name,number), a2:players!events_assist2_id_fkey(name,number)"
      )
      .eq("game_id", gid)
      .order("period", { ascending: true })
      .order("time_mmss", { ascending: true });

    if (!error) setEvents(data ?? []);
  }

  // ---------- formatting ----------
  function fmtClock(secs) {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // ---------- roster toggle ----------
  async function togglePlayer(player, team) {
    if (!gameId) return;
    const isHome = team === "home";
    const teamId = isHome ? homeId : awayId;
    const activeSet = isHome ? new Set(homeActive) : new Set(awayActive);
    const isActive = activeSet.has(player.id);
    const nextActive = !isActive;

    // Optimistic UI
    if (nextActive) activeSet.add(player.id);
    else activeSet.delete(player.id);
    isHome ? setHomeActive(activeSet) : setAwayActive(activeSet);

    setSaving(true);
    const { error } = await supabase
      .from(ROSTERS_TABLE)
      .upsert(
        [
          {
            game_id: gameId,
            team_id: teamId,
            player_id: player.id,
            [ROSTER_ACTIVE_COL]: nextActive,
          },
        ],
        { onConflict: "game_id,player_id" }
      )
      .select();

    if (error) {
      alert(error.message);
      // rollback optimistic
      const rollback = new Set(isHome ? homeActive : awayActive);
      isHome ? setHomeActive(rollback) : setAwayActive(rollback);
    }
    setSaving(false);
  }

  // ---------- add event ----------
  async function addEvent() {
    if (!gameId) return;
    const teamId = efTeam === "home" ? homeId : awayId;
    if (!teamId || !efScorer) return;

    setSaving(true);
    const ins = {
      game_id: gameId,
      team_id: teamId,
      event: efType, // 'goal'|'assist'|'penalty'
      player_id: efScorer,
      assist1_id: efAssist1 || null,
      assist2_id: efAssist2 || null,
      period: efPeriod,
      time_mmss: efTime,
    };
    const { error } = await supabase.from(EVENTS_TABLE).insert([ins]);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    // refreshEvents triggered by realtime; still do local for snappy feel
    await refreshEvents();
  }

  async function deleteEvent(id) {
    if (!id) return;
    await supabase.from(EVENTS_TABLE).delete().eq("id", id);
  }

  // ---------- final / reopen ----------
  async function markFinal(next = true) {
    if (!gameId) return;
    const { error } = await supabase
      .from(GAMES_TABLE)
      .update({ status: next ? "final" : "open" })
      .eq("id", gameId);
    if (error) alert(error.message);
    else setGame((g) => ({ ...g, status: next ? "final" : "open" }));
  }

  // ---------- computed helpers ----------
  function scorerOptions(isHome) {
    const arr = isHome ? homePlayers : awayPlayers;
    return arr.map((p) => (
      <option key={p.id} value={p.id}>
        #{p.number} — {p.name}
      </option>
    ));
  }

  function renderEventRow(ev) {
    const isHome = ev.team_id === homeId;
    const scorer =
      (isHome ? homePlayersMap : awayPlayersMap).get(ev.player_id) || {};
    const a1 =
      ev.assist1_id &&
      ((isHome ? homePlayersMap : awayPlayersMap).get(ev.assist1_id) || {});
    const a2 =
      ev.assist2_id &&
      ((isHome ? homePlayersMap : awayPlayersMap).get(ev.assist2_id) || {});

    return (
      <tr key={ev.id}>
        <td>{ev.period}</td>
        <td>{ev.time_mmss}</td>
        <td style={{ fontWeight: 600, color: isHome ? "#2d5fff" : "#b32d2d" }}>
          {isHome ? homeTeam?.short_name : awayTeam?.short_name}
        </td>
        <td>{ev.event}</td>
        <td>
          {scorer.number ? `#${scorer.number} — ` : ""}
          {scorer.name}
          {(a1?.name || a2?.name) && (
            <span style={{ color: "#667", marginLeft: 6 }}>
              {" "}
              (A: {a1?.name ?? "-"}
              {a2?.name ? `, ${a2.name}` : ""})
            </span>
          )}
        </td>
        <td style={{ textAlign: "right" }}>
          <button className="link-danger" onClick={() => deleteEvent(ev.id)}>
            Delete
          </button>
        </td>
      </tr>
    );
  }

  // ---------- styles ----------
  // These go well with your existing styles.css, but are scoped and safe.
  const styles = `
  .page-wrap {max-width: 1100px; margin: 0 auto; padding: 16px;}
  .subtle { color:#666; font-size:12px; }
  .grid { display:grid; gap:12px; }
  .grid.cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .grid.cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .card { background:#fff; border:1px solid #eee; border-radius:10px; padding:14px; box-shadow:0 1px 2px rgba(0,0,0,.03); }
  .card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
  .scorebar { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border:1px solid #eee; border-radius:10px; background:#fafbff; }
  .team-side { width:48%; display:flex; align-items:center; gap:10px; justify-content:flex-start; }
  .team-side.right { justify-content:flex-end; flex-direction:row-reverse; }
  .score { font-size:28px; font-weight:800; letter-spacing:1px; }
  .mid-vs { font-weight:700; color:#999; }
  .roster-pill { border-radius:999px; padding:8px 12px; font-size:13px; border:1px solid #d7d9e0; background:#f6f7fb; color:#374151; cursor:pointer; }
  .roster-pill.in { background:#0f6; color:#064; border-color:#0a5; }
  .roster-pill.out { background:#f4f5fa; color:#555; }
  .link-danger { color:#b11; background:transparent; border:0; cursor:pointer; }
  .kbtn { padding:8px 12px; border-radius:8px; border:1px solid #d6d6e2; background:#fff; cursor:pointer; }
  .kbtn.primary { background:#3b5fff; color:#fff; border-color:#3b5fff; }
  .kbtn.ghost { background:#f4f6ff; border-color:#dee3ff; color:#2a3aff; }
  .mini { font-size:12px; padding:6px 10px }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { border-bottom:1px solid #f0f0f5; padding:10px 8px; }
  th { text-align:left; color:#555; font-weight:600; }
  `;

  if (loading) {
    return (
      <div className="page-wrap">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <style>{styles}</style>

      <div className="row" style={{ marginBottom: 8 }}>
        <Link to="/games" className="kbtn mini">
          ← Back to Games
        </Link>
        <span className="subtle">
          <strong>{game?.status?.toUpperCase()}</strong> •{" "}
          {new Date(game?.game_date).toLocaleDateString()}
        </span>
        <div style={{ marginLeft: "auto" }} className="row">
          {game?.status === "final" ? (
            <button className="kbtn ghost mini" onClick={() => markFinal(false)}>
              Reopen
            </button>
          ) : (
            <button className="kbtn primary mini" onClick={() => markFinal(true)}>
              Final
            </button>
          )}
        </div>
      </div>

      {/* ======= Controls ======= */}
      <SectionCard
        title="Live controls"
        right={saving ? <span className="subtle">Saving…</span> : null}
      >
        <div className="grid cols-6" style={{ marginBottom: 10 }}>
          <div>
            <div className="subtle">Team</div>
            <select
              value={efTeam}
              onChange={(e) => setEfTeam(e.target.value)}
              className="kbtn"
            >
              <option value="home">{homeTeam?.short_name}</option>
              <option value="away">{awayTeam?.short_name}</option>
            </select>
          </div>
          <div>
            <div className="subtle">Type</div>
            <select
              value={efType}
              onChange={(e) => setEfType(e.target.value)}
              className="kbtn"
            >
              <option value="goal">Goal</option>
              <option value="assist">Assist</option>
              <option value="penalty">Penalty</option>
            </select>
          </div>
          <div>
            <div className="subtle">Scorer</div>
            <select
              className="kbtn"
              value={efScorer ?? ""}
              onChange={(e) => setEfScorer(Number(e.target.value))}
            >
              <option value="">—</option>
              {scorerOptions(efTeam === "home")}
            </select>
          </div>
          <div>
            <div className="subtle">Assist 1</div>
            <select
              className="kbtn"
              value={efAssist1 ?? ""}
              onChange={(e) => setEfAssist1(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">None</option>
              {scorerOptions(efTeam === "home")}
            </select>
          </div>
          <div>
            <div className="subtle">Assist 2</div>
            <select
              className="kbtn"
              value={efAssist2 ?? ""}
              onChange={(e) => setEfAssist2(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">None</option>
              {scorerOptions(efTeam === "home")}
            </select>
          </div>
          <div>
            <div className="subtle">Period</div>
            <select
              className="kbtn"
              value={efPeriod}
              onChange={(e) => setEfPeriod(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row" style={{ gap: 12, marginBottom: 4 }}>
          <div>
            <div className="subtle">Time (MM:SS)</div>
            <input
              className="kbtn"
              value={efTime}
              onChange={(e) => setEfTime(e.target.value)}
              style={{ width: 90, textAlign: "center" }}
            />
          </div>

          <button className="kbtn ghost" onClick={() => setEfTime(fmtClock(clock))}>
            Stamp clock
          </button>

          <button className="kbtn primary" onClick={addEvent}>
            Add event
          </button>

          <div style={{ marginLeft: "auto" }} className="row">
            <div className="subtle">Clock</div>
            <div className="row">
              <div className="kbtn mini" style={{ width: 76, textAlign: "center" }}>
                {fmtClock(clock)}
              </div>
              <button
                className="kbtn mini"
                onClick={() => setClockRunning((v) => !v)}
                title={clockRunning ? "Stop" : "Start"}
              >
                {clockRunning ? "Stop" : "Start"}
              </button>
              <button
                className="kbtn mini"
                onClick={() => setClock(periodLenMin * 60)}
                title="Reset"
              >
                Reset
              </button>
            </div>
            <div className="row">
              <div className="kbtn mini" title="Set period length">
                <input
                  type="number"
                  min={1}
                  value={periodLenMin}
                  onChange={(e) => setPeriodLenMin(Number(e.target.value))}
                  style={{ width: 48, border: 0, background: "transparent", textAlign: "right" }}
                />{" "}
                min
              </div>
              <button className="kbtn mini" onClick={() => setClock(periodLenMin * 60)}>
                Apply
              </button>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ======= Score bar ======= */}
      <div className="scorebar" style={{ margin: "12px 0" }}>
        <div className="team-side">
          {homeTeam?.logo_url && (
            <img src={homeTeam.logo_url} alt="" style={{ height: 24 }} />
          )}
          <div>
            <div style={{ fontWeight: 700 }}>{homeTeam?.name}</div>
            <div className="subtle">{homeTeam?.short_name}</div>
          </div>
        </div>
        <div className="score">
          {game?.home_score ?? 0} <span className="mid-vs">vs</span> {game?.away_score ?? 0}
        </div>
        <div className="team-side right">
          {awayTeam?.logo_url && (
            <img src={awayTeam.logo_url} alt="" style={{ height: 24 }} />
          )}
          <div>
            <div style={{ fontWeight: 700, textAlign: "right" }}>{awayTeam?.name}</div>
            <div className="subtle" style={{ textAlign: "right" }}>
              {awayTeam?.short_name}
            </div>
          </div>
        </div>
      </div>

      {/* ======= Roster toggle ======= */}
      <SectionCard title="Roster (toggle players IN)">
        <div className="row" style={{ marginBottom: 8, color: "#667" }}>
          <strong style={{ color: "#2a3aff" }}>{homeTeam?.short_name}</strong> &nbsp; / &nbsp;
          <strong style={{ color: "#b22" }}>{awayTeam?.short_name}</strong>
        </div>

        <div className="grid cols-2" style={{ gap: 16 }}>
          <div>
            <div className="subtle" style={{ marginBottom: 6 }}>
              {homeTeam?.name}
            </div>
            <div className="row" style={{ gap: 8 }}>
              {homePlayers.map((p) => (
                <Pill
                  key={p.id}
                  active={homeActive.has(p.id)}
                  onClick={() => togglePlayer(p, "home")}
                >{`#${p.number} ${p.name}`}</Pill>
              ))}
            </div>
          </div>
          <div>
            <div className="subtle" style={{ marginBottom: 6, textAlign: "right" }}>
              {awayTeam?.name}
            </div>
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              {awayPlayers.map((p) => (
                <Pill
                  key={p.id}
                  active={awayActive.has(p.id)}
                  onClick={() => togglePlayer(p, "away")}
                >{`#${p.number} ${p.name}`}</Pill>
              ))}
            </div>
          </div>
        </div>
        <div className="subtle" style={{ marginTop: 8 }}>
          • Green = IN for this game • Gray = OUT • Changes are saved & broadcast in realtime (and
          your Boxscore pulls directly from this list).
        </div>
      </SectionCard>

      {/* ======= Events ======= */}
      <SectionCard title="Events">
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Time</th>
              <th>Team</th>
              <th>Type</th>
              <th>Player / Assists</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>{events.map((ev) => renderEventRow(ev))}</tbody>
        </table>
      </SectionCard>
    </div>
  );
}
