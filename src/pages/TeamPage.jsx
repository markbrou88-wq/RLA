import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useParams, Link } from "react-router-dom";

let useI18n;
try {
  useI18n = require("../i18n").useI18n;
} catch {
  useI18n = () => ({ t: (s) => s });
}

export default function TeamPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [position, setPosition] = useState("");

  useEffect(() => {
    (async () => {
      const { data: tm } = await supabase
        .from("teams")
        .select("id,name,short_name,logo_url")
        .eq("id", id)
        .maybeSingle();
      setTeam(tm || null);

      const { data: pl } = await supabase
        .from("players")
        .select("id,name,number,position")
        .eq("team_id", id)
        .order("number");
      setPlayers(pl || []);
    })();
  }, [id]);

  async function addPlayer(e) {
    e.preventDefault();
    const { error } = await supabase.from("players").insert({
      team_id: Number(id),
      name,
      number: number === "" ? null : Number(number),
      position: position || null,
    });
    if (error) return alert(error.message);
    setName("");
    setNumber("");
    setPosition("");
    const { data: pl } = await supabase
      .from("players")
      .select("id,name,number,position")
      .eq("team_id", id)
      .order("number");
    setPlayers(pl || []);
  }

  async function removePlayer(pid) {
    if (!window.confirm(t("Delete this player?"))) return;
    await supabase.from("players").delete().eq("id", pid);
    setPlayers((p) => p.filter((x) => x.id !== pid));
  }

  async function updatePlayer(pid, field, value) {
    const { error } = await supabase
      .from("players")
      .update({ [field]: value })
      .eq("id", pid);
    if (error) alert(error.message);
  }

  if (!team) return <div>{t("Loading…")}</div>;

  return (
    <div className="container">
      <div style={{ marginBottom: 8 }}>
        <Link to="/standings">← {t("Back to Standings")}</Link>
      </div>

      {/* Team Header */}
      <div
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: 16,
        }}
      >
        {team.logo_url && (
          <img
            src={team.logo_url}
            alt=""
            style={{
              width: 64,
              height: 64,
              objectFit: "contain",
              borderRadius: 8,
            }}
          />
        )}
        <div>
          <h2 style={{ margin: 0 }}>{team.name}</h2>
          <div style={{ color: "var(--muted)", fontSize: 14 }}>
            {t("Team ID")}: {team.id}
          </div>
        </div>
      </div>

      {/* Roster */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="m0">{t("Roster")}</h3>
        <form
          onSubmit={addPlayer}
          className="row"
          style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}
        >
          <input
            placeholder={t("Name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            placeholder={t("Number")}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            style={{ width: 70, textAlign: "center" }}
          />
          <input
            placeholder={t("Position (C, D, G)")}
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            style={{ width: 100, textAlign: "center" }}
          />
          <button className="btn" type="submit">
            {t("Add Player")}
          </button>
        </form>

        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
              marginTop: 8,
            }}
          >
            <thead style={{ background: "var(--table-head, #f4f5f8)" }}>
              <tr>
                <th style={{ width: 70, textAlign: "center" }}>#</th>
                <th style={{ textAlign: "left" }}>{t("Player")}</th>
                <th style={{ width: 90, textAlign: "center" }}>
                  {t("Position")}
                </th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {players.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: 12,
                      textAlign: "center",
                      color: "var(--muted)",
                    }}
                  >
                    {t("No players yet.")}
                  </td>
                </tr>
              ) : (
                players.map((p) => (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="number"
                        value={p.number ?? ""}
                        onChange={(e) =>
                          updatePlayer(p.id, "number", e.target.value)
                        }
                        style={{
                          width: 50,
                          textAlign: "center",
                          border: "none",
                          background: "transparent",
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) =>
                          updatePlayer(p.id, "name", e.target.value)
                        }
                        style={{
                          width: "95%",
                          border: "none",
                          background: "transparent",
                        }}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="text"
                        value={p.position ?? ""}
                        onChange={(e) =>
                          updatePlayer(p.id, "position", e.target.value)
                        }
                        style={{
                          width: 50,
                          textAlign: "center",
                          border: "none",
                          background: "transparent",
                        }}
                      />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn danger"
                        onClick={() => removePlayer(p.id)}
                      >
                        {t("Delete")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
