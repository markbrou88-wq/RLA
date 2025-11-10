import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'

// --- Synchronous theme boot (runs before React mounts) ---
(() => {
  const getStored = () => {
    try { return localStorage.getItem('theme'); } catch { return null; }
  };
  const setStored = (v) => { try { localStorage.setItem('theme', v); } catch {} };
  const prefersDark = () => {
    try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }
    catch { return false; }
  };

  let theme = getStored();
  if (theme !== 'dark' && theme !== 'light') {
    theme = prefersDark() ? 'dark' : 'light';
    setStored(theme);
  }

  const html = document.documentElement;
  html.setAttribute('data-theme', theme);           // for [data-theme="dark"] CSS
  html.classList.toggle('dark', theme === 'dark');  // for .dark { ... } CSS

  // Make form controls & UA widgets match the theme
  let meta = document.querySelector('meta[name="color-scheme"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'color-scheme');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', theme === 'dark' ? 'dark light' : 'light dark');
})();
// --- end theme boot ---

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
