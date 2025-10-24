// src/pages/TeamPage.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient.js";

export default function TeamPage() {
  const { id } = useParams(); // team id in URL
  const teamId = Number(id);

  const [team, setTeam] = React.useState(null);
  const [players, setPlayers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [user, setUser] = React.useState(null);

  // add / edit forms
  const [newPlayer, setNewPlayer] = React.useState({ name: "", number: "", position: "" });
  const [editingId, setEditingId] = React.useState(null);
  const [editForm, setEditForm] = React.useState({ name: "", number: "", position: "" });

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);

    const { data: t, error: te } = await supabase
      .from("teams")
      .select("id, name, short_name, logo_url")
      .eq("id", teamId)
      .maybeSingle();

    if (te) { console.error(te); alert(te.message); setLoading(false); return; }
    setTeam(t);

    // order by jersey number if present, then name
    const { data: p, error: pe } = await supabase
      .from("players")
      .select("id, name, number, position")
      .eq("team_id", teamId)
      .order("number", { ascending: true, nullsFirst: true })
      .order("name", { ascending: true });

    if (pe) { console.error(pe); alert(pe.message); }
    setPlayers(p || []);
    setLoading(false);
  }, [teamId]);

  React.useEffect(() => { load(); }, [load]);

  const addPlayer = async (e) => {
    e.preventDefault();
    if (!newPlayer.name.trim()) return;
    const payload = {
      team_id: teamId,
      name: newPlayer.name.trim(),
      number: newPlayer.number ? Number(newPlayer.number) : null,
      position: newPlayer.position || null,
    };
    const { error } = await supabase.from("players").insert(payload);
    if (error) { alert(error.message); return; }
    setNewPlayer({ name: "", number: "", position: "" });
    load();
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditForm({
      name: p.name || "",
      number: p.number ?? "",
      position: p.position || "",
    });
  };

  const saveEdit = async (id) => {
    const payload = {
      name: editForm.name.trim(),
      number: editForm.number === "" ? null : Number(editForm.number),
      position: editForm.position || null,
    };
    const { error } = await supabase.from("players").update(payload).eq("id", id);
    if (error) { alert(error.message); return; }
    setEditingId(null);
    load();
  };

  const deletePlayer = async (id) => {
    if (!confirm("Remove this player from the roster?")) return;
    const { error } = await supabase.from("players").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    load();
  };

  if (loading) return <div style={{ padding: 16 }}>Loading team…</div>;
  if (!team)     return <div style={{ padding: 16, color: "crimson" }}>Team not found</div>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <Link to="/" style={{ textDecoration: "none" }}>← Home</Link>
        {team.logo_url && (
          <img src={team.logo_url} alt={team.name} style={{ width: 56, height: 56, objectFit: "contain" }} />
        )}
        <div>
          <h2 style={{ margin: 0 }}>{team.name}</h2>
          <div style={{ color: "#666" }}>{team.short_name}</div>
        </div>
      </div>

      <h3 style={{ marginTop: 0 }}>Roster</h3>
      <div style={{ overflowX: "auto", marginBottom: 16 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
          <thead>
            <tr>
              {["#", "Player", "Pos", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td style={{ padding: "8px", width: 80 }}>
                  {editingId === p.id ? (
                    <input
                      value={editForm.number}
                      onChange={(e) => setEditForm((x) => ({ ...x, number: e.target.value }))}
                      style={{ width: 64 }}
                      inputMode="numeric"
                    />
                  ) : (p.number ?? "")}
                </td>
                <td style={{ padding: "8px" }}>
                  {editingId === p.id ? (
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm((x) => ({ ...x, name: e.target.value }))}
                      style={{ width: "100%" }}
                    />
                  ) : p.name}
                </td>
                <td style={{ padding: "8px", width: 100 }}>
                  {editingId === p.id ? (
                    <input
                      value={editForm.position}
                      onChange={(e) => setEditForm((x) => ({ ...x, position: e.target.value }))}
                      style={{ width: 84 }}
                      placeholder="F/D/G"
                    />
                  ) : (p.position || "")}
                </td>
                <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                  {user ? (
                    editingId === p.id ? (
                      <>
                        <button onClick={() => saveEdit(p.id)} style={{ marginRight: 6 }}>Save</button>
                        <button onClick={() => setEditingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(p)} style={{ marginRight: 6 }}>Edit</button>
                        <button onClick={() => deletePlayer(p.id)}>Delete</button>
                      </>
                    )
                  ) : (
                    <span style={{ color: "#888" }}>Sign in to edit</span>
                  )}
                </td>
              </tr>
            ))}
            {players.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 12, color: "#777" }}>No players yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {user ? (
        <form
          onSubmit={addPlayer}
          style={{
            display: "grid",
            gridTemplateColumns: "80px 1fr 100px auto",
            gap: 8,
            alignItems: "center",
            maxWidth: 560,
          }}
        >
          <input
            placeholder="#"
            value={newPlayer.number}
            onChange={(e) => setNewPlayer((x) => ({ ...x, number: e.target.value }))}
            inputMode="numeric"
          />
          <input
            placeholder="Player name"
            value={newPlayer.name}
            onChange={(e) => setNewPlayer((x) => ({ ...x, name: e.target.value }))}
          />
          <input
            placeholder="Pos (F/D/G)"
            value={newPlayer.position}
            onChange={(e) => setNewPlayer((x) => ({ ...x, position: e.target.value }))}
          />
          <button type="submit">Add</button>
        </form>
      ) : (
        <p style={{ color: "#666" }}>Sign in to add/edit roster.</p>
      )}
    </div>
  );
}
