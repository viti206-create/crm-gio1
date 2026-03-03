"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

export default function CrmShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const header: React.CSSProperties = {
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
  };

  const btnActive: React.CSSProperties = {
    ...btnBase,
    border: "1px solid rgba(180,120,255,0.35)",
    background:
      "linear-gradient(180deg, rgba(180,120,255,0.22) 0%, rgba(180,120,255,0.10) 100%)",
  };

  const isActive = (href: string) => {
    if (href === "/home") return pathname === "/home";
    if (href === "/dashboard") return pathname.startsWith("/dashboard");
    if (href === "/leads") return pathname.startsWith("/leads");
    if (href === "/recorrencias") return pathname.startsWith("/recorrencias");
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
          {/* Aqui fica seu logo atual (se você já tem um componente/IMG, mantenha). */}
          <img
            src="/logo-gio.png"
            alt="GIO"
            style={{ height: 80 }}
          />
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ fontWeight: 950, fontSize: 18, letterSpacing: 0.2 }}>
              CRM GIO
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Unidade • Boituva</div>
          </div>
        </div>

        <div style={right}>
          <NavBtn href="/home" label="Home" />
          <NavBtn href="/dashboard" label="Kanban" />
          <NavBtn href="/leads" label="Contatos" />
          <NavBtn href="/recorrencias" label="Recorrências" />
        </div>
      </div>

      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}