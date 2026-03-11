"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "../../_hooks/useAdminAccess";
import { supabase } from "@/lib/supabaseClient";
import FinancialCalendar, {
  type FinancialCalendarRow,
} from "../../_components/FinancialCalendar";

type RecorrenciaResumo = {
  installments_total: number | null;
};

type SaleFinanceRow = {
  id: string;
  value: number | null;
  value_gross: number | null;
  value_net: number | null;
  fee_percent: number | null;
  sale_type: string | null;
  recorrencia_id: string | null;
  installments_label: string | null;
  closed_at: string | null;
  recorrencias?: RecorrenciaResumo | RecorrenciaResumo[] | null;
};

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

function addMonths(dt: Date, months: number) {
  const x = new Date(dt.getTime());
  x.setMonth(x.getMonth() + months);
  return x;
}

function getInstallmentsTotal(row: SaleFinanceRow) {
  const rel = Array.isArray(row.recorrencias)
    ? row.recorrencias[0]
    : row.recorrencias;

  return (
    Number(rel?.installments_total ?? 0) ||
    Number((row.installments_label || "").replace(/\D/g, "")) ||
    1
  );
}

function calcularLiquidoMesAtual(sales: SaleFinanceRow[]) {
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  let total = 0;

  for (const row of sales) {
    if (!row.closed_at) continue;

    const saleDate = new Date(row.closed_at);
    if (Number.isNaN(saleDate.getTime())) continue;

    const isRecurring =
      row.sale_type === "recorrencia" || !!row.recorrencia_id;

    const grossTotal = Number(row.value_gross ?? row.value ?? 0);
    const netTotal = Number(row.value_net ?? 0);
    const feePercent = Number(row.fee_percent ?? 0);

    if (!isRecurring) {
      if (
        saleDate <= hoje &&
        saleDate.getFullYear() === anoAtual &&
        saleDate.getMonth() === mesAtual
      ) {
        const effectiveNet =
          netTotal > 0
            ? netTotal
            : Number((grossTotal * (1 - feePercent / 100)).toFixed(2));

        total += effectiveNet;
      }

      continue;
    }

    const totalInstallments = getInstallmentsTotal(row);

    const monthlyGross =
      totalInstallments > 0
        ? Number((grossTotal / totalInstallments).toFixed(2))
        : grossTotal;

    const monthlyNet =
      totalInstallments > 0
        ? Number((netTotal / totalInstallments).toFixed(2))
        : Number((monthlyGross * (1 - feePercent / 100)).toFixed(2));

    for (let i = 0; i < totalInstallments; i += 1) {
      const installmentDate = addMonths(saleDate, i);

      if (installmentDate > hoje) break;

      if (
        installmentDate.getFullYear() === anoAtual &&
        installmentDate.getMonth() === mesAtual
      ) {
        const effectiveNet =
          monthlyNet > 0
            ? monthlyNet
            : Number((monthlyGross * (1 - feePercent / 100)).toFixed(2));

        total += effectiveNet;
      }
    }
  }

  return Number(total.toFixed(2));
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

function calcularDespesasMesAtual(rows: FinancialTransactionRow[]) {
  const hoje = new Date();

  const total = rows.reduce((acc, row) => {
    if (row.scope !== "clinic") return acc;
    if (row.kind !== "expense") return acc;

    const entrouNoMes =
      isSameMonth(row.paid_at, hoje) || isSameMonth(row.due_date, hoje);

    if (!entrouNoMes) return acc;

    return acc + Number(row.amount ?? 0);
  }, 0);

  return Number(total.toFixed(2));
}

export default function FinanceiroClinicaPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [totalLiquidoMes, setTotalLiquidoMes] = useState(0);
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

  const resultadoMes = totalLiquidoMes - totalDespesasMes;

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/home");
    }
  }, [loadingRole, isAdmin, router]);

  useEffect(() => {
    if (loadingRole || !isAdmin) return;

    let active = true;

    async function loadResumoFinanceiro() {
      try {
        setLoadingTotal(true);

        const [
          { data: salesData, error: salesError },
          { data: txData, error: txError },
        ] = await Promise.all([
          supabase
            .from("sales")
            .select(
              "id,value,value_gross,value_net,fee_percent,sale_type,recorrencia_id,installments_label,closed_at,recorrencias(installments_total)"
            )
            .order("closed_at", { ascending: false }),

          supabase
            .from("financial_transactions")
            .select(
              "id,scope,kind,status,description,amount,due_date,paid_at,counterparty_name,notes"
            )
            .eq("scope", "clinic")
            .order("due_date", { ascending: false })
            .order("created_at", { ascending: false }),
        ]);

        if (salesError) {
          console.error("Erro ao buscar vendas para o financeiro:", salesError);
        }

        if (txError) {
          console.error("Erro ao buscar transações para o financeiro:", txError);
        }

        const totalLiquido = calcularLiquidoMesAtual(
          (salesData as SaleFinanceRow[]) ?? []
        );

        const txRows = (txData as FinancialTransactionRow[]) ?? [];

        const totalDespesas = calcularDespesasMesAtual(txRows);

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
          setTotalLiquidoMes(totalLiquido);
          setTotalDespesasMes(totalDespesas);
          setCalendarRows(nextCalendarRows);
        }
      } catch (err) {
        console.error("Erro inesperado ao carregar resumo financeiro:", err);
        if (active) {
          setTotalLiquidoMes(0);
          setTotalDespesasMes(0);
          setCalendarRows([]);
        }
      } finally {
        if (active) setLoadingTotal(false);
      }
    }

    loadResumoFinanceiro();

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
            Financeiro Clínica
          </div>
          <div style={chipStyle}>Scope: clinic</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/financeiro" style={btnStyle}>
            Voltar
          </Link>
          <Link href="/financeiro/clinica/lancamentos" style={btnPrimaryStyle}>
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
            {loadingTotal ? "Carregando..." : formatBRL(totalLiquidoMes)}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            Total líquido de {monthLabel}
          </div>
        </div>

        <div style={summaryCardStyle}>
          <div style={{ fontSize: 11, opacity: 0.72 }}>Despesas</div>
          <div style={{ fontSize: 24, fontWeight: 950 }}>
            {loadingTotal ? "Carregando..." : formatBRL(totalDespesasMes)}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            Despesas do mês atual
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