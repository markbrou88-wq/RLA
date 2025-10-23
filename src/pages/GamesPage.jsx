import React from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { supabase } from '../supabaseClient'

function GameRow({g, onDelete}){
  return (
    <tr>
      <td style={{padding:'8px'}}>{dayjs(g.game_date).format('YYYY-MM-DD')}</td>
      <td style={{padding:'8px'}}>{g.home_team?.name} vs {g.away_team?.name}</td>
      <td style={{padding:'8px'}}>{g.home_score}–{g.away_score}{g.went_ot ? ' (OT)' : ''}</td>
      <td style={{padding:'8px'}}>{g.status}</td>
      <td style={{padding:'8px'}}><Link to={`/games/${g.slug}`}>Open</Link></td>
      <td style={{padding:'8px'}}><button onClick={() => onDelete(g.id)}>Delete</button></td>
    </tr>
  )
}

export default function GamesPage(){
  const [games, setGames] = React.useState([])
  const [teams, setTeams] = React.useState([])
  const [form, setForm] = React.useState({date:'', home:null, away:null})
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    const [{ data: g, error: ge }, { data: t, error: te }] = await Promise.all([
      supabase.from('games').select('*, home_team:teams!games_home_team_id_fkey(id, name), away_team:teams!games_away_team_id_fkey(id, name)').order('game_date', { ascending:false }),
      supabase.from('teams').select('*').order('name', { ascending:true })
    ])
    if(ge) console.error(ge); else setGames(g || [])
    if(te) console.error(te); else setTeams(t || [])
    setLoading(false)
  }, [])

  React.useEffect(() => { load() }, [load])

  const createGame = async (e) => {
    e.preventDefault()
    if(!form.home || !form.away || !form.date) return
    const slug = `${dayjs(form.date).format('YYYYMMDD')}-${form.home}-${form.away}`
    const { error } = await supabase.from('games').insert({
      game_date: form.date,
      home_team_id: form.home,
      away_team_id: form.away,
      home_score: 0, away_score: 0,
      went_ot: false, status: 'scheduled',
      slug
    })
    if(error) alert(error.message)
    else { setForm({date:'', home:null, away:null}); load() }
  }

  const deleteGame = async (id) => {
    if(!confirm('Delete this game?')) return
    const { error } = await supabase.from('games').delete().eq('id', id)
    if(error) alert(error.message); else load()
  }

  return (
    <div>
      <h2>Games</h2>
      <form onSubmit={createGame} style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr auto', gap:8, marginBottom:16}}>
        <input type='date' value={form.date} onChange={e=>setForm(p=>({...p, date:e.target.value}))} />
        <select value={form.home || ''} onChange={e=>setForm(p=>({...p, home: Number(e.target.value)}))}>
          <option value=''>Home team…</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={form.away || ''} onChange={e=>setForm(p=>({...p, away: Number(e.target.value)}))}>
          <option value=''>Away team…</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button type='submit'>Create</button>
      </form>

      {loading ? <p>Loading…</p> : (
        <div style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse', width:'100%'}}>
            <thead>
              <tr>
                {['Date','Matchup','Score','Status','',''].map(h => <th key={h} style={{textAlign:'left', borderBottom:'1px solid #ddd', padding:'8px'}}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {games.map(g => <GameRow key={g.id} g={g} onDelete={deleteGame}/>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
