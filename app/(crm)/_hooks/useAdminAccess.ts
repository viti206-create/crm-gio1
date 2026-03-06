"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useAdminAccess() {
  const [loadingRole, setLoadingRole] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoadingRole(true);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (userErr || !user) {
        setIsAdmin(false);
        setLoadingRole(false);
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
        setIsAdmin(false);
        setLoadingRole(false);
        return;
      }

      setIsAdmin((profile?.role ?? "") === "admin");
      setLoadingRole(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  return { isAdmin, loadingRole };
}