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
  source_type?: string | null;
  source_id?: string | null;
};

type FinancialScheduleRow = {
  id: string;
  scope: "clinic" | "personal";
  kind: "income" | "expense";
  description: string;
  next_due_date: string | null;
  default_amount: number | null;
  is_active: boolean | null;
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

function sameMonthFromString(dateStr: string | null | undefined, monthBase: Date) {
  if (!dateStr) return false;
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;

  return (
    d.getFullYear() === monthBase.getFullYear() &&
    d.getMonth() === monthBase.getMonth()
  );
}

export default function FinanceiroPessoalPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [txRows, setTxRows] = useState<FinancialTransactionRow[]>([]);
  const [scheduleRows, setScheduleRows] = useState<FinancialScheduleRow[]>([]);
  const [loadingTotal, setLoadingTotal] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const monthLabel = useMemo(() => {
    return selectedMonth.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
  }, [selectedMonth]);

  const txCalendarRows = useMemo<FinancialCalendarRow[]>(() => {
    return txRows.map((row) => ({
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
  }, [txRows]);

  const scheduleCalendarRows = useMemo<FinancialCalendarRow[]>(() => {
    const existingScheduleLaunchKeys = new Set(
      txRows
        .filter((row) => row.source_type === "schedule" && row.source_id)
        .map((row) => `${row.source_id}::${row.due_date ?? ""}`)
    );

    return scheduleRows
      .filter((row) => {
        const key = `${row.id}::${row.next_due_date ?? ""}`;
        return !existingScheduleLaunchKeys.has(key);
      })
      .map((row) => ({
        id: `schedule-${row.id}`,
        kind: row.kind,
        status: "pending" as const,
        description: `${row.description} (Agenda)`,
        amount: Number(row.default_amount ?? 0),
        due_date: row.next_due_date,
        paid_at: null,
        counterparty_name: null,
        notes: "Compromisso previsto na agenda financeira",
      }));
  }, [txRows, scheduleRows]);

  const calendarRows = useMemo<FinancialCalendarRow[]>(() => {
    return [...txCalendarRows, ...scheduleCalendarRows];
  }, [txCalendarRows, scheduleCalendarRows]);

  const totalReceitasMes = useMemo(() => {
    const receitasLancadas = txRows
      .filter((row) => row.kind === "income")
      .filter((row) => sameMonthFromString(row.due_date, selectedMonth))
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

    const receitasAgenda = scheduleCalendarRows
      .filter((row) => row.kind === "income")
      .filter((row) => sameMonthFromString(row.due_date, selectedMonth))
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

    return Number((receitasLancadas + receitasAgenda).toFixed(2));
  }, [txRows, scheduleCalendarRows, selectedMonth]);

  const totalDespesasMes = useMemo(() => {
    const despesasLancadas = txRows
      .filter((row) => row.kind === "expense")
      .filter((row) => sameMonthFromString(row.due_date, selectedMonth))
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

    const despesasAgenda = scheduleCalendarRows
      .filter((row) => row.kind === "expense")
      .filter((row) => sameMonthFromString(row.due_date, selectedMonth))
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

    return Number((despesasLancadas + despesasAgenda).toFixed(2));
  }, [txRows, scheduleCalendarRows, selectedMonth]);

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

        const [
          { data: txData, error: txError },
          { data: scheduleData, error: scheduleError },
        ] = await Promise.all([
          supabase
            .from("financial_transactions")
            .select(
              "id,scope,kind,status,description,amount,due_date,paid_at,counterparty_name,notes,source_type,source_id"
            )
            .eq("scope", "personal")
            .order("due_date", { ascending: false })
            .order("created_at", { ascending: false }),

          supabase
            .from("financial_schedules")
            .select(
              "id,scope,kind,description,next_due_date,default_amount,is_active"
            )
            .eq("scope", "personal")
            .eq("is_active", true)
            .order("next_due_date", { ascending: true }),
        ]);

        if (txError) console.error(txError);
        if (scheduleError) console.error(scheduleError);

        if (active) {
          setTxRows((txData as FinancialTransactionRow[]) ?? []);
          setScheduleRows((scheduleData as FinancialScheduleRow[]) ?? []);
        }
      } catch (err) {
        console.error(err);
        if (active) {
          setTxRows([]);
          setScheduleRows([]);
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
    return <div style={{ padding: 20, color: "white" }}>Carregando permissões...</div>;
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
          <Link href="/financeiro/pessoal/agenda" style={btnStyle}>
            Agenda
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
          <div style={{ fontSize: 11, opacity: 0.7 }}>Tudo de {monthLabel}</div>
        </div>

        <div style={summaryCardStyle}>
          <div style={{ fontSize: 11, opacity: 0.72 }}>Despesas</div>
          <div style={{ fontSize: 24, fontWeight: 950 }}>
            {loadingTotal ? "Carregando..." : formatBRL(totalDespesasMes)}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Tudo de {monthLabel}</div>
        </div>

        <div style={summaryCardStyle}>
          <div style={{ fontSize: 11, opacity: 0.72 }}>Resultado</div>
          <div style={{ fontSize: 24, fontWeight: 950 }}>
            {loadingTotal ? "Carregando..." : formatBRL(resultadoMes)}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Receitas menos despesas</div>
        </div>
      </div>

      <FinancialCalendar
        transactions={calendarRows}
        currentMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        onOpen={(row) => {
          if (row.id.startsWith("schedule-")) {
            const scheduleId = row.id.replace("schedule-", "");
            router.push(`/financeiro/pessoal/agenda?edit=${scheduleId}`);
            return;
          }

          router.push(`/financeiro/pessoal/lancamentos?edit=${row.id}`);
        }}
      />
    </div>
  );
}