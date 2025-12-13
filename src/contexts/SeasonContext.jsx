import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const SeasonContext = createContext(null);

export function SeasonProvider({ children }) {
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("seasons")
        .select("id, name, is_active, start_date")
        .order("start_date");

      if (!alive) return;

      if (error) {
        console.error("Failed to load seasons", error);
        setLoading(false);
        return;
      }

      setSeasons(data || []);

      // Prefer active season, fallback to first
      const active =
        data.find((s) => s.is_active) ||
        data[0] ||
        null;

      setSeasonId(active?.id ?? null);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <SeasonContext.Provider
      value={{ seasons, seasonId, setSeasonId, loading }}
    >
      {children}
    </SeasonContext.Provider>
  );
}

export function useSeason() {
  const ctx = useContext(SeasonContext);
  if (!ctx) {
    throw new Error("useSeason must be used inside SeasonProvider");
  }
  return ctx;
}
