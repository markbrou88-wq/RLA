import React, {createContext, useContext, useEffect, useState} from 'react';
import { supabase } from './supabaseClient'; // or your path

const SeasonContext = createContext();

export function SeasonProvider({ children, initialSlug = null }) {
  const [seasons, setSeasons] = useState([]);
  const [season, setSeason] = useState(null); // {id, name, slug}

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from('seasons')
        .select('id,name,slug,is_active')
        .order('start_date', { ascending: false });
      if (!mounted) return;
      if (!error && data) {
        setSeasons(data);
        const picked =
          (initialSlug && data.find(s => s.slug === initialSlug)) ||
          data.find(s => s.is_active) ||
          data[0] || null;
        setSeason(picked);
      }
    })();
    return () => (mounted = false);
  }, [initialSlug]);

  return (
    <SeasonContext.Provider value={{ seasons, season, setSeason }}>
      {children}
    </SeasonContext.Provider>
  );
}

export function useSeason() {
  return useContext(SeasonContext);
}
