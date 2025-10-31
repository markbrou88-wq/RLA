// src/lib/realtime.js
import { useEffect } from "react";
import { supabase } from "./supabaseClient";

// subscribe to one table with optional match filter
export function useRealtimeTable({ table, event = "*", match = {}, onChange }) {
  useEffect(() => {
    const channel = supabase
      .channel(`rt-${table}-${JSON.stringify(match)}`)
      .on(
        "postgres_changes",
        { event, schema: "public", table, ...Object.keys(match).length && { filter: Object.entries(match).map(([k,v])=>`${k}=eq.${v}`).join(",") } },
        payload => onChange?.(payload)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [table, event, JSON.stringify(match)]);
}
