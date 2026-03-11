"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "../_hooks/useAdminAccess";

const pageStyle: React.CSSProperties = {
  padding: 16,
  color: "white",
  display: "grid",
  gap: 16,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  borderRadius: 18,
  padding: 18,
  color: "white",
  textDecoration: "none",
  display: "grid",
  gap: 8,
  minHeight: 140,
  boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
};

const smallCardStyle: React.CSSProperties = {
  ...cardStyle,
  minHeight: 110,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  letterSpacing: 0.2,
};

const chipStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 9px",
  borderRadius: 999,
  border: "1px solid rgba(180,120,255,0.30)",
  background: "rgba(180,120,255,0.10)",
  color: "rgba(255,255,255,0.92)",
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  fontWeight: 800,
};

const mutedText: React.CSSProperties = {
  opacity: 0.8,
  lineHeight: 1.5,
  fontSize: 14,
};

export default function FinanceiroIndexPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/home");
    }
  }, [loadingRole, isAdmin, router]);

  if (loadingRole) {
    return (
      <div style={{ padding: 20, color: "white" }}>
        Carregando permissões...
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div style={pageStyle}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={sectionTitle}>Financeiro</div>
        <div style={chipStyle}>Acesso somente admin</div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 16,
        }}
      >
        <Link href="/financeiro/clinica" style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            Financeiro Clínica
          </div>
          <div style={mutedText}>
            Dashboard, lançamentos, contas a pagar, contas a receber e visão
            financeira exclusiva da clínica.
          </div>
        </Link>

        <Link href="/financeiro/pessoal" style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            Financeiro Pessoal
          </div>
          <div style={mutedText}>
            Dashboard, lançamentos, contas a pagar, contas a receber e visão
            financeira exclusiva do pessoal.
          </div>
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 16,
        }}
      >
        <Link href="/financeiro/categorias" style={smallCardStyle}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>Categorias</div>
          <div style={mutedText}>
            Categorias separadas por clínica e pessoal.
          </div>
        </Link>

        <Link href="/financeiro/contas" style={smallCardStyle}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            Contas / Carteiras
          </div>
          <div style={mutedText}>
            Contas bancárias, carteiras e caixas separados por ambiente.
          </div>
        </Link>

        <Link href="/financeiro/relatorios" style={smallCardStyle}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>Relatórios</div>
          <div style={mutedText}>
            Relatórios financeiros futuros separados por scope.
          </div>
        </Link>
      </div>
    </div>
  );
}