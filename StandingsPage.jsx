import React from 'react'
import { supabase } from '../supabaseClient'

export default function StandingsPage(){
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const load = React.useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('standings_current').select('*').order('pts', { ascending:false })
    if(error){ console.error(error) } else { setRows(data || []) }
    setLoading(false)
  }, [])
  React.useEffect(() => { load() }, [load])

  return (
    <div>
      <h2>Standings</h2>
      {loading ? <p>Loading…</p> : (
        <div style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse', width:'100%'}}>
            <thead>
              <tr>
                {['Team','GP','W','L','OTL','PTS','GF','GA','DIFF'].map(h => (
                  <th key={h} style={{textAlign:'left', borderBottom:'1px solid #ddd', padding:'8px'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.team_id}>
                  <td style={{padding:'8px'}}>{r.name}</td>
                  <td style={{padding:'8px'}}>{r.gp}</td>
                  <td style={{padding:'8px'}}>{r.w}</td>
                  <td style={{padding:'8px'}}>{r.l}</td>
                  <td style={{padding:'8px'}}>{r.otl}</td>
                  <td style={{padding:'8px', fontWeight:600}}>{r.pts}</td>
                  <td style={{padding:'8px'}}>{r.gf}</td>
                  <td style={{padding:'8px'}}>{r.ga}</td>
                  <td style={{padding:'8px'}}>{r.diff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button onClick={load} style={{marginTop:12}}>Refresh</button>
    </div>
  )
}
