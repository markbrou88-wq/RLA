import React from 'react'
import { useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { supabase } from '../supabaseClient'

export default function GameDetailPage(){
  const { slug } = useParams()
  const [game, setGame] = React.useState(null)
  const [events, setEvents] = React.useState([])
  const [players, setPlayers] = React.useState([])
  const [teams, setTeams] = React.useState([])
  const [form, setForm] = React.useState({ player_id:'', team_id:'', period:1, time_mmss:'10:00', event:'goal' })

  const load = React.useCallback(async () => {
    const { data: g, error: ge } = await supabase.from('games')
      .select('*, home_team:teams!games_home_team_id_fkey(id, name), away_team:teams!games_away_team_id_fkey(id, name)')
      .eq('slug', slug).single()
    if(ge){ console.error(ge); return }
    setGame(g)

    const [{ data: ev }, { data: t }, { data: pl }] = await Promise.all([
      supabase.from('events').select('*').eq('game_id', g.id).order('created_at', { ascending:true }),
      supabase.from('teams').select('*'),
      supabase.from('players').select('*').or(`team_id.eq.${g.home_team_id},team_id.eq.${g.away_team_id}`)
    ])
    setEvents(ev || [])
    setTeams(t || [])
    setPlayers(pl || [])
  }, [slug])

  React.useEffect(() => { load() }, [load])

  // Realtime subscription to events & game score
  React.useEffect(() => {
    const ch = supabase.channel('game-' + slug)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, payload => {
        setEvents(prev => {
          if(payload.eventType === 'INSERT'){ return [...prev, payload.new] }
          if(payload.eventType === 'DELETE'){ return prev.filter(e => e.id !== payload.old.id) }
          if(payload.eventType === 'UPDATE'){ return prev.map(e => e.id===payload.new.id ? payload.new : e) }
          return prev
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, payload => {
        if(payload.eventType === 'UPDATE'){ setGame(g => ({...g, ...payload.new})) }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [slug])

  const addEvent = async (e) => {
    e.preventDefault()
    if(!game) return
    const { error } = await supabase.from('events').insert({
      game_id: game.id,
      player_id: form.player_id || null,
      team_id: form.team_id || null,
      period: Number(form.period),
      time_mmss: form.time_mmss,
      event: form.event
    })
    if(error) alert(error.message)
  }

  const deleteEvent = async (id) => {
    const { error } = await supabase.from('events').delete().eq('id', id)
    if(error) alert(error.message)
  }

  const setScore = async (home, away) => {
    const { error } = await supabase.from('games').update({
      home_score: home, away_score: away
    }).eq('id', game.id)
    if(error) alert(error.message)
  }

  if(!game) return <p>Loading…</p>

  return (
    <div>
      <h2>{dayjs(game.game_date).format('YYYY-MM-DD')} • {game.home_team?.name} vs {game.away_team?.name}</h2>
      <p style={{fontSize:22, fontWeight:700}}>
        Score: 
        <input type='number' value={game.home_score} onChange={e=>setScore(Number(e.target.value), game.away_score)} style={{width:60, margin:'0 8px'}}/>
        –
        <input type='number' value={game.away_score} onChange={e=>setScore(game.home_score, Number(e.target.value))} style={{width:60, margin:'0 8px'}}/>
        {game.went_ot ? ' (OT)' : ''}
      </p>

      <section style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
        <div>
          <h3>Add Event</h3>
          <form onSubmit={addEvent} style={{display:'grid', gap:8}}>
            <label>Team
              <select value={form.team_id} onChange={e=>setForm(p=>({...p, team_id: e.target.value}))}>
                <option value=''>Select team…</option>
                <option value={game.home_team_id}>{game.home_team?.name}</option>
                <option value={game.away_team_id}>{game.away_team?.name}</option>
              </select>
            </label>
            <label>Player (optional)
              <select value={form.player_id} onChange={e=>setForm(p=>({...p, player_id: e.target.value}))}>
                <option value=''>—</option>
                {players.map(pl => <option key={pl.id} value={pl.id}>{pl.name} #{pl.number}</option>)}
              </select>
            </label>
            <label>Period
              <input type='number' min='1' max='5' value={form.period} onChange={e=>setForm(p=>({...p, period: e.target.value}))} />
            </label>
            <label>Time (MM:SS)
              <input type='text' value={form.time_mmss} onChange={e=>setForm(p=>({...p, time_mmss: e.target.value}))} />
            </label>
            <label>Event
              <select value={form.event} onChange={e=>setForm(p=>({...p, event:e.target.value}))}>
                <option value='goal'>goal</option>
                <option value='assist'>assist</option>
                <option value='penalty'>penalty</option>
                <option value='shot'>shot</option>
                <option value='save'>save</option>
              </select>
            </label>
            <button type='submit'>Add</button>
          </form>
        </div>

        <div>
          <h3>Events</h3>
          <ul style={{listStyle:'none', padding:0}}>
            {events.map(ev => (
              <li key={ev.id} style={{display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px dashed #eee'}}>
                <span>P{ev.period} {ev.time_mmss} • {ev.event} • Player #{ev.player_id || '—'}</span>
                <button onClick={() => deleteEvent(ev.id)}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
