// src/pages/GamesPage.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import supabase from '../supabaseClient';

function formatGameDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function GamesPage() {
  const [games, setGames] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  // new-game form
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    setError(null);
    try {
      const [{ data: teamData, error: teamError }, { data: gameData, error: gameError }] =
        await Promise.all([
          supabase.from('teams').select('id, name, short_name, logo_url').order('name'),
          supabase
            .from('games')
            .select(
              `
              id,
              slug,
              game_date,
              home_score,
              away_score,
              status,
              home_team:home_team_id ( id, name, short_name, logo_url ),
              away_team:away_team_id ( id, name, short_name, logo_url )
            `
            )
            .order('game_date', { ascending: false }),
        ]);

      if (teamError) throw teamError;
      if (gameError) throw gameError;

      setTeams(teamData || []);
      setGames(gameData || []);
    } catch (err) {
      console.error(err);
      setError('Error loading games.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateGame(e) {
    e.preventDefault();
    setError(null);

    if (!newDate || !newTime || !homeTeamId || !awayTeamId) {
      setError('Please pick a date, time, and both teams.');
      return;
    }

    if (homeTeamId === awayTeamId) {
      setError('Home and away team must be different.');
      return;
    }

    setCreating(true);
    try {
      // IMPORTANT: keep the local date/time that the user selected.
      // We send the `YYYY-MM-DDTHH:mm` string directly to Postgres so that
      // it doesn’t get shifted by timezone conversions.
      const gameDateLocal = `${newDate}T${newTime}`;

      const { error: insertError } = await supabase.from('games').insert({
        game_date: gameDateLocal,
        home_team_id: Number(homeTeamId),
        away_team_id: Number(awayTeamId),
        home_score: 0,
        away_score: 0,
        status: 'scheduled',
      });

      if (insertError) throw insertError;

      // refresh list
      await fetchInitialData();

      // reset form
      setNewDate('');
      setNewTime('');
      setHomeTeamId('');
      setAwayTeamId('');
    } catch (err) {
      console.error(err);
      setError('Error creating game.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteGame(id) {
    if (!window.confirm('Delete this game?')) return;
    setError(null);
    try {
      const { error: deleteError } = await supabase.from('games').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setGames((g) => g.filter((game) => game.id !== id));
    } catch (err) {
      console.error(err);
      setError('Error deleting game.');
    }
  }

  return (
    <div className="page games-page">
      <h1 className="page-title">Games</h1>

      {/* CREATE GAME FORM (filters removed as requested) */}
      <form className="game-create-form" onSubmit={handleCreateGame}>
        <div className="game-create-row">
          <label>
            Date
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </label>

          <label>
            Time
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
            />
          </label>

          <label>
            Home team
            <select
              value={homeTeamId}
              onChange={(e) => setHomeTeamId(e.target.value)}
            >
              <option value="">Select…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Away team
            <select
              value={awayTeamId}
              onChange={(e) => setAwayTeamId(e.target.value)}
            >
              <option value="">Select…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>

      {error && <p className="error-message">{error}</p>}
      {loading && <p>Loading games…</p>}

      <div className="games-list">
        {games.map((game) => {
          const home = game.home_team;
          const away = game.away_team;

          return (
            <div key={game.id} className="game-card">
              {/* Left side: teams and logos */}
              <div className="game-card-main">
                <div className="game-teams">
                  {/* TEAM NAMES CLICKABLE – same idea as StandingsPage */}
                  <Link
                    to={`/teams/${home?.id}`}
                    className="team-link team-link-home"
                  >
                    {home?.logo_url && (
                      <img
                        src={home.logo_url}
                        alt={home.name}
                        className="team-logo"
                      />
                    )}
                    <span className="team-name">{home?.name}</span>
                  </Link>

                  <span className="at-separator">at</span>

                  <Link
                    to={`/teams/${away?.id}`}
                    className="team-link team-link-away"
                  >
                    {away?.logo_url && (
                      <img
                        src={away.logo_url}
                        alt={away.name}
                        className="team-logo"
                      />
                    )}
                    <span className="team-name">{away?.name}</span>
                  </Link>
                </div>

                {/* Score in the middle */}
                <div className="game-score">
                  <span className="score-number">{game.home_score}</span>
                  <span className="score-dash">—</span>
                  <span className="score-number">{game.away_score}</span>
                </div>

                {/* Date / status */}
                <div className="game-meta">
                  <div className="game-date">{formatGameDate(game.game_date)}</div>
                  <div className="game-status">{game.status}</div>
                </div>
              </div>

              {/* Right side: buttons */}
              <div className="game-actions">
                {/* LIVE – blue */}
                <Link
                  to={`/games/${game.slug}/live`}
                  className="game-btn game-btn-blue"
                >
                  Live
                </Link>

                <Link
                  to={`/games/${game.slug}/roster`}
                  className="game-btn"
                >
                  Roster
                </Link>

                {/* BOXSCORE – blue */}
                <Link
                  to={`/games/${game.slug}/boxscore`}
                  className="game-btn game-btn-blue"
                >
                  Boxscore
                </Link>

                <Link
                  to={`/games/${game.slug}`}
                  className="game-btn"
                >
                  Open
                </Link>

                <button
                  type="button"
                  className="game-btn game-btn-danger"
                  onClick={() => handleDeleteGame(game.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}

        {!loading && games.length === 0 && (
          <p>No games yet. Use the form above to create one.</p>
        )}
      </div>

      {/* Basic styles to keep spacing + blue buttons.
          You can move these into your CSS file if you prefer. */}
      <style jsx>{`
        .games-page {
          max-width: 900px;
          margin: 0 auto;
        }
        .page-title {
          margin-bottom: 1rem;
        }
        .game-create-form {
          margin-bottom: 1.5rem;
        }
        .game-create-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          align-items: flex-end;
        }
        .game-create-row label {
          display: flex;
          flex-direction: column;
          font-size: 0.9rem;
        }
        .games-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .game-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          border-radius: 0.5rem;
          background: #f8fafc;
        }
        .game-card-main {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .game-teams {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .team-link {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          text-decoration: none;
          color: #111827;
          max-width: 170px;
        }
        .team-link:hover .team-name {
          text-decoration: underline;
        }
        .team-logo {
          width: 24px;
          height: 24px;
          object-fit: contain;
        }
        .team-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .at-separator {
          margin: 0 0.25rem;
        }
        .game-score {
          display: flex;
          align-items: center;
          font-weight: 600;
          font-size: 1.2rem;
        }
        .score-number {
          min-width: 1.5rem;
          text-align: center;
        }
        .score-dash {
          margin: 0 0.25rem;
        }
        .game-meta {
          display: flex;
          flex-direction: column;
          font-size: 0.8rem;
          color: #4b5563;
        }
        .game-actions {
          display: flex;
          gap: 0.4rem;
          flex-wrap: wrap;
        }
        .game-btn {
          border: none;
          padding: 0.25rem 0.7rem;
          border-radius: 999px;
          font-size: 0.8rem;
          cursor: pointer;
          text-decoration: none;
          background: #e5e7eb;
          color: #111827;
        }
        .game-btn-blue {
          background: #2563eb;
          color: white;
        }
        .game-btn-blue:hover {
          background: #1d4ed8;
        }
        .game-btn-danger {
          background: #ef4444;
          color: white;
        }
        .game-btn-danger:hover {
          background: #dc2626;
        }
        .error-message {
          color: #b91c1c;
          margin-bottom: 1rem;
        }
        @media (max-width: 768px) {
          .game-card {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }
          .game-card-main {
            flex-wrap: wrap;
            gap: 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}
