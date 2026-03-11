"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "../../_hooks/useAdminAccess";
import { supabase } from "@/lib/supabaseClient";
import FinancialCalendar, {
  type FinancialCalendarRow,
} from "../../_components/FinancialCalendar";

type FinancialTransactionRow = {
  id: string;
  scope: "clinic" | "personal";
  kind: "income" | "expense";
  status: "pending" | "paid" | "received" | "late";
  description: string;
  amount: number | null;
  due_date: string | null;
  paid_at: string | null;
  counterparty_name: string | null;
  notes: string | null;
};

const pageStyle: React.CSSProperties = {
  padding: 12,
  color: "white",
  display: "grid",
  gap: 12,
};

const summaryCardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
  borderRadius: 16,
  padding: 12,
  display: "grid",
  gap: 4,
  boxShadow: "0 12px 34px rgba(0,0,0,0.28)",
};

const btnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  padding: "9px 11px",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 12,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const btnPrimaryStyle: React.CSSProperties = {
  ...btnStyle,
  border: "1px solid rgba(180,120,255,0.30)",
  background:
    "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)",
};

const chipStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(180,120,255,0.30)",
  background: "rgba(180,120,255,0.10)",
  color: "rgba(255,255,255,0.92)",
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  fontWeight: 800,
};

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function isSameMonth(dateStr: string | null | undefined, baseDate: Date) {
  if (!dateStr) return false;
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;

  return (
    d.getFullYear() === baseDate.getFullYear() &&
    d.getMonth() === baseDate.getMonth()
  );
}

function calcularReceitasMesAtual(rows: FinancialTransactionRow[]) {
  const hoje = new Date();

  const total = rows.reduce((acc, row) => {
    if (row.scope !== "personal") return acc;
    if (row.kind !== "income") return acc;

    const entrouNoMes =
      isSameMonth(row.paid_at, hoje) || isSameMonth(row.due_date, hoje);

    if (!entrouNoMes) return acc;

    return acc + Number(row.amount ?? 0);
  }, 0);

  return Number(total.toFixed(2));
}

function calcularDespesasMesAtual(rows: FinancialTransactionRow[]) {
  const hoje = new Date();

  const total = rows.reduce((acc, row) => {
    if (row.scope !== "personal") return acc;
    if (row.kind !== "expense") return acc;

    const entrouNoMes =
      isSameMonth(row.paid_at, hoje) || isSameMonth(row.due_date, hoje);

    if (!entrouNoMes) return acc;

    return acc + Number(row.amount ?? 0);
  }, 0);

  return Number(total.toFixed(2));
}

export default function FinanceiroPessoalPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [totalReceitasMes, setTotalReceitasMes] = useState(0);
  const [totalDespesasMes, setTotalDespesasMes] = useState(0);
  const [calendarRows, setCalendarRows] = useState<FinancialCalendarRow[]>([]);
  const [loadingTotal, setLoadingTotal] = useState(true);

  const monthLabel = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
  }, []);

  const resultadoMes = totalReceitasMes - totalDespesasMes;

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/home");
    }
  }, [loadingRole, isAdmin, router]);

  useEffect(() => {
    if (loadingRole || !isAdmin) return;

    let active = true;

    async function loadResumoFinanceiroPessoal() {
      try {
        setLoadingTotal(true);

        const { data, error } = await supabase
          .from("financial_transactions")
          .select(
            "id,scope,kind,status,description,amount,due_date,paid_at,counterparty_name,notes"
          )
          .eq("scope", "personal")
          .order("due_date", { ascending: false })
          .order("created_at", { ascending: false });

        if (error) {
          console.error(
            "Erro ao buscar transações do financeiro pessoal:",
            error
          );
        }

        const txRows = (data as FinancialTransactionRow[]) ?? [];

        const receitas = calcularReceitasMesAtual(txRows);
        const despesas = calcularDespesasMesAtual(txRows);

        const nextCalendarRows: FinancialCalendarRow[] = txRows.map((row) => ({
          id: row.id,
          kind: row.kind,
          status: row.status,
          description: row.description,
          amount: Number(row.amount ?? 0),
          due_date: row.due_date,
          paid_at: row.paid_at,
          counterparty_name: row.counterparty_name,
          notes: row.notes,
        }));

        if (active) {
          setTotalReceitasMes(receitas);
          setTotalDespesasMes(despesas);
          setCalendarRows(nextCalendarRows);
        }
      } catch (err) {
        console.error(
          "Erro inesperado ao carregar resumo financeiro pessoal:",
          err
        );
        if (active) {
          setTotalReceitasMes(0);
          setTotalDespesasMes(0);
          setCalendarRows([]);
        }
      } finally {
        if (active) setLoadingTotal(false);
      }
    }

    loadResumoFinanceiroPessoal();

    return () => {
      active = false;
    };
  }, [loadingRole, isAdmin]);

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
          gap: 10,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.2 }}>
            Financeiro Pessoal
          </div>
          <div style={chipStyle}>Scope: personal</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <div style={summaryCardStyle}>
          <div style={{ fontSize: 11, opacity: 0.72 }}>Receitas</div>
          <div style={{ fontSize: 24, fontWeight: 950 }}>
            {loadingTotal ? "Carregando..." : formatBRL(totalReceitasMes)}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            Entradas de {monthLabel}
          </div>
        </div>

        <div style={summaryCardStyle}>
          <div style={{ fontSize: 11, opacity: 0.72 }}>Despesas</div>
          <div style={{ fontSize: 24, fontWeight: 950 }}>
            {loadingTotal ? "Carregando..." : formatBRL(totalDespesasMes)}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            Saídas de {monthLabel}
          </div>
        </div>

        <div style={summaryCardStyle}>
          <div style={{ fontSize: 11, opacity: 0.72 }}>Resultado</div>
          <div style={{ fontSize: 24, fontWeight: 950 }}>
            {loadingTotal ? "Carregando..." : formatBRL(resultadoMes)}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            Receitas menos despesas
          </div>
        </div>
      </div>

      <FinancialCalendar transactions={calendarRows} />
    </div>
  );
}