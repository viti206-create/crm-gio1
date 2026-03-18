"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAdminAccess } from "../../_hooks/useAdminAccess";
import SelectDark from "../../_components/SelectDark";

type FinancialTransaction = {
  id: string;
  scope: "clinic" | "personal";
  kind: "income" | "expense";
  status: "pending" | "paid" | "received" | "late";
  description: string;
  amount: number;
  due_date: string | null;
  paid_at: string | null;
  competency_date: string | null;
  category_id: string | null;
  account_id: string | null;
  counterparty_name: string | null;
  created_at: string;
  source_type?: string | null;
  source_id?: string | null;
};

type FinancialSchedule = {
  id: string;
  scope: "clinic" | "personal";
  kind: "income" | "expense";
  description: string;
  next_due_date: string | null;
  default_amount: number | null;
  is_active: boolean | null;
};

type FinancialCategory = {
  id: string;
  scope: "clinic" | "personal";
  name: string;
  type: "income" | "expense" | "both";
  is_active: boolean;
};

type FinancialAccount = {
  id: string;
  scope: "clinic" | "personal";
  name: string;
  type: string;
  is_active: boolean;
};

type GroupRow = {
  label: string;
  count: number;
  amount: number;
};

type ReportRow = {
  id: string;
  origin: "transaction" | "schedule";
  scope: "clinic" | "personal";
  kind: "income" | "expense";
  status: "pending" | "paid" | "received" | "late";
  description: string;
  amount: number;
  reference_date: string | null;
  category_id: string | null;
  account_id: string | null;
  counterparty_name: string | null;
  created_at: string | null;
};

