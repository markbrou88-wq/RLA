import React from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useI18n } from "../i18n.jsx";

export default function GamesPage() {
  const { t } = useI18n();

  const [games, setGames] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  const [teams, setTeams] = React.useState([]);
  const [teamFilterHome, setTeamFilterHome] = React.useState("");
  const [teamFilterAway, setTeamFilterAway] = React.useState("");
  const [dateFilter, setDateFilter] = React.useState("");

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      // Teams for filters
      const { data: ts, error: te } = await supabase
        .from("teams")
        .select("id, name, short_name, logo_url")
        .order("name");
      if (te) setErr(te.message);
      setTeams(ts || []);

      // Games with joined home/away teams
      const { data: gs, error: ge } = await supabase
        .from("games")
        .select(`
          id, slug, game_date, status, home_score, away_score,
          home_team_id, away_team_id,
          home_team:teams!games_home_team_id_fkey(id, name, short_name, logo_url),
          away_team:teams!games_away_team_id_fkey(id, name, short_name, logo_url)
        `)
        .order("game_date", { ascending: false });
      if (ge) setErr(ge.message);
      setGames(gs || []);

      setLoading(false);
    })();
  }, []);

  const filtered = games.filter((g) => {
    if (dateFilter && g.game_date !== dateFilter) return false;
    if (teamFilterHome && String(g.home_team_id) !== teamFilterHome) return false;
    if (teamFilterAway && String(g.away_team_id) !== teamFilterAway) return false;
    return true;
  });

  const scoreStr = (g) => `${g.home_score ?? 0}–${g.away_score ?? 0}`;

  async function handleDelete(gameId) {
    if (!window.confirm(t("Delete this game? This cannot be undone.") || "Delete this game? This cannot be undone.")) {
      return;
    }
    const { error } = await supabase.from("games").delete().eq("id", gameId);
    if (error) {
      alert(error.message);
      return;
    }
    setGames((cur) => cur.filter((g) => g.id !== gameId));
  }

  // Inline link-style button (to match "Open"/"Boxscore" look)
  const linkButtonStyle = {
    background: "none",
    border: "none",
    padding: 0,
    margin: 0,
    color: "#0b61ff",
    textDecoration: "underline",
    cursor: "pointer",
    font: "inherit",
  };

  return (
    <div className="container">
      <div className="card">
        <h2 className="m0">{t("Games")}</h2>
        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            aria-label={t("Date")}
          />
          <select
            value={teamFilterHome}
            onChange={(e) => setTeamFilterHome(e.target.value)}
            aria-label="Home team"
          >
            <option value="">{t("Team")}… (Home)</option>
            {teams.map((t_) => (
              <option key={t_.id} value={t_.id}>
                {t_.name}
              </option>
            ))}
          </select>
          <select
            value={teamFilterAway}
            onChange={(e) => setTeamFilterAway(e.target.value)}
            aria-label="Away team"
          >
            <option value="">{t("Team")}… (Away)</option>
            {teams.map((t_) => (
              <option key={t_.id} value={t_.id}>
                {t_.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>{t("Date")}</th>
                <th>{t("Matchup")}</th>
                <th style={{ width: 90 }}>{t("Score")}</th>
                <th style={{ width: 120 }}>{t("Status")}</th>
                <th style={{ width: 260 }}>{t("Actions") || "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}>Loading…</td></tr>
              ) : err ? (
                <tr><td colSpan={5} style={{ color: "crimson" }}>{err}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ color: "#888" }}>—</td></tr>
              ) : (
                filtered.map((g) => (
                  <tr key={g.id}>
                    <td>{g.game_date}</td>
                    <td>
                      <span style={{ whiteSpace: "nowrap" }}>
                        {g.away_team?.logo_url && (
                          <img
                            src={g.away_team.logo_url}
                            alt=""
                            className="team-logo"
                          />
                        )}
                        <Link to={`/teams/${g.away_team?.id}`}>{g.away_team?.name}</Link>
                      </span>
                      <span style={{ color: "#777", margin: "0 8px" }}>vs</span>
                      <span style={{ whiteSpace: "nowrap" }}>
                        {g.home_team?.logo_url && (
                          <img
                            src={g.home_team.logo_url}
                            alt=""
                            className="team-logo"
                          />
                        )}
                        <Link to={`/teams/${g.home_team?.id}`}>{g.home_team?.name}</Link>
                      </span>
                    </td>
                    <td>{scoreStr(g)}</td>
                    <td>{g.status}</td>
                    <td>
                      <Link to={`/games/${g.slug}`}>{t("Open")}</Link>
                      {" · "}
                      <Link to={`/games/${g.slug}/boxscore`}>{t("Boxscore")}</Link>
                      {" · "}
                      {/* Reopen removed as requested */}
                      <button
                        onClick={() => handleDelete(g.id)}
                        style={linkButtonStyle}
                        title={t("Delete")}
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

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <Link to="/games" className="btn secondary">{t("All Games →")}</Link>
      </div>
    </div>
  );
}
