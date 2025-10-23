-- 02_policies.sql
-- Enable RLS
alter table teams enable row level security;
alter table players enable row level security;
alter table games enable row level security;
alter table events enable row level security;
alter table game_stats enable row level security;

-- Simple policies: allow authenticated users full access (adjust for public if needed)
create policy "teams read" on teams for select to authenticated using (true);
create policy "teams write" on teams for insert to authenticated with check (true);
create policy "teams update" on teams for update to authenticated using (true) with check (true);
create policy "teams delete" on teams for delete to authenticated using (true);

create policy "players read" on players for select to authenticated using (true);
create policy "players write" on players for insert to authenticated with check (true);
create policy "players update" on players for update to authenticated using (true) with check (true);
create policy "players delete" on players for delete to authenticated using (true);

create policy "games read" on games for select to authenticated using (true);
create policy "games write" on games for insert to authenticated with check (true);
create policy "games update" on games for update to authenticated using (true) with check (true);
create policy "games delete" on games for delete to authenticated using (true);

create policy "events read" on events for select to authenticated using (true);
create policy "events write" on events for insert to authenticated with check (true);
create policy "events update" on events for update to authenticated using (true) with check (true);
create policy "events delete" on events for delete to authenticated using (true);

create policy "game_stats read" on game_stats for select to authenticated using (true);
create policy "game_stats write" on game_stats for insert to authenticated with check (true);
create policy "game_stats update" on game_stats for update to authenticated using (true) with check (true);
create policy "game_stats delete" on game_stats for delete to authenticated using (true);

-- Realtime
-- In Supabase dashboard: Database > Replication > Configure > add tables events, games for realtime