function formatBRL(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateBR(v: string | null | undefined) {
  if (!v) return "—";
  const raw = String(v).slice(0, 10);
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function chipStyle(kind: "primary" | "muted" | "warn" | "danger" = "muted"): React.CSSProperties {
  let border = "1px solid rgba(255,255,255,0.10)";
  let bg = "rgba(255,255,255,0.04)";

  if (kind === "primary") {
    border = "1px solid rgba(180,120,255,0.35)";
    bg = "rgba(180,120,255,0.12)";
  }

  if (kind === "warn") {
    border = "1px solid rgba(255,200,120,0.35)";
    bg = "rgba(255,200,120,0.10)";
  }

  if (kind === "danger") {
    border = "1px solid rgba(255,120,120,0.35)";
    bg = "rgba(255,120,120,0.10)";
  }

  return {
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 999,
    border,
    background: bg,
    color: "rgba(255,255,255,0.92)",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    lineHeight: "16px",
    whiteSpace: "nowrap",
    fontWeight: 900,
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  minWidth: 0,
  boxSizing: "border-box",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  padding: "0 12px",
  borderRadius: 12,
  outline: "none",
  fontSize: 13,
};

const btn: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  height: 42,
  padding: "0 12px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 12,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  whiteSpace: "nowrap",
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  border: "1px solid rgba(180,120,255,0.30)",
  background:
    "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)",
};

const card: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
};

const fieldWrap: React.CSSProperties = {
  minWidth: 0,
};

function buildGroupRows(items: Array<{ label: string; amount: number }>): GroupRow[] {
  const map = new Map<string, GroupRow>();

  for (const item of items) {
    const label = item.label || "Não definido";
    if (!map.has(label)) {
      map.set(label, {
        label,
        count: 0,
        amount: 0,
      });
    }

    const current = map.get(label)!;
    current.count += 1;
    current.amount += Number(item.amount ?? 0);
  }

  return Array.from(map.values()).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

function monthStartValue(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

function monthEndValue(date = new Date()) {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const yyyy = last.getFullYear();
  const mm = String(last.getMonth() + 1).padStart(2, "0");
  const dd = String(last.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
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

export default function FinanceiroRelatoriosPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FinancialTransaction[]>([]);
  const [schedules, setSchedules] = useState<FinancialSchedule[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);

  const [scope, setScope] = useState<"clinic" | "personal">("clinic");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [dateFrom, setDateFrom] = useState(monthStartValue(selectedMonth));
  const [dateTo, setDateTo] = useState(monthEndValue(selectedMonth));
  const [filterKind, setFilterKind] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    setDateFrom(monthStartValue(selectedMonth));
    setDateTo(monthEndValue(selectedMonth));
  }, [selectedMonth]);

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/home");
    }
  }, [loadingRole, isAdmin, router]);

  async function fetchAll() {
    setLoading(true);

    const [
      { data: txData, error: txError },
      { data: schData, error: schError },
      { data: catData, error: catError },
      { data: accData, error: accError },
    ] = await Promise.all([
      supabase
        .from("financial_transactions")
        .select("*")
        .order("due_date", { ascending: false })
        .order("created_at", { ascending: false }),

      supabase
        .from("financial_schedules")
        .select("id,scope,kind,description,next_due_date,default_amount,is_active")
        .eq("is_active", true)
        .order("next_due_date", { ascending: false }),

      supabase
        .from("financial_categories")
        .select("id,scope,name,type,is_active")
        .order("name", { ascending: true }),

      supabase
        .from("financial_accounts")
        .select("id,scope,name,type,is_active")
        .order("name", { ascending: true }),
    ]);

    if (txError) console.error(txError);
    if (schError) console.error(schError);
    if (catError) console.error(catError);
    if (accError) console.error(accError);

    setRows((txData as FinancialTransaction[]) ?? []);
    setSchedules((schData as FinancialSchedule[]) ?? []);
    setCategories((catData as FinancialCategory[]) ?? []);
    setAccounts((accData as FinancialAccount[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) {
      fetchAll();
    }
  }, [isAdmin]);

  const scopeCategories = useMemo(() => {
    return categories.filter((c) => c.scope === scope);
  }, [categories, scope]);

  const scopeAccounts = useMemo(() => {
    return accounts.filter((a) => a.scope === scope);
  }, [accounts, scope]);

  const allReportRows = useMemo<ReportRow[]>(() => {
    const existingScheduleLaunchKeys = new Set(
      rows
        .filter((row) => row.source_type === "schedule" && row.source_id)
        .map((row) => `${row.source_id}::${row.due_date ?? ""}`)
    );

    const transactionRows: ReportRow[] = rows.map((row) => ({
      id: row.id,
      origin: "transaction",
      scope: row.scope,
      kind: row.kind,
      status: row.status,
      description: row.description,
      amount: Number(row.amount ?? 0),
      reference_date:
        row.competency_date || row.due_date || row.paid_at || row.created_at,
      category_id: row.category_id,
      account_id: row.account_id,
      counterparty_name: row.counterparty_name,
      created_at: row.created_at,
    }));

    const scheduleRows: ReportRow[] = schedules
      .filter((row) => {
        const key = `${row.id}::${row.next_due_date ?? ""}`;
        return !existingScheduleLaunchKeys.has(key);
      })
      .map((row) => ({
        id: `schedule-${row.id}`,
        origin: "schedule",
        scope: row.scope,
        kind: row.kind,
        status: "pending",
        description: `${row.description} (Agenda)`,
        amount: Number(row.default_amount ?? 0),
        reference_date: row.next_due_date,
        category_id: null,
        account_id: null,
        counterparty_name: null,
        created_at: null,
      }));

    return [...transactionRows, ...scheduleRows];
  }, [rows, schedules]);

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;

    return allReportRows.filter((row) => {
      if (row.scope !== scope) return false;
      if (filterKind !== "all" && row.kind !== filterKind) return false;
      if (filterStatus !== "all" && row.status !== filterStatus) return false;
      if (filterCategory !== "all" && row.category_id !== filterCategory) return false;
      if (filterAccount !== "all" && row.account_id !== filterAccount) return false;

      const refTime = row.reference_date
        ? new Date(`${String(row.reference_date).slice(0, 10)}T12:00:00`).getTime()
        : null;

      if (fromTime && refTime && refTime < fromTime) return false;
      if (toTime && refTime && refTime > toTime) return false;

      if (!q) return true;

      const categoryName = categories.find((c) => c.id === row.category_id)?.name ?? "";
      const accountName = accounts.find((a) => a.id === row.account_id)?.name ?? "";

      const hay = [
        row.description ?? "",
        row.counterparty_name ?? "",
        categoryName,
        accountName,
        row.status ?? "",
        row.kind ?? "",
        row.origin ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [
    allReportRows,
    categories,
    accounts,
    scope,
    filterKind,
    filterStatus,
    filterCategory,
    filterAccount,
    filterText,
    dateFrom,
    dateTo,
  ]);

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    let pending = 0;
    let receivedOrPaid = 0;
    let late = 0;

    for (const row of filteredRows) {
      const amount = Number(row.amount ?? 0);

      if (row.kind === "income") income += amount;
      if (row.kind === "expense") expense += amount;
      if (row.status === "pending") pending += amount;
      if (row.status === "late") late += amount;
      if (row.status === "paid" || row.status === "received") {
        receivedOrPaid += amount;
      }
    }

    return {
      income,
      expense,
      result: income - expense,
      pending,
      late,
      receivedOrPaid,
      count: filteredRows.length,
    };
  }, [filteredRows]);

  const byCategory = useMemo<GroupRow[]>(() => {
    return buildGroupRows(
      filteredRows.map((row) => ({
        label:
          row.origin === "schedule"
            ? "Agenda financeira"
            : categories.find((c) => c.id === row.category_id)?.name ?? "Sem categoria",
        amount: Number(row.amount ?? 0),
      }))
    );
  }, [filteredRows, categories]);

  const byStatus = useMemo<GroupRow[]>(() => {
    return buildGroupRows(
      filteredRows.map((row) => ({
        label:
          row.status === "pending"
            ? "Pendente"
            : row.status === "paid"
            ? "Pago"
            : row.status === "received"
            ? "Recebido"
            : row.status === "late"
            ? "Atrasado"
            : row.status,
        amount: Number(row.amount ?? 0),
      }))
    );
  }, [filteredRows]);

  const byAccount = useMemo<GroupRow[]>(() => {
    return buildGroupRows(
      filteredRows.map((row) => ({
        label:
          row.origin === "schedule"
            ? "Agenda financeira"
            : accounts.find((a) => a.id === row.account_id)?.name ?? "Sem conta",
        amount: Number(row.amount ?? 0),
      }))
    );
  }, [filteredRows, accounts]);

  const latestRows = useMemo(() => {
    return [...filteredRows]
      .sort((a, b) => {
        const da = new Date(`${String(a.reference_date ?? a.created_at ?? "").slice(0, 10)}T12:00:00`).getTime();
        const db = new Date(`${String(b.reference_date ?? b.created_at ?? "").slice(0, 10)}T12:00:00`).getTime();
        return db - da;
      })
      .slice(0, 20);
  }, [filteredRows]);

  const monthLabel = useMemo(() => {
    return selectedMonth.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
  }, [selectedMonth]);

  if (loadingRole) {
    return <div style={{ padding: 20, color: "white" }}>Carregando permissões...</div>;
  }

  if (!isAdmin) return null;

  return (
    <div style={{ padding: 16, color: "white", display: "grid", gap: 16 }}>
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
            Relatórios Financeiros
          </div>
          <div style={chipStyle("primary")}>
            Ambiente: {scope === "clinic" ? "Clínica" : "Pessoal"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={btn} onClick={() => setSelectedMonth(addMonths(selectedMonth, -1))}>
            Anterior
          </button>

          <button
            type="button"
            style={btn}
            onClick={() => {
              const now = new Date();
              setSelectedMonth(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
          >
            Hoje
          </button>

          <button type="button" style={btn} onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}>
            Próximo
          </button>

          <Link href="/financeiro" style={btn}>
            Voltar
          </Link>
        </div>
      </div>

      <div style={card}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(120px, 150px) minmax(140px, 150px) minmax(140px, 150px) minmax(150px, 160px) minmax(150px, 160px) minmax(220px, 1fr) auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div style={fieldWrap}>
            <SelectDark
              value={scope}
              onChange={(v) => setScope(v as "clinic" | "personal")}
              searchable={false}
              options={[
                { value: "clinic", label: "Clínica" },
                { value: "personal", label: "Pessoal" },
              ]}
            />
          </div>

          <div style={fieldWrap}>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={fieldWrap}>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={fieldWrap}>
            <SelectDark
              value={filterKind}
              onChange={setFilterKind}
              searchable={false}
              options={[
                { value: "all", label: "Todos tipos" },
                { value: "income", label: "Receitas" },
                { value: "expense", label: "Despesas" },
              ]}
            />
          </div>

          <div style={fieldWrap}>
            <SelectDark
              value={filterStatus}
              onChange={setFilterStatus}
              searchable={false}
              options={[
                { value: "all", label: "Todos status" },
                { value: "pending", label: "Pendente" },
                { value: "paid", label: "Pago" },
                { value: "received", label: "Recebido" },
                { value: "late", label: "Atrasado" },
              ]}
            />
          </div>

          <div style={fieldWrap}>
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={inputStyle}
              placeholder="Buscar descrição, pessoa..."
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setDateFrom(monthStartValue(selectedMonth));
              setDateTo(monthEndValue(selectedMonth));
              setFilterKind("all");
              setFilterStatus("all");
              setFilterCategory("all");
              setFilterAccount("all");
              setFilterText("");
            }}
            style={btn}
          >
            Limpar
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 10,
            marginTop: 10,
          }}
        >
          <div style={fieldWrap}>
            <SelectDark
              value={filterCategory}
              onChange={setFilterCategory}
              searchable
              options={[
                { value: "all", label: "Todas categorias" },
                ...scopeCategories.map((c) => ({
                  value: c.id,
                  label: c.name,
                })),
              ]}
            />
          </div>

          <div style={fieldWrap}>
            <SelectDark
              value={filterAccount}
              onChange={setFilterAccount}
              searchable
              options={[
                { value: "all", label: "Todas contas" },
                ...scopeAccounts.map((a) => ({
                  value: a.id,
                  label: a.name,
                })),
              ]}
            />
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.72 }}>
          Competência atual do relatório: <strong>{monthLabel}</strong>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <div style={card}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Receitas</div>
          <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
            {formatBRL(summary.income)}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Despesas</div>
          <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
            {formatBRL(summary.expense)}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Resultado</div>
          <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
            {formatBRL(summary.result)}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Pendentes</div>
          <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
            {formatBRL(summary.pending)}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Atrasados</div>
          <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
            {formatBRL(summary.late)}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Lançamentos</div>
          <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
            {summary.count}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
        }}
      >
        <div style={card}>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
            Por categoria
          </div>

          {byCategory.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Sem dados.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {byCategory.map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>{row.label}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {row.count} lançamento(s)
                    </div>
                  </div>
                  <div style={{ fontWeight: 900 }}>{formatBRL(row.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
            Por status
          </div>

          {byStatus.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Sem dados.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {byStatus.map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>{row.label}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {row.count} lançamento(s)
                    </div>
                  </div>
                  <div style={{ fontWeight: 900 }}>{formatBRL(row.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
            Por conta
          </div>

          {byAccount.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Sem dados.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {byAccount.map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>{row.label}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {row.count} lançamento(s)
                    </div>
                  </div>
                  <div style={{ fontWeight: 900 }}>{formatBRL(row.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
          Últimos lançamentos
        </div>

        {loading ? (
          <div>Carregando...</div>
        ) : latestRows.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Nenhum lançamento encontrado.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Descrição</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Origem</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Tipo</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Status</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Categoria</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Conta</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Valor</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Data</th>
                </tr>
              </thead>

              <tbody>
                {latestRows.map((row) => {
                  const categoryName =
                    row.origin === "schedule"
                      ? "Agenda financeira"
                      : categories.find((c) => c.id === row.category_id)?.name ?? "—";

                  const accountName =
                    row.origin === "schedule"
                      ? "Agenda financeira"
                      : accounts.find((a) => a.id === row.account_id)?.name ?? "—";

                  const chipKind =
                    row.status === "late"
                      ? "danger"
                      : row.status === "pending"
                      ? "warn"
                      : "primary";

                  const statusText =
                    row.status === "pending"
                      ? "Pendente"
                      : row.status === "paid"
                      ? "Pago"
                      : row.status === "received"
                      ? "Recebido"
                      : row.status === "late"
                      ? "Atrasado"
                      : row.status;

                  return (
                    <tr key={row.id}>
                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>{row.description}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {row.counterparty_name || "—"}
                        </div>
                      </td>

                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {row.origin === "schedule" ? "Agenda" : "Lançamento"}
                      </td>

                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {row.kind === "income" ? "Receita" : "Despesa"}
                      </td>

                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <span style={chipStyle(chipKind as any)}>{statusText}</span>
                      </td>

                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {categoryName}
                      </td>

                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {accountName}
                      </td>

                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                          fontWeight: 900,
                        }}
                      >
                        {formatBRL(row.amount)}
                      </td>

                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {formatDateBR(row.reference_date || row.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}