import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSeason } from '../context/SeasonContext';

export default function SeasonSwitcher() {
  const { seasons, season, setSeason } = useSeason();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleChange = (e) => {
    const next = seasons.find(s => s.id === Number(e.target.value));
    if (!next) return;
    setSeason(next);
    // keep the rest of the route; only replace the season prefix
    const parts = pathname.split('/').filter(Boolean);
    // routes look like /:seasonSlug/standings etc
    if (parts.length > 0) {
      parts[0] = next.slug;
      navigate('/' + parts.join('/'));
    } else {
      navigate('/' + next.slug + '/standings');
    }
  };

  if (!season) return null;

  return (
    <select
      value={season?.id || ''}
      onChange={handleChange}
      className="season-switcher"
      aria-label="Season"
    >
      {seasons.map(s => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}
