"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "../../_hooks/useAdminAccess";

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
  minHeight: 120,
  boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
};

const summaryCardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
  borderRadius: 18,
  padding: 16,
  display: "grid",
  gap: 6,
  boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
};

const btnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  padding: "10px 12px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 900,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const btnPrimaryStyle: React.CSSProperties = {
  ...btnStyle,
  border: "1px solid rgba(180,120,255,0.30)",
  background:
    "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)",
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

export default function FinanceiroPessoalPage() {
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 0.2 }}>
            Financeiro Pessoal
          </div>
          <div style={chipStyle}>Scope: personal</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/financeiro" style={btnStyle}>
            Voltar
          </Link>
          <Link href="/financeiro/pessoal/lancamentos" style={btnPrimaryStyle}>
            Lançamentos
          </Link>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <div style={summaryCardStyle}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Saldo atual</div>
          <div style={{ fontSize: 28, fontWeight: 950 }}>R$ 0,00</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Será alimentado pelos lançamentos
          </div>
        </div>

        <div style={summaryCardStyle}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Receitas</div>
          <div style={{ fontSize: 28, fontWeight: 950 }}>R$ 0,00</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Período padrão do financeiro
          </div>
        </div>

        <div style={summaryCardStyle}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Despesas</div>
          <div style={{ fontSize: 28, fontWeight: 950 }}>R$ 0,00</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Período padrão do financeiro
          </div>
        </div>

        <div style={summaryCardStyle}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Resultado</div>
          <div style={{ fontSize: 28, fontWeight: 950 }}>R$ 0,00</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Receitas menos despesas
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 16,
        }}
      >
        <Link href="/financeiro/pessoal/lancamentos" style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Lançamentos</div>
          <div style={{ opacity: 0.8, lineHeight: 1.5 }}>
            Cadastre receitas e despesas pessoais.
          </div>
        </Link>

        <Link href="/financeiro/pessoal/pagar" style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Contas a Pagar</div>
          <div style={{ opacity: 0.8, lineHeight: 1.5 }}>
            Veja despesas pendentes, pagas e atrasadas.
          </div>
        </Link>

        <Link href="/financeiro/pessoal/receber" style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Contas a Receber</div>
          <div style={{ opacity: 0.8, lineHeight: 1.5 }}>
            Veja receitas pendentes, recebidas e atrasadas.
          </div>
        </Link>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)",
          borderRadius: 18,
          padding: 16,
          boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>
          Visão geral
        </div>
        <div style={{ opacity: 0.78, lineHeight: 1.6 }}>
          Esta área será o dashboard financeiro pessoal. Por enquanto, ela
          funciona como navegação segura para as páginas do módulo sem mexer no
          CRM atual.
        </div>
      </div>
    </div>
  );
}