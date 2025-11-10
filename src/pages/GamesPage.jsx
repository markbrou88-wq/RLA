import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

// ✅ Be resilient to your project’s supabase export
//   (keep only the one you actually use if you prefer)
import supabaseDefault from "../supabaseClient";
import { supabase as supabaseNamed } from "../supabaseClient";
const supabase = supabaseDefault || supabaseNamed;

/**
 * Utilities
 */
const fmtTime = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const toDateInput = (d) => {
  // for <input type="date">
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const toDatetimeLocal = (d) => {
  // for <input type="datetime-local">
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

const button = "px-3 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700";
const buttonGray =
  "px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-900";
const pill = "inline-flex items-center rounded-full font-semibold";

export default function GamesPage() {
  const navigate = useNavigate();
  const { seasonSlug } = useParams(); // if your routes have /s/:seasonSlug/games
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- Seasons state
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState(null); // selected season id

  // ---- Teams (for creation + filter)
  const [teams, setTeams] = useState([]);

  // ---- Filters
  const [filterDate, setFilterDate] = useState(searchParams.get("date") || "");
  const [filterTeam, setFilterTeam] = useState(searchParams.get("team") || "");

  // ---- Games
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState([]);

  // ---- Creation form
  const [createDateTime, setCreateDateTime] = useState(
    toDatetimeLocal(new Date())
  );
  const [createHomeTeam, setCreateHomeTeam] = useState("");
  const [createAwayTeam, setCreateAwayTeam] = useState("");
  const [creating, setCreating] = useState(false);

  // Keep last chosen season in localStorage for convenience
  const LOCAL_KEY = "rla_selected_season_id";

  // -------- Fetch seasons
  useEffect(() => {
    let ignore = false;
    (async () => {
      const { data, error } = await supabase
        .from("seasons")
        .select("id, slug, name, start_date, end_date, is_active")
        .order("start_date", { ascending: false });

      if (error) {
        console.error("load seasons", error);
        return;
      }
      if (ignore) return;

      setSeasons(data || []);

      // Season selection priority:
      // 1) URL slug
      // 2) localStorage
      // 3) first active
      // 4) first in list
      let nextId = null;

      if (seasonSlug) {
        const s = (data || []).find((x) => x.slug === seasonSlug);
        if (s) nextId = s.id;
      }
      if (!nextId) {
        const persisted = localStorage.getItem(LOCAL_KEY);
        if (persisted) {
          const s = (data || []).find((x) => String(x.id) === String(persisted));
          if (s) nextId = s.id;
        }
      }
      if (!nextId) {
        const active = (data || []).find((x) => x.is_active);
        if (active) nextId = active.id;
      }
      if (!nextId && data?.length) nextId = data[0].id;

      setSeasonId(nextId);
      if (nextId) localStorage.setItem(LOCAL_KEY, String(nextId));
    })();

    return () => (ignore = true);
  }, [seasonSlug]);

  // -------- Fetch teams (global list; if you added season_id to teams, add .eq('season_id', seasonId))
  useEffect(() => {
    let ignore = false;
    (async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, short_name, logo_url")
        .order("name");

      if (error) {
        console.error("load teams", error);
        return;
      }
      if (!ignore) setTeams(data || []);
    })();
    return () => (ignore = true);
  }, []);

  // -------- Fetch games (with filters)
  useEffect(() => {
    if (!seasonId) return;
    setLoading(true);

    const doLoad = async () => {
      let q = supabase
        .from("games")
        .select(
          `
          id, slug, status, went_ot, game_date, home_score, away_score,
          season_id,
          home_team:home_team_id(id, name, short_name, logo_url),
          away_team:away_team_id(id, name, short_name, logo_url)
        `
        )
        .eq("season_id", seasonId)
        .order("game_date", { ascending: false });

      if (filterDate) {
        try {
          // date-only filter (match the day)
          const d0 = new Date(filterDate);
          const d1 = new Date(filterDate);
          d1.setDate(d1.getDate() + 1);
          q = q.gte("game_date", d0.toISOString()).lt("game_date", d1.toISOString());
        } catch (e) {
          console.warn("Bad date filter", filterDate);
        }
      }
      if (filterTeam) {
        // filter on either side
        q = q.or(
          `home_team_id.eq.${filterTeam},away_team_id.eq.${filterTeam}`
        );
      }

      const { data, error } = await q;

      if (error) {
        console.error("load games", error);
        setGames([]);
      } else {
        setGames(data || []);
      }
      setLoading(false);
    };

    doLoad();
  }, [seasonId, filterDate, filterTeam]);

  // keep URL query in sync (so refresh preserves filters)
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (filterDate) next.set("date", filterDate);
    else next.delete("date");
    if (filterTeam) next.set("team", filterTeam);
    else next.delete("team");
    setSearchParams(next, { replace: true });
  }, [filterDate, filterTeam]);

  const onChangeSeason = (id) => {
    setSeasonId(id ? Number(id) : null);
    if (id) localStorage.setItem(LOCAL_KEY, String(id));

    // If you’re using seasonized routes like /s/:slug/games,
    // you can navigate to the slug to keep the URL clean:
    const found = seasons.find((s) => String(s.id) === String(id));
    if (found?.slug) {
      navigate(`/s/${found.slug}/games`, { replace: true });
    }
  };

  const createGame = async (e) => {
    e.preventDefault();
    if (!seasonId || !createHomeTeam || !createAwayTeam || !createDateTime) return;
    if (createHomeTeam === createAwayTeam) {
      alert("Home and Away teams must be different.");
      return;
    }
    setCreating(true);

    const payload = {
      season_id: seasonId,
      game_date: new Date(createDateTime).toISOString(),
      home_team_id: Number(createHomeTeam),
      away_team_id: Number(createAwayTeam),
      status: "scheduled",
      went_ot: false,
      home_score: 0,
      away_score: 0,
    };

    const { data, error } = await supabase.from("games").insert(payload).select();

    setCreating(false);
    if (error) {
      console.error("create game", error);
      alert("Could not create game.");
      return;
    }
    // refresh
    setGames((prev) => [data[0], ...prev]);
  };

  const markFinal = async (game) => {
    // You probably already set scores via LivePage; here we just flip status to final.
    const { error } = await supabase
      .from("games")
      .update({ status: "final" })
      .eq("id", game.id);

    if (error) {
      console.error("mark final", error);
      alert("Could not mark as final.");
      return;
    }
    setGames((prev) =>
      prev.map((g) => (g.id === game.id ? { ...g, status: "final" } : g))
    );
  };

  const del = async (game) => {
    if (!window.confirm("Delete this game?")) return;
    const { error } = await supabase.from("games").delete().eq("id", game.id);
    if (error) {
      console.error("delete game", error);
      alert("Could not delete game.");
      return;
    }
    setGames((prev) => prev.filter((g) => g.id !== game.id));
  };

  const teamName = (t) => t?.short_name || t?.name || "—";
  const teamLogo = (t) =>
    t?.logo_url ? (
      <img
        src={t.logo_url}
        alt={teamName(t)}
        className="inline-block h-5 w-8 object-contain"
      />
    ) : (
      <span className="inline-block w-8" />
    );

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* ---- Header controls ---- */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Seasons dropdown */}
          <div>
            <label className="block text-sm font-medium mb-1">Season</label>
            <select
              className="rounded-md border border-gray-300 p-2 min-w-[220px]"
              value={seasonId ?? ""}
              onChange={(e) => onChangeSeason(e.target.value)}
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.is_active ? " • active" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Filters */}
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input
              type="date"
              className="rounded-md border border-gray-300 p-2"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Team</label>
            <select
              className="rounded-md border border-gray-300 p-2 min-w-[220px]"
              value={filterTeam}
              onChange={(e) => setFilterTeam(e.target.value)}
            >
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-6">
            <button
              className={buttonGray}
              onClick={() => {
                setFilterDate("");
                setFilterTeam("");
              }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Create form */}
        <form
          className="grid grid-cols-1 sm:grid-cols-4 gap-3"
          onSubmit={createGame}
        >
          <div>
            <label className="block text-sm font-medium mb-1">
              Start (local)
            </label>
            <input
              type="datetime-local"
              className="rounded-md border border-gray-300 p-2 w-full"
              value={createDateTime}
              onChange={(e) => setCreateDateTime(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Home team</label>
            <select
              className="rounded-md border border-gray-300 p-2 w-full"
              value={createHomeTeam}
              onChange={(e) => setCreateHomeTeam(e.target.value)}
              required
            >
              <option value="">—</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Away team</label>
            <select
              className="rounded-md border border-gray-300 p-2 w-full"
              value={createAwayTeam}
              onChange={(e) => setCreateAwayTeam(e.target.value)}
              required
            >
              <option value="">—</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button className={button} disabled={creating || !seasonId}>
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>

      {/* ---- Games list ---- */}
      <div className="space-y-3">
        {loading && <div>Loading games…</div>}
        {!loading && games.length === 0 && (
          <div className="text-gray-500">No games found.</div>
        )}

        {!loading &&
          games.map((g) => {
            const home = g.home_team;
            const away = g.away_team;
            const isFinal = g.status === "final";
            const score = `${g.home_score} — ${g.away_score}`;

            return (
              <div
                key={g.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-gray-200 p-3"
              >
                {/* Teams & score */}
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <span className="inline-flex items-center gap-2">
                    {teamLogo(away)}
                    <span>{teamName(away)}</span>
                    <span className="text-sm font-normal text-gray-500 mx-2">
                      at
                    </span>
                    {teamLogo(home)}
                    <span>{teamName(home)}</span>
                  </span>

                  <span className="ml-4">{score}</span>

                  <div className="ml-3">
                    <span
                      className={`${pill} px-2 py-0.5 ${
                        isFinal
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {isFinal ? "final" : "scheduled"}
                    </span>
                  </div>
                </div>

                {/* Right side: time + actions */}
                <div className="flex items-center gap-2">
                  <div className="text-sm text-gray-600 mr-2">
                    {fmtTime(g.game_date)}
                  </div>

                  {/* Keep all the actions you already use */}
                  <button
                    className={buttonGray}
                    onClick={() =>
                      (window.location.href = g.slug
                        ? `/live/${g.slug}`
                        : `/live/${g.id}`)
                    }
                  >
                    Live
                  </button>
                  <button
                    className={buttonGray}
                    onClick={() =>
                      (window.location.href = g.slug
                        ? `/roster/${g.slug}`
                        : `/roster/${g.id}`)
                    }
                  >
                    Roster
                  </button>
                  <button
                    className={buttonGray}
                    onClick={() =>
                      (window.location.href = g.slug
                        ? `/boxscore/${g.slug}`
                        : `/boxscore/${g.id}`)
                    }
                  >
                    Boxscore
                  </button>
                  <button
                    className={buttonGray}
                    onClick={() =>
                      (window.location.href = g.slug
                        ? `/open/${g.slug}`
                        : `/open/${g.id}`)
                    }
                  >
                    Open
                  </button>
                  {!isFinal ? (
                    <button className={button} onClick={() => markFinal(g)}>
                      Mark as Final
                    </button>
                  ) : null}
                  <button
                    className="px-3 py-2 rounded-md bg-rose-600 text-white hover:bg-rose-700"
                    onClick={() => del(g)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
