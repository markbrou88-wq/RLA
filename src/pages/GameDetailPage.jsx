import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

// ---------- helpers ----------
const toSec = (mmss) => {
  if (!mmss) return 0;
  const [m, s] = String(mmss).split(":").map((v) => parseInt(v || 0, 10));
  if (Number.isNaN(m) || Number.isNaN(s)) return 0;
  return m * 60 + s;
};
const toMMSS = (sec) =>
  `${Math.floor((sec || 0) / 60)}:${String((sec || 0) % 60).padStart(2, "0")}`;

const isG = (p) => (p?.position || "").toUpperCase() === "G";

const sortPlayers = (arr) =>
  [...arr].sort((a, b) => {
    const an = a.number ?? 9999;
    const bn = b.number ?? 9999;
    if (an !== bn) return an - bn;
    return (a.name || "").localeCompare(b.name || "");
  });

const playerLabel = (p) =>
  `#${p.number ?? "-"} ${p.name}${p.position ? " (" + p.position + ")" : ""}`;

// ---------- page ----------
export default function GameDetailPage() {
  const { slug } = useParams();
  const nav = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState("");

  const [game, setGame] = React.useState(null);

  const [homePlayers, setHomePlayers] = React.useState([]);
  const [awayPlayers, setAwayPlayers] = React.useState([]);
  const [homeDressed, setHomeDressed] = React.useState(new Set());
  const [awayDressed, setAwayDressed] = React.useState(new Set());

  const [homeGoalies, setHomeGoalies] = React.useState([]);
  const [awayGoalies, setAwayGoalies] = React.useState([]);

  const [events, setEvents] = React.useState([]);

  // Add-event controls
  const [evTeam, setEvTeam] = React.useState("");
  const [evPlayerId, setEvPlayerId] = React.useState("");
  const [evPeriod, setEvPeriod] = React.useState(1);
  const [evTime, setEvTime] = React.useState("01:00");
  const [evType, setEvType] = React.useState("goal");

  // ---------- load ----------
  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      // game + teams
      const { data: g, error: ge } = await supabase
        .from("games")
        .select(`
          id, slug, game_date, status,
          home_team:teams!games_home_team_id_fkey ( id, name, short_name, logo_url ),
          away_team:teams!games_away_team_id_fkey ( id, name, short_name, logo_url ),
          home_score, away_score
        `)
        .eq("slug", slug)
        .maybeSingle();

      if (ge || !g) {
        setErr(ge?.message || "Game not found");
        setLoading(false);
        return;
      }
      setGame(g);

      // players by team
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
      const hps = sortPlayers(hp.data || []);
      const aps = sortPlayers(ap.data || []);
      setHomePlayers(hps);
      setAwayPlayers(aps);

      // dressed roster
      const { data: gr } = await supabase
        .from("game_rosters")
        .select("player_id, team_id, dressed")
        .eq("game_id", g.id);

      const hD = new Set(
        (gr || []).filter((r) => r.team_id === g.home_team.id && r.dressed).map((r) => r.player_id)
      );
      const aD = new Set(
        (gr || []).filter((r) => r.team_id === g.away_team.id && r.dressed).map((r) => r.player_id)
      );
      setHomeDressed(hD);
      setAwayDressed(aD);

      // goalies
      const { data: gl } = await supabase
        .from("game_goalies")
        .select(
          "id, game_id, team_id, player_id, started, minutes_seconds, shots_against, goals_against, decision, shutout"
        )
        .eq("game_id", g.id);

      setHomeGoalies((gl || []).filter((r) => r.team_id === g.home_team.id));
      setAwayGoalies((gl || []).filter((r) => r.team_id === g.away_team.id));

      // events with joins for names/# display
      const { data: ev } = await supabase
        .from("events")
        .select(
          `
          id, game_id, team_id, player_id, event, period, time_mmss,
          team:teams ( id, short_name ),
          player:players ( id, name, number )
        `
        )
        .eq("game_id", g.id)
        .order("period", { ascending: true })
        .order("time_mmss", { ascending: true });
      setEvents(ev || []);

      setLoading(false);
    })();
  }, [slug]);

  // ---------- auto score ----------
  React.useEffect(() => {
    if (!game) return;
    let hs = 0,
      as = 0;
    events.forEach((e) => {
      if (e.event !== "goal") return;
      if (e.team_id === game.home_team.id) hs++;
      else if (e.team_id === game.away_team.id) as++;
    });

    if (hs !== game.home_score || as !== game.away_score) {
      (async () => {
        await supabase
          .from("games")
          .update({ home_score: hs, away_score: as })
          .eq("id", game.id);
        setGame((g) => ({ ...g, home_score: hs, away_score: as }));
      })();
    }
  }, [events, game]);

  // ---------- roster save ----------
  const saveRoster = async () => {
    if (!game) return;
    setSaving(true);
    setErr("");

    try {
      await supabase.from("game_rosters").delete().eq("game_id", game.id);

      const lines = [];
      for (const pid of homeDressed) {
        lines.push({ game_id: game.id, team_id: game.home_team.id, player_id: pid, dressed: true });
      }
      for (const pid of awayDressed) {
        lines.push({ game_id: game.id, team_id: game.away_team.id, player_id: pid, dressed: true });
      }
      if (lines.length) {
        const ins = await supabase.from("game_rosters").insert(lines);
        if (ins.error) throw ins.error;
      }
      alert("Roster saved");
    } catch (e) {
      setErr(e.message || "Save roster failed");
    } finally {
      setSaving(false);
    }
  };

  // ---------- goalies save ----------
  const saveGoalies = async () => {
    if (!game) return;
    setSaving(true);
    setErr("");

    const clean = (lines) =>
      lines
        .filter((l) => !!l.player_id)
        .map((l) => ({
          game_id: game.id,
          team_id: l.team_id,
          player_id: l.player_id,
          started: !!l.started,
          minutes_seconds: l.minutes_seconds || 0,
          shots_against: l.shots_against ?? 0,
          goals_against: l.goals_against ?? 0,
          decision: l.decision || "ND",
          shutout: !!l.shutout,
        }));

    const payload = [...clean(homeGoalies), ...clean(awayGoalies)];

    try {
      await supabase.from("game_goalies").delete().eq("game_id", game.id);
      if (payload.length) {
        const ins = await supabase.from("game_goalies").insert(payload);
        if (ins.error) throw ins.error;
      }
      alert("Goalie stats saved");
    } catch (e) {
      setErr(e.message || "Save goalies failed");
    } finally {
      setSaving(false);
    }
  };

  // ---------- events ----------
  const addEvent = async () => {
    if (!game || !evTeam || !evType) return;
    const team_id =
      evTeam === "home" ? game.home_team.id : evTeam === "away" ? game.away_team.id : null;
    if (!team_id) return;

    const payload = {
      game_id: game.id,
      team_id,
      player_id: evPlayerId ? Number(evPlayerId) : null,
      event: evType,
      period: Number(evPeriod) || 1,
      time_mmss: evTime || "01:00",
    };

    const { data, error } = await supabase.from("events").insert(payload).select(`
      id, game_id, team_id, player_id, event, period, time_mmss,
      team:teams ( id, short_name ),
      player:players ( id, name, number )
    `);
    if (error) {
      alert(error.message);
      return;
    }
    setEvents((cur) =>
      [...(cur || []), ...(data || [])].sort((a, b) =>
        a.period === b.period
          ? (a.time_mmss || "").localeCompare(b.time_mmss || "")
          : a.period - b.period
      )
    );
    setEvPlayerId("");
  };

  const deleteEvent = async (id) => {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setEvents((cur) => cur.filter((e) => e.id !== id));
  };

  // ---------- status ----------
  const setStatus = async (status) => {
    if (!game) return;
    await supabase.from("games").update({ status }).eq("id", game.id);
    setGame((g) => ({ ...g, status }));
    if (status === "final") alert("Game finalized!");
  };

  if (loading) return <div className="container">Loading…</div>;
  if (err) return <div className="container" style={{ color: "crimson" }}>{err}</div>;
  if (!game) return null;

  // display
  const hpMap = Object.fromEntries(homePlayers.map((p) => [p.id, p]));
  const apMap = Object.fromEntries(awayPlayers.map((p) => [p.id, p]));
  const allPlayers = (teamSide) =>
    teamSide === "home" ? homePlayers : teamSide === "away" ? awayPlayers : [];

  const RosterBox = ({ title, logo, players, dressed, setDressed }) => {
    const toggle = (id) => {
      setDressed((cur) => {
        const c = new Set(cur);
        if (c.has(id)) c.delete(id);
        else c.add(id);
        return c;
      });
    };
    return (
      <div className="card">
        <div className="row mb8">
          {logo && <img src={logo} alt="" className="team-logo" />}
          <h3 className="m0">{title}</h3>
          <div className="right">
            <button className="btn" onClick={() => setDressed(new Set())}>Clear</button>
          </div>
        </div>
        <div style={{ maxHeight: 340, overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 46 }}>Dress</th>
                <th>#</th>
                <th>Player</th>
                <th>Pos</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={dressed.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                  </td>
                  <td>{p.number ?? ""}</td>
                  <td>{p.name}</td>
                  <td>{p.position || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt8">
          <button className="btn primary" onClick={saveRoster} disabled={saving}>
            {saving ? "Saving…" : "Save Roster"}
          </button>
        </div>
      </div>
    );
  };

  const GoalieEditor = ({ title, logo, teamId, lines, setLines, players }) => {
    const add = () =>
      setLines((cur) => [
        ...cur,
        {
          team_id: teamId,
          player_id: null,
          started: false,
          minutes_seconds: 0,
          shots_against: 0,
          goals_against: 0,
          decision: "ND",
          shutout: false,
        },
      ]);
    const rem = (idx) => setLines((cur) => cur.filter((_, i) => i !== idx));
    const patch = (idx, patch) =>
      setLines((cur) => cur.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

    return (
      <div className="card">
        <div className="row mb8">
          {logo && <img src={logo} alt="" className="team-logo" />}
          <h3 className="m0">{title} Goalies</h3>
          <div className="right">
            <button className="btn" onClick={add}>+ Add</button>
          </div>
        </div>
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
            {lines.length === 0 ? (
              <tr><td colSpan={8} style={{ color:"#888" }}>No lines</td></tr>
            ) : (
              lines.map((l, idx) => (
                <tr key={idx}>
                  <td>
                    <button className="btn" onClick={() => rem(idx)} title="Remove">✕</button>
                  </td>
                  <td>
                    <select
                      value={l.player_id || ""}
                      onChange={(e) => patch(idx, { player_id: Number(e.target.value) })}
                      style={{ minWidth: 220 }}
                    >
                      <option value="">Choose…</option>
                      {sortPlayers(players)
                        .sort((a,b)=> (isG(b)-isG(a))) /* G first */
                        .map((p)=>(
                          <option key={p.id} value={p.id}>{playerLabel(p)}</option>
                        ))}
                    </select>
                  </td>
                  <td style={{ textAlign:"center" }}>
                    <input
                      type="checkbox"
                      checked={!!l.started}
                      onChange={(e) => patch(idx, { started: e.target.checked })}
                    />
                  </td>
                  <td>
                    <div className="row">
                      <button className="btn" onClick={() => patch(idx, { shots_against: Math.max(0,(l.shots_against||0)-1) })}>−</button>
                      <input
                        type="number"
                        value={l.shots_against || 0}
                        onChange={(e)=>patch(idx,{shots_against:Number(e.target.value)||0})}
                        style={{ width: 70 }}
                      />
                      <button className="btn" onClick={() => patch(idx, { shots_against: (l.shots_against||0)+1 })}>+</button>
                    </div>
                  </td>
                  <td>
                    <div className="row">
                      <button className="btn" onClick={() => patch(idx, { goals_against: Math.max(0,(l.goals_against||0)-1) })}>−</button>
                      <input
                        type="number"
                        value={l.goals_against || 0}
                        onChange={(e)=>patch(idx,{goals_against:Number(e.target.value)||0})}
                        style={{ width: 70 }}
                      />
                      <button className="btn" onClick={() => patch(idx, { goals_against: (l.goals_against||0)+1 })}>+</button>
                    </div>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={toMMSS(l.minutes_seconds)}
                      onChange={(e)=>patch(idx,{minutes_seconds: toSec(e.target.value)})}
                      placeholder="mm:ss"
                      style={{ width: 90 }}
                    />
                  </td>
                  <td>
                    <select
                      value={l.decision || "ND"}
                      onChange={(e)=>patch(idx,{decision:e.target.value})}
                    >
                      <option value="ND">ND</option>
                      <option value="W">W</option>
                      <option value="L">L</option>
                      <option value="OTL">OTL</option>
                      <option value="SOL">SOL</option>
                    </select>
                  </td>
                  <td style={{ textAlign:"center" }}>
                    <input
                      type="checkbox"
                      checked={!!l.shutout}
                      onChange={(e)=>patch(idx,{shutout:e.target.checked})}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt8">
          <button className="btn primary" onClick={saveGoalies} disabled={saving}>
            {saving ? "Saving…" : "Save Goalies"}
          </button>
        </div>
      </div>
    );
  };

  const EventsBox = () => {
    const optsTeam = [
      { v: "home", l: `Home (${game.home_team.short_name})` },
      { v: "away", l: `Away (${game.away_team.short_name})` },
    ];
    const teamPlayers = evTeam ? allPlayers(evTeam) : [];

    return (
      <div className="card">
        <div className="row mb8">
          <h3 className="m0">Events</h3>
          <div className="right chip">Score auto-calculated</div>
        </div>

        <div className="row mb8" style={{ flexWrap:"wrap", gap:12 }}>
          <select value={evTeam} onChange={(e)=>setEvTeam(e.target.value)}>
            <option value="">Team…</option>
            {optsTeam.map((t)=> <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>

          <select
            value={evPlayerId}
            onChange={(e)=>setEvPlayerId(e.target.value)}
            style={{ minWidth: 220 }}
          >
            <option value="">Player (optional)…</option>
            {teamPlayers.map((p)=>(
              <option key={p.id} value={p.id}>{playerLabel(p)}</option>
            ))}
          </select>

          <input
            type="number"
            min="1"
            value={evPeriod}
            onChange={(e)=>setEvPeriod(e.target.value)}
            style={{ width: 70 }}
            title="Period"
          />

          <input
            type="text"
            value={evTime}
            onChange={(e)=>setEvTime(e.target.value)}
            style={{ width: 90 }}
            placeholder="mm:ss"
            title="Time"
          />

          <select value={evType} onChange={(e)=>setEvType(e.target.value)}>
            <option value="goal">goal</option>
            <option value="assist">assist</option>
            <option value="penalty">penalty</option>
          </select>

          <button className="btn primary" onClick={addEvent}>Add</button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Time</th>
              <th>Team</th>
              <th>Event</th>
              <th>Player</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr><td colSpan={6} style={{ color:"#888" }}>No events yet</td></tr>
            ) : (
              events.map((e)=> {
                const ply = e.player || hpMap[e.player_id] || apMap[e.player_id] || null;
                const plyText = ply ? playerLabel(ply) : "—";
                return (
                  <tr key={e.id}>
                    <td>P{e.period}</td>
                    <td>{e.time_mmss}</td>
                    <td>{e.team?.short_name || ""}</td>
                    <td>{e.event}</td>
                    <td>{plyText}</td>
                    <td style={{ textAlign:"right" }}>
                      <button className="btn" onClick={()=>deleteEvent(e.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // ---------- layout ----------
  return (
    <div className="container">
      <div className="card">
        <div className="row">
          <div>
            <Link to="/games">← Back to Games</Link>
            <h2 className="m0">
              {new Date(game.game_date).toLocaleDateString()} • {game.home_team.name} vs {game.away_team.name}
            </h2>
            <div className="kicker">Status: <strong>{game.status}</strong></div>
          </div>
          <div className="right row">
            {game.status !== "final" ? (
              <button className="btn primary" onClick={()=>setStatus("final")}>Finalize</button>
            ) : (
              <>
                <button className="btn" onClick={()=>setStatus("open")}>Reopen</button>
                <button className="btn ghost" onClick={()=>nav(`/games/${slug}/boxscore`)}>Boxscore</button>
              </>
            )}
          </div>
        </div>

        {/* scoreboard */}
        <div className="scoreboard">
          <div className="team">
            {game.home_team.logo_url && <img src={game.home_team.logo_url} alt="" className="team-logo" />}
            <div>
              <div className="team-name">{game.home_team.name}</div>
              <div className="abbr">{game.home_team.short_name}</div>
            </div>
          </div>
          <div className="score">
            {game.home_score}
            <span className="vs">vs</span>
            {game.away_score}
          </div>
          <div className="team" style={{ justifyContent:"flex-end" }}>
            <div style={{ textAlign:"right" }}>
              <div className="team-name">{game.away_team.name}</div>
              <div className="abbr">{game.away_team.short_name}</div>
            </div>
            {game.away_team.logo_url && <img src={game.away_team.logo_url} alt="" className="team-logo" />}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems:"start" }}>
        {/* Left block: rosters + goalies */}
        <div className="grid-2" style={{ alignItems:"start" }}>
          <RosterBox
            title={`${game.home_team.short_name} Lineup`}
            logo={game.home_team.logo_url}
            players={homePlayers}
            dressed={homeDressed}
            setDressed={setHomeDressed}
          />
          <RosterBox
            title={`${game.away_team.short_name} Lineup`}
            logo={game.away_team.logo_url}
            players={awayPlayers}
            dressed={awayDressed}
            setDressed={setAwayDressed}
          />

          <GoalieEditor
            title={game.home_team.short_name}
            logo={game.home_team.logo_url}
            teamId={game.home_team.id}
            lines={homeGoalies}
            setLines={setHomeGoalies}
            players={homePlayers}
          />
          <GoalieEditor
            title={game.away_team.short_name}
            logo={game.away_team.logo_url}
            teamId={game.away_team.id}
            lines={awayGoalies}
            setLines={setAwayGoalies}
            players={awayPlayers}
          />

          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <button className="btn primary" onClick={saveRoster} disabled={saving}>
              {saving ? "Saving…" : "Save Roster"}
            </button>
            <span style={{ padding: 6 }} />
            <button className="btn primary" onClick={saveGoalies} disabled={saving}>
              {saving ? "Saving…" : "Save Goalies"}
            </button>
          </div>
        </div>

        {/* Right block: events */}
        <div>
          <EventsBox />
        </div>
      </div>
    </div>
  );
}
