import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useSeason } from "./SeasonContext";

/**
 * Categories are season-scoped (ex: for a given season you might have M11 only,
 * and next season you might have M11/M13/M15).
 *
 * Expected table: public.categories(id, season_id, code, name, sort_order, is_active)
 */
const CategoryContext = createContext(null);

export function CategoryProvider({ children }) {
  const { seasonId } = useSeason();

  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(null);
  const [loading, setLoading] = useState(true);

  // When the season changes, reload categories and pick a sensible default
  useEffect(() => {
    if (!seasonId) {
      setCategories([]);
      setCategoryId(null);
      setLoading(false);
      return;
    }

    let alive = true;

    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("categories")
        .select("id, season_id, code, name, sort_order, is_active")
        .eq("season_id", seasonId)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });

      if (!alive) return;

      if (error) {
        console.error("Failed to load categories", error);
        setCategories([]);
        setCategoryId(null);
        setLoading(false);
        return;
      }

      const rows = data || [];
      setCategories(rows);

      // Prefer an active category, else first row
      const active = rows.find((c) => c.is_active) || rows[0] || null;
      setCategoryId(active?.id ?? null);

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [seasonId]);

  const value = useMemo(
    () => ({ categories, categoryId, setCategoryId, loading }),
    [categories, categoryId, loading]
  );

  return <CategoryContext.Provider value={value}>{children}</CategoryContext.Provider>;
}

export function useCategory() {
  const ctx = useContext(CategoryContext);
  if (!ctx) throw new Error("useCategory must be used inside CategoryProvider");
  return ctx;
}
