# Hockey League Starter (React + Supabase)

A ready-to-run starter for a hockey league website with:
- Standings (via `standings_current` view)
- Games listing (create/delete from frontend)
- Game summary page with live-editable score and realtime event feed (boxscore building blocks)

## Quick start

1) **Create a Supabase project**, then in SQL Editor run the files in this order:
   - `supabase/sql/01_schema.sql`
   - `supabase/sql/02_policies.sql`
   - `supabase/sql/03_seed.sql`

   In Database → Replication → Configure, add `events` and `games` tables to Realtime.

2) **Auth**: In Project Settings → Auth, enable Email magic link (or any provider). Users must be authenticated to edit.

3) **Clone & run**
```bash
npm i
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

4) **Routes**
- `/` Standings (reads the `standings_current` view)
- `/games` List + Create/Delete games
- `/games/:slug` Game page with live score inputs and event add/delete

> This is intentionally minimal, so you can style and extend (penalties, shots, goalie stats, etc.).

## Notes

- All core tables match a common hockey schema (teams, players, games, events, game_stats).
- RLS policies grant full access to authenticated users. Tighten as needed (e.g., role = 'admin').
- The boxscore here uses `events` as the source of truth; compute summaries in SQL or client as you expand.
