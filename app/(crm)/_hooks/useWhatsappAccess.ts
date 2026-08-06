"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useWhatsappAccess() {
  const [loadingWhatsappAccess, setLoadingWhatsappAccess] = useState(true);
  const [hasWhatsappAccess, setHasWhatsappAccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoadingWhatsappAccess(true);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (userErr || !user) {
        setHasWhatsappAccess(false);
        setLoadingWhatsappAccess(false);
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
        setHasWhatsappAccess(false);
        setLoadingWhatsappAccess(false);
        return;
      }

      const role = profile?.role ?? "";
      // Todos os niveis (admin, agent, whatsapp) tem acesso ao WhatsApp
      setHasWhatsappAccess(
        role === "admin" || role === "agent" || role === "whatsapp"
      );
      setLoadingWhatsappAccess(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  return { hasWhatsappAccess, loadingWhatsappAccess };
}