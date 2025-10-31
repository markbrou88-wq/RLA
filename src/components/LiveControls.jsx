// src/components/LiveControls.jsx
import { optimistic } from "../lib/optimistic";
import { addEvent, setScore, upsertGameGoalie } from "../lib/db";

export default function LiveControls({ game, homeActiveGoalie, awayActiveGoalie, refresh }) {
  const { id: gameId, home_team_id, away_team_id, home_score, away_score } = game;

  async function addShot(side) {
    const targetGoalie = side === "home" ? awayActiveGoalie : homeActiveGoalie; // shot against opposite goalie
    if (!targetGoalie) return;
    const next = { ...targetGoalie, shots_against: (targetGoalie.shots_against ?? 0) + 1 };
    await optimistic(
      () => upsertGameGoalie(next),
      { apply: () => {}, rollback: () => {} }
    );
    refresh?.();
  }

  async function addGoal(side, scorer) {
    const isHome = side === "home";
    const targetGoalie = isHome ? awayActiveGoalie : homeActiveGoalie;
    const newScore = isHome ? { home_score: home_score + 1, away_score } : { home_score, away_score: away_score + 1 };

    // 1) event row
    await addEvent({
      game_id: gameId,
      team_id: isHome ? home_team_id : away_team_id,
      player_id: scorer?.id ?? null,
      period: 1,         // wire to your clock state
      time_mmss: "10:00",// wire to your clock state
      event: "goal"
    });

    // 2) update game score
    await setScore(gameId, newScore);

    // 3) goalie GA
    if (targetGoalie) {
      await upsertGameGoalie({ ...targetGoalie, goals_against: (targetGoalie.goals_against ?? 0) + 1 });
    }
    refresh?.();
  }

  return (
    <div className="flex gap-6 items-center">
      {/* Score bar (compact) */}
      <div className="flex items-center gap-3">
        <span>{game.home?.short_name ?? "HOME"}</span>
        <strong>{home_score}</strong>
        <span>-</span>
        <strong>{away_score}</strong>
        <span>{game.away?.short_name ?? "AWAY"}</span>
      </div>

      {/* Shots controls */}
      <div className="flex gap-4">
        <div className="flex items-center gap-2">
          <button onClick={() => addShot("home")}>-</button>
          <div className="border px-3 py-1">Shots vs AWAY G</div>
          <button onClick={() => addShot("home")}>+</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => addShot("away")}>-</button>
          <div className="border px-3 py-1">Shots vs HOME G</div>
          <button onClick={() => addShot("away")}>+</button>
        </div>
      </div>

      {/* Quick goal buttons (you’ll wire scorer pickers on click) */}
      <div className="flex gap-2">
        <button onClick={() => addGoal("home", null)}>+ Goal Home</button>
        <button onClick={() => addGoal("away", null)}>+ Goal Away</button>
      </div>
    </div>
  );
}
