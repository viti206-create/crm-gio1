"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useUserRole() {
  const [role, setRole] = useState<string | null>(null);
  const [loadingUserRole, setLoadingUserRole] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoadingUserRole(true);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (userErr || !user) {
        setRole(null);
        setLoadingUserRole(false);
        return;
      }

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!mounted) return;

      if (profileErr) {
        console.error("profile role error:", profileErr);
        setRole(null);
        setLoadingUserRole(false);
        return;
      }

      setRole(profile?.role ?? null);
      setLoadingUserRole(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  return { role, loadingUserRole };
}