"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export default function CrmShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const headerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background:
      "linear-gradient(180deg, rgba(20,20,28,0.98) 0%, rgba(12,12,18,0.96) 100%)",
    backdropFilter: "blur(8px)",
  };

  const navBtn: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 12,
    textDecoration: "none",
    fontWeight: 800,
    fontSize: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "white",
  };

  const navBtnPrimary: React.CSSProperties = {
    ...navBtn,
    border: "1px solid rgba(180,120,255,0.35)",
    background:
      "linear-gradient(180deg, rgba(180,120,255,0.20) 0%, rgba(180,120,255,0.08) 100%)",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(120,0,255,0.20), transparent 50%), #0b0b10",
        color: "white",
      }}
    >
      <header style={headerStyle}>
        {/* LOGO + IDENTIDADE */}
        <Link
          href="/home"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            textDecoration: "none",
            color: "white",
          }}
        >
          <Image
            src="/logo-gio.png"
            alt="GIO Estética Avançada"
            width={100}
            height={100}
            priority
            style={{ borderRadius: 24 }}
          />

          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontWeight: 950, fontSize: 16 }}>CRM GIO</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Boituva • Unidade
            </div>
          </div>
        </Link>

        {/* MENU */}
        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href="/home"
            style={pathname === "/home" ? navBtnPrimary : navBtn}
          >
            Home
          </Link>

          <Link
            href="/dashboard"
            style={pathname === "/dashboard" ? navBtnPrimary : navBtn}
          >
            Kanban
          </Link>

          <Link
            href="/leads/new"
            style={pathname === "/leads/new" ? navBtnPrimary : navBtn}
          >
            + Novo Lead
          </Link>
        </div>
      </header>

      <main style={{ padding: 24 }}>{children}</main>
    </div>
  );
}