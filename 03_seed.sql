-- 03_seed.sql
insert into teams (name, short_name) values
  ('Hawks Mirabel','HAW'),
  ('Flying Kings','FKG'),
  ('Redlite Academy','RLA')
on conflict do nothing;

insert into players (team_id, number, name, position)
select id, 9, 'Alexis', 'F' from teams where name='Hawks Mirabel'
union all
select id, 30, 'Goalie A', 'G' from teams where name='Hawks Mirabel'
union all
select id, 19, 'Player B', 'F' from teams where name='Flying Kings'
union all
select id, 1, 'Goalie B', 'G' from teams where name='Flying Kings';
