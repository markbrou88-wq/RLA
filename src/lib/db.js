// src/lib/db.js
import { supabase } from "./supabaseClient";

// --------- READS ----------
export async function getGame(gameIdOrSlug) {
  const isId = /^\d+$/.test(String(gameIdOrSlug));
  const filter = isId ? { col: "id", val: gameIdOrSlug } : { col: "slug", val: gameIdOrSlug };

  const { data, error } = await supabase
    .from("games")
    .select(`
      id, slug, status, game_date,
      home_team_id, away_team_id, home_score, away_score, went_ot,
      home:home_team_id ( id, name, short_name, logo_url ),
      away:away_team_id ( id, name, short_name, logo_url ),
      events(*),
      game_goalies(*),
      game_rosters(*)
    `)
    .eq(filter.col, filter.val)
    .single();

  if (error) throw error;
  return data;
}

export async function getStandingsCurrent() {
  const { data, error } = await supabase.from("standings_current").select("*").order("pts", { ascending:false });
  if (error) throw error; return data;
}

export async function getLeadersCurrent() {
  const { data, error } = await supabase.from("player_stats_current").select("*").order("pts", { ascending:false });
  if (error) throw error; return data;
}

export async function getGoalieLeadersCurrent() {
  const { data, error } = await supabase.from("goalie_stats_current").select("*").order("sv_pct", { ascending:false });
  if (error) throw error; return data;
}

// --------- WRITES (mutations) ----------
export async function addEvent(evt) {
  // evt: { game_id, team_id, player_id, period, time_mmss, event }
  const { data, error } = await supabase.from("events").insert(evt).select().single();
  if (error) throw error;
  return data;
}

export async function deleteEvent(id) {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertGameGoalie(row) {
  // row: { id?, game_id, team_id, player_id, started, minutes_seconds, shots_against, goals_against, decision, shutout }
  const { data, error } = await supabase.from("game_goalies").upsert(row).select().single();
  if (error) throw error;
  return data;
}

export async function setScore(gameId, { home_score, away_score }) {
  const { error } = await supabase.from("games").update({ home_score, away_score }).eq("id", gameId);
  if (error) throw error;
}
