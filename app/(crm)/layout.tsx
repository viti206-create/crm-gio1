"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import CrmShell from "./CrmShell";
import InactivityLogout from "./_components/InactivityLogout";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session) {
        router.replace("/login");
        return;
      }

      setCheckingAuth(false);
    }

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      if (!session && pathname !== "/login") {
        router.replace("/login");
        return;
      }

      if (session) {
        setCheckingAuth(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, pathname]);

  if (checkingAuth) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background:
            "radial-gradient(1000px 600px at 20% 10%, rgba(180,120,255,0.18), transparent 60%), linear-gradient(180deg, #09070c 0%, #050408 100%)",
          color: "white",
        }}
      >
        Carregando...
      </div>
    );
  }

  return (
  <>
    <InactivityLogout />
    <CrmShell>{children}</CrmShell>
  </>
);
}