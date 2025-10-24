import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient.js";

function TeamBlock({ title, players, selected, onToggle }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div style={{ maxHeight: 420, overflowY: "auto", paddingRight: 6 }}>
        {players.map((p) => {
          const checked = selected.has(p.id);
          return (
            <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(p.id)}
              />
              <span style={{ width: 44, opacity: 0.8 }}>{p.number ?? ""}</span>
              <span>{p.name}</span>
              {p.position && <span style={{ marginLeft: "auto", opacity: 0.6 }}>{p.position}</span>}
            </label>
          );
        })}
        {players.length === 0 && <div style={{ color: "#777" }}>No players on this team yet.</div>}
      </div>
    </div>
  );
}

export default function GameRosterPage() {
  const { slug } = useParams();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [user, setUser] = React.useState(null);

  const [game, setGame] = React.useState(null);
  const [homePlayers, setHomePlayers] = React.useState([]);
  const [awayPlayers, setAwayPlayers] = React.useState([]);

  // sets of player_id who are checked for this game
  const [homeSelected, setHomeSelected] = React.useState(new Set());
  const [awaySelected, setAwaySelected] = React.useState(new Set());

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);

    // 1) game + teams
    const { data: g, error: ge } = await supabase
      .from("games")
      .select(`
        id, slug, game_date, status,
        home_team:teams!games_home_team_id_fkey ( id, name, short_name, logo_url ),
        away_team:teams!games_away_team_id_fkey ( id, name, short_name, logo_url )
      `)
      .eq("slug", slug)
      .maybeSingle();

    if (ge || !g) {
      alert(ge?.message || "Game not found");
      setLoading(false);
      return;
    }
    setGame(g);

    // 2) both team rosters (all players)
    const homeQ = supabase
      .from("players")
      .select("id, name, number, position")
      .eq("team_id", g.home_team.id)
      .order("number", { ascending: true, nullsFirst: true })
      .order("name", { ascending: true });

    const awayQ = supabase
      .from("players")
      .select("id, name, number, position")
      .eq("team_id", g.away_team.id)
      .order("number", { ascending: true, nullsFirst: true })
      .order("name", { ascending: true });

    // 3) existing selections for this game
    const rosterQ = supabase
      .from("game_rosters")
      .select("player_id, team_id, dressed")
      .eq("game_id", g.id)
      .eq("dressed", true);

    const [{ data: hp }, { data: ap }, { data: rp }] = await Promise.all([homeQ, awayQ, rosterQ]);

    setHomePlayers(hp || []);
    setAwayPlayers(ap || []);

    const hSel = new Set();
    const aSel = new Set();
    (rp || []).forEach((row) => {
      if (row.team_id === g.home_team.id) hSel.add(row.player_id);
      if (row.team_id === g.away_team.id) aSel.add(row.player_id);
    });
    setHomeSelected(hSel);
    setAwaySelected(aSel);

    setLoading(false);
  }, [slug]);

  React.useEffect(() => { load(); }, [load]);

  const toggleHome = (id) => {
    setHomeSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAway = (id) => {
    setAwaySelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!user) { alert("Sign in to edit roster."); return; }
    setSaving(true);

    // read current rows so we can diff
    const { data: current } = await supabase
      .from("game_rosters")
      .select("player_id, team_id")
      .eq("game_id", game.id);

    const currentSet = new Set((current || []).map((r) => `${r.player_id}:${r.team_id}`));
    const desired = [];

    // build desired set from selected checkboxes
    homeSelected.forEach((pid) => desired.push([pid, game.home_team.id]));
    awaySelected.forEach((pid) => desired.push([pid, game.away_team.id]));
    const desiredSet = new Set(desired.map(([pid, tid]) => `${pid}:${tid}`));

    // upserts for all selected
    const upserts = desired.map(([player_id, team_id]) => ({
      game_id: game.id,
      team_id,
      player_id,
      dressed: true,
    }));

    // deletes for any current rows not in desired
    const toDelete = (current || []).filter(
      (r) => !desiredSet.has(`${r.player_id}:${r.team_id}`)
    );

    // Apply changes
    if (upserts.length) {
      const { error } = await supabase.from("game_rosters").upsert(upserts, {
        onConflict: "game_id,player_id",
        ignoreDuplicates: false,
      });
      if (error) { alert(error.message); setSaving(false); return; }
    }

    if (toDelete.length) {
      const ids = toDelete.map((r) => r.player_id);
      // delete by game + player_ids (team filter optional because (game_id, player_id) is unique)
      const { error } = await supabase
        .from("game_rosters")
        .delete()
        .eq("game_id", game.id)
        .in("player_id", ids);
      if (error) { alert(error.message); setSaving(false); return; }
    }

    setSaving(false);
    alert("Roster saved.");
  };

  if (loading) return <div style={{ padding: 16 }}>Loading roster…</div>;
  if (!game) return null;

  const home = game.home_team;
  const away = game.away_team;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <Link to="/games" style={{ textDecoration: "none" }}>← Back to Games</Link>
          <h2 style={{ margin: "4px 0 0" }}>
            Roster — {home.short_name || home.name} vs {away.short_name || away.name}
          </h2>
          <div style={{ color: "#666" }}>{new Date(game.game_date).toLocaleDateString()}</div>
        </div>
        <div>
          <button onClick={save} disabled={saving || !user}>
            {saving ? "Saving…" : "Save Roster"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <TeamBlock
          title={`${home.short_name || home.name} (Home)`}
          players={homePlayers}
          selected={homeSelected}
          onToggle={toggleHome}
        />
        <TeamBlock
          title={`${away.short_name || away.name} (Away)`}
          players={awayPlayers}
          selected={awaySelected}
          onToggle={toggleAway}
        />
      </div>
    </div>
  );
}
