import React from 'react'
import { Link, Routes, Route, NavLink } from 'react-router-dom'
import StandingsPage from './pages/StandingsPage.jsx'
import GamesPage from './pages/GamesPage.jsx'
import GameDetailPage from './pages/GameDetailPage.jsx'

const Nav = () => (
  <nav style={{display:'flex',gap:12,padding:'12px 16px',borderBottom:'1px solid #eee'}}>
    <NavLink to='/' end>Standings</NavLink>
    <NavLink to='/games'>Games</NavLink>
  </nav>
)

export default function App(){
  return (
    <div style={{fontFamily:'Inter, system-ui, Arial', maxWidth:1100, margin:'0 auto'}}>
      <header style={{padding:'16px 16px 0'}}>
        <h1 style={{margin:0}}>Hockey League</h1>
        <p style={{margin:'4px 0 0', color:'#666'}}>Standings • Games • Live boxscore</p>
      </header>
      <Nav />
      <main style={{padding:16}}>
        <Routes>
          <Route path='/' element={<StandingsPage/>} />
          <Route path='/games' element={<GamesPage/>} />
          <Route path='/games/:slug' element={<GameDetailPage/>} />
        </Routes>
      </main>
      <footer style={{padding:16, color:'#777', fontSize:12}}>
        Built with React + Supabase • Realtime edits for boxscores
      </footer>
    </div>
  )
}
