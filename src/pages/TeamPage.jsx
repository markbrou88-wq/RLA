import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
// ⬇️ Adjust this import if your client lives elsewhere (e.g. "../supabaseClient")
import { supabase } from "../supabaseClient";

function numberOrZero(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export default function TeamPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();

  // Team header + sparkline (kept simple — uses your existing data shape)
  const [team, setTeam] = useState(null);

  // Roster + stats
  const [players, setPlayers] = useState([]); // [{id, name, number, position}]
  const [statRows, setStatRows] = useState([]); // merged view for table
  const [loading, setLoading] = useState(true);

  // Sorting
  const [sort, setSort] = useState({ key: "number", dir: "asc" });

  // Resizable columns: width state per column key
  const [colWidths, setColWidths] = useState({
    player: 260,
    number: 70,
    pos: 70,
    gp: 70,
    g: 70,
    a: 70,
    pts: 80,
    actions: 160,
  });

  const tableRef = useRef(null);
  const resizingRef = useRef(null);

  // ------- Data loading -------

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Team
      const { data: teamData, error: teamErr } = await supabase
        .from("teams")
        .select("*")
        .eq("id", teamId)
        .single();
      if (teamErr) {
        console.error(teamErr);
      } else {
        setTeam(teamData);
      }

      // Roster
      const { data: roster, error: rosterErr } = await supabase
        .from("players")
        .select("id, name, number, position")
        .eq("team_id", teamId)
        .order("number", { ascending: true });

      if (rosterErr) {
        console.error(rosterErr);
        setPlayers([]);
        setStatRows([]);
        setLoading(false);
        return;
      }

      setPlayers(roster || []);

      // Pull leaders_current for these player_ids so stats match the Stats tab
      const ids = (roster || []).map((p) => p.id);
      let leadersMap = {};
      if (ids.length) {
        const { data: leaders, error: leadersErr } = await supabase
          .from("leaders_current")
          .select("player_id, gp, g, a, pts")
          .in("player_id", ids);

        if (leadersErr) {
          console.error(leadersErr);
        } else {
          leadersMap = (leaders || []).reduce((acc, r) => {
            acc[r.player_id] = {
              gp: numberOrZero(r.gp),
              g: numberOrZero(r.g),
              a: numberOrZero(r.a),
              pts:
                r.pts !== undefined && r.pts !== null
                  ? numberOrZero(r.pts)
                  : numberOrZero(r.g) + numberOrZero(r.a),
            };
            return acc;
          }, {});
        }
      }

      // Merge roster + stats
      const merged = (roster || []).map((p) => {
        const s = leadersMap[p.id] || { gp: 0, g: 0, a: 0, pts: 0 };
        return {
          id: p.id,
          name: p.name,
          number: numberOrZero(p.number),
          pos: (p.position || "").toUpperCase(),
          gp: s.gp,
          g: s.g,
          a: s.a,
          pts: s.pts,
        };
      });

      setStatRows(merged);
      setLoading(false);
    }

    load();
  }, [teamId]);

  // ------- Sorting -------

  const sortedRows = useMemo(() => {
    const rows = [...statRows];
    const { key, dir } = sort;

    rows.sort((a, b) => {
      const av = a[key];
      const bv = b[key];

      if (typeof av === "number" && typeof bv === "number") {
        return dir === "asc" ? av - bv : bv - av;
      }

      const aa = (av ?? "").toString().toLowerCase();
      const bb = (bv ?? "").toString().toLowerCase();
      if (aa < bb) return dir === "asc" ? -1 : 1;
      if (aa > bb) return dir === "asc" ? 1 : -1;
      return 0;
    });

    return rows;
  }, [statRows, sort]);

  function toggleSort(key) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  }

  // ------- Column resizing -------

  function onResizerMouseDown(e, key) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidths[key];

    resizingRef.current = { key, startX, startWidth };

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const newWidth = Math.max(48, startWidth + dx);
      setColWidths((w) => ({ ...w, [key]: newWidth }));
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      resizingRef.current = null;
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ------- CRUD (keep your existing behavior) -------

  async function handleDelete(playerId) {
    if (!window.confirm("Delete this player?")) return;
    const { error } = await supabase.from("players").delete().eq("id", playerId);
    if (error) {
      alert(error.message);
      return;
    }
    setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    setStatRows((prev) => prev.filter((p) => p.id !== playerId));
  }

  async function handleEdit(player) {
    const name = window.prompt("Player name:", player.name);
    if (!name) return;
    const number = window.prompt("Number:", String(player.number ?? ""));
    const pos = window.prompt("Position (F/D/G):", player.pos ?? "F");

    const updates = {
      name,
      number: number ? Number(number) : null,
      position: pos || null,
    };

    const { error } = await supabase.from("players").update(updates).eq("id", player.id);
    if (error) {
      alert(error.message);
      return;
    }
    // Patch local
    setPlayers((prev) =>
      prev.map((p) => (p.id === player.id ? { ...p, name, number: Number(number), position: pos } : p))
    );
    setStatRows((prev) =>
      prev.map((r) => (r.id === player.id ? { ...r, name, number: Number(number), pos } : r))
    );
  }

  async function handleAdd() {
    const name = window.prompt("Player name:");
    if (!name) return;
    const number = window.prompt("Number:");
    const pos = window.prompt("Position (F/D/G):", "F");

    const insert = {
      team_id: teamId,
      name,
      number: number ? Number(number) : null,
      position: pos || null,
    };

    const { data, error } = await supabase
      .from("players")
      .insert([insert])
      .select("id, name, number, position")
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    setPlayers((prev) => [...prev, data]);
    setStatRows((prev) => [
      ...prev,
      {
        id: data.id,
        name: data.name,
        number: Number(data.number ?? 0),
        pos: (data.position || "").toUpperCase(),
        gp: 0,
        g: 0,
        a: 0,
        pts: 0,
      },
    ]);
  }

  // ------- Render -------

  if (loading) {
    return <div className="page pad">Loading team…</div>;
  }

  if (!team) {
    return (
      <div className="page pad">
        <button className="btn" onClick={() => navigate(-1)}>
          ← Back to Standings
        </button>
        <p>Team not found.</p>
      </div>
    );
  }

  return (
    <div className="page pad">
      {/* Tiny styles for resizers and sorted cues */}
      <style>{`
        .team-header { display:flex; gap:16px; align-items:center; margin-bottom:16px; }
        .team-card { border:1px solid var(--border); border-radius:10px; padding:12px 16px; display:flex; align-items:center; gap:12px; }
        .spark { border:1px solid var(--border); border-radius:10px; padding:12px; flex:1; min-height:120px; }
        .table-wrap { margin-top:12px; border:1px solid var(--border); border-radius:10px; overflow:auto; }
        table.team-table { width:100%; border-collapse:separate; border-spacing:0; }
        table.team-table th, table.team-table td { border-bottom:1px solid var(--border); }
        table.team-table th { position:relative; background:var(--tableHeaderBg,#fafafa); color:var(--text); font-weight:600; }
        table.team-table th .sort-cue { opacity:0.5; margin-left:6px; }
        .col-resizer { position:absolute; right:0; top:0; width:8px; height:100%; cursor:col-resize; }
        .col-grip { position:absolute; right:2px; top:50%; transform:translateY(-50%); width:3px; height:18px; background:var(--border); border-radius:2px; }
        .actions-cell .btn { margin-right:8px; }
        .num { text-align:right; }
        .pad-sm { padding:10px 12px; }
      `}</style>

      <div className="team-header">
        <button className="btn" onClick={() => navigate(-1)}>
          ← Back to Standings
        </button>

        <div className="team-card">
          {/* replace with your logo if you keep it in DB */}
          <img
            src={team.logo_url || "/logo-rl.png"}
            alt="logo"
            style={{ width: 64, height: 36, objectFit: "contain" }}
          />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{team.name}</div>
            {/* keep your record summary if you store it elsewhere */}
          </div>
        </div>

        {/* Sparkline placeholder — keep your existing chart logic if you had one */}
        <div className="spark">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Goal Difference (last 10)</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            (Placeholder — keeping your previous chart area. You can wire your existing data here.)
          </div>
        </div>
      </div>

      <div className="table-wrap" ref={tableRef}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 8px 0 8px" }}>
          <button className="btn" onClick={handleAdd}>
            Add Player
          </button>
        </div>

        <table className="team-table">
          <colgroup>
            <col style={{ width: colWidths.player }} />
            <col style={{ width: colWidths.number }} />
            <col style={{ width: colWidths.pos }} />
            <col style={{ width: colWidths.gp }} />
            <col style={{ width: colWidths.g }} />
            <col style={{ width: colWidths.a }} />
            <col style={{ width: colWidths.pts }} />
            <col style={{ width: colWidths.actions }} />
          </colgroup>

          <thead>
            <tr>
              {[
                { key: "name", label: "Player", widthKey: "player" },
                { key: "number", label: "#", widthKey: "number" },
                { key: "pos", label: "POS", widthKey: "pos" },
                { key: "gp", label: "GP", widthKey: "gp" },
                { key: "g", label: "G", widthKey: "g" },
                { key: "a", label: "A", widthKey: "a" },
                { key: "pts", label: "PTS", widthKey: "pts" },
                { key: "actions", label: "Actions", widthKey: "actions", nosort: true },
              ].map((h) => (
                <th key={h.key} className="pad-sm" onClick={() => !h.nosort && toggleSort(h.key)}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span>{h.label}</span>
                    {!h.nosort && (
                      <span className="sort-cue">
                        {sort.key === h.key ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    )}
                  </div>
                  <div
                    className="col-resizer"
                    onMouseDown={(e) => onResizerMouseDown(e, h.widthKey)}
                    title="Drag to resize column"
                  >
                    <div className="col-grip" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.id}>
                <td className="pad-sm">
                  <Link to={`/player/${r.id}`} className="link">
                    {r.name}
                  </Link>
                </td>
                <td className="pad-sm num">{r.number}</td>
                <td className="pad-sm">{r.pos}</td>
                <td className="pad-sm num">{r.gp}</td>
                <td className="pad-sm num">{r.g}</td>
                <td className="pad-sm num">{r.a}</td>
                <td className="pad-sm num">{r.pts}</td>
                <td className="pad-sm actions-cell">
                  <button className="btn" onClick={() => handleEdit(r)}>
                    Edit
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDelete(r.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!sortedRows.length && (
              <tr>
                <td className="pad-sm" colSpan={8}>
                  No players yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
