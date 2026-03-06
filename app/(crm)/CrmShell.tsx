"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAdminAccess } from "./_hooks/useAdminAccess";

type ProfileRow = {
  id: string;
  name: string | null;
  role?: string | null;
};

export default function CrmShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      setLoadingProfile(true);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (userErr || !user) {
        setProfile(null);
        setLoadingProfile(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id,name,role")
        .eq("id", user.id)
        .single();

      if (!mounted) return;

      if (error) {
        console.error("profile load error:", error);
        setProfile({
          id: user.id,
          name: user.email ?? "Usuário",
          role: null,
        });
        setLoadingProfile(false);
        return;
      }

      setProfile(data as any);
      setLoadingProfile(false);
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("logout error:", error);
      setLoggingOut(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  const displayName = useMemo(() => {
    const raw = (profile?.name ?? "").trim();
    if (raw) return raw;
    return "Usuário";
  }, [profile]);

  const roleLabel = useMemo(() => {
    if (loadingRole) return "Carregando...";
    return isAdmin ? "Admin" : "Usuário";
  }, [loadingRole, isAdmin]);

  const header: React.CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 18px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    background:
      "radial-gradient(1200px 600px at 30% 0%, rgba(140,80,255,0.25) 0%, rgba(10,10,16,0.92) 55%, rgba(10,10,16,0.98) 100%)",
  };

  const left: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    minWidth: 260,
  };

  const right: React.CSSProperties = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
  };

  const btnBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 14px",
    borderRadius: 14,
    fontWeight: 900,
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    whiteSpace: "nowrap",
  };

  const btnActive: React.CSSProperties = {
    ...btnBase,
    border: "1px solid rgba(180,120,255,0.35)",
    background:
      "linear-gradient(180deg, rgba(180,120,255,0.22) 0%, rgba(180,120,255,0.10) 100%)",
  };

  const userCard: React.CSSProperties = {
    display: "grid",
    gap: 2,
    padding: "8px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    minWidth: 180,
  };

  const logoutBtn: React.CSSProperties = {
    ...btnBase,
    cursor: loggingOut ? "not-allowed" : "pointer",
    opacity: loggingOut ? 0.65 : 1,
  };

  const isActive = (href: string) => {
    if (href === "/home") return pathname === "/home";
    if (href === "/dashboard") return pathname.startsWith("/dashboard");
    if (href === "/leads") return pathname.startsWith("/leads");
    if (href === "/vendas") return pathname.startsWith("/vendas");
    if (href === "/recorrencias") return pathname.startsWith("/recorrencias");
    if (href === "/relatorios") return pathname.startsWith("/relatorios");
    return false;
  };

  const NavBtn = ({ href, label }: { href: string; label: string }) => (
    <Link href={href} style={isActive(href) ? btnActive : btnBase}>
      {label}
    </Link>
  );

  return (
    <div>
      <div style={header}>
        <div style={left}>
          <img src="/logo-gio.png" alt="GIO" style={{ height: 80 }} />
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ fontWeight: 950, fontSize: 18, letterSpacing: 0.2 }}>
              CRM GIO
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Unidade • Boituva</div>
          </div>
        </div>
        
        <div
        style={{
          position: "absolute",
          top: 6,
          right: 18,
          fontSize: 12,
          opacity: 0.75,
          fontWeight: 700,
        }}
      >
        Logado por {displayName}
      </div>

        <div style={right}>
          <NavBtn href="/home" label="Home" />
          <NavBtn href="/dashboard" label="Kanban" />
          <NavBtn href="/leads" label="Contatos" />

          {!loadingRole && isAdmin ? (
            <>
              <NavBtn href="/vendas" label="Vendas" />
              <NavBtn href="/recorrencias" label="Recorrências" />
              <NavBtn href="/relatorios" label="Relatórios" />
            </>
          ) : null}
          
        <button type="button" onClick={handleLogout} style={logoutBtn}>
          Logout
        </button>
        </div>
      </div>

      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}