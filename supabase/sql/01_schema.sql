-- 01_schema.sql
create table if not exists teams (
  id bigserial primary key,
  name text not null unique,
  short_name text,
  logo_url text
);

create table if not exists players (
  id bigserial primary key,
  team_id bigint references teams(id) on delete set null,
  number int,
  name text not null,
  position text
);

create table if not exists games (
  id bigserial primary key,
  game_date date not null,
  home_team_id bigint references teams(id) on delete set null,
  away_team_id bigint references teams(id) on delete set null,
  home_score int not null default 0,
  away_score int not null default 0,
  went_ot boolean not null default false,
  status text not null default 'scheduled',
  slug text unique
);

create table if not exists events (
  id bigserial primary key,
  game_id bigint not null references games(id) on delete cascade,
  player_id bigint references players(id) on delete set null,
  team_id bigint references teams(id) on delete set null,
  period int not null default 1,
  time_mmss text not null default '10:00',
  event text not null check (event in ('goal','assist','penalty','shot','save')),
  created_at timestamptz not null default now()
);

create table if not exists game_stats (
  id bigserial primary key,
  game_id bigint not null references games(id) on delete cascade,
  team_id bigint references teams(id) on delete set null,
  player_id bigint references players(id) on delete set null,
  goals int not null default 0,
  assists int not null default 0,
  plus_minus int not null default 0,
  pims int not null default 0,
  is_goalie boolean not null default false,
  goalie_shots_against int not null default 0
);

-- Standings view (simple example: 2 pts per win, 1 for OT loss)
create or replace view standings_current as
with results as (
  select
    g.id as game_id,
    g.home_team_id, g.away_team_id,
    g.home_score, g.away_score,
    (g.home_score > g.away_score) as home_win,
    (g.away_score > g.home_score) as away_win,
    g.went_ot
  from games g
  where g.status in ('final','final_ot')
)
select
  t.id as team_id,
  t.name,
  count(*) filter (where r.home_team_id = t.id or r.away_team_id = t.id) as gp,
  count(*) filter (where (r.home_team_id = t.id and r.home_win) or (r.away_team_id = t.id and r.away_win)) as w,
  count(*) filter (where (r.home_team_id = t.id and not r.home_win and not r.went_ot)
                    or (r.away_team_id = t.id and not r.away_win and not r.went_ot)) as l,
  count(*) filter (where (r.home_team_id = t.id and not r.home_win and r.went_ot)
                    or (r.away_team_id = t.id and not r.away_win and r.went_ot)) as otl,
  sum(case
        when (r.home_team_id = t.id and r.home_win) or (r.away_team_id = t.id and r.away_win) then 2
        when ((r.home_team_id = t.id and not r.home_win and r.went_ot) or (r.away_team_id = t.id and not r.away_win and r.went_ot)) then 1
        else 0 end) as pts,
  sum(case when r.home_team_id = t.id then r.home_score when r.away_team_id = t.id then r.away_score else 0 end) as gf,
  sum(case when r.home_team_id = t.id then r.away_score when r.away_team_id = t.id then r.home_score else 0 end) as ga,
  (sum(case when r.home_team_id = t.id then r.home_score when r.away_team_id = t.id then r.away_score else 0 end)
   - sum(case when r.home_team_id = t.id then r.away_score when r.away_team_id = t.id then r.home_score else 0 end)) as diff
from teams t
left join results r on r.home_team_id = t.id or r.away_team_id = t.id
group by t.id, t.name
order by pts desc, diff desc, gf desc;
