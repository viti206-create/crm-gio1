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
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function todayInputValue() {
  const dt = new Date();
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function monthStartValue() {
  const dt = new Date();
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
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
  background: "rgba(255,255,255,0.06)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  padding: "10px 12px",
  borderRadius: 12,
  outline: "none",
};

const btn: React.CSSProperties = {
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

const card: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
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

export default function FinanceiroRelatoriosPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FinancialTransaction[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);

  const [scope, setScope] = useState<"clinic" | "personal">("clinic");
  const [dateFrom, setDateFrom] = useState(monthStartValue());
  const [dateTo, setDateTo] = useState(todayInputValue());
  const [filterKind, setFilterKind] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/home");
    }
  }, [loadingRole, isAdmin, router]);

  async function fetchAll() {
    setLoading(true);

    const [
      { data: txData, error: txError },
      { data: catData, error: catError },
      { data: accData, error: accError },
    ] = await Promise.all([
      supabase
        .from("financial_transactions")
        .select("*")
        .order("due_date", { ascending: false })
        .order("created_at", { ascending: false }),

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
    if (catError) console.error(catError);
    if (accError) console.error(accError);

    setRows((txData as FinancialTransaction[]) ?? []);
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

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;

    return rows.filter((row) => {
      if (row.scope !== scope) return false;
      if (filterKind !== "all" && row.kind !== filterKind) return false;
      if (filterStatus !== "all" && row.status !== filterStatus) return false;
      if (filterCategory !== "all" && row.category_id !== filterCategory) return false;
      if (filterAccount !== "all" && row.account_id !== filterAccount) return false;

      const refDate = row.competency_date || row.due_date || row.paid_at || row.created_at;
      const refTime = refDate ? new Date(refDate).getTime() : null;

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
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [
    rows,
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
        label: categories.find((c) => c.id === row.category_id)?.name ?? "Sem categoria",
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
        label: accounts.find((a) => a.id === row.account_id)?.name ?? "Sem conta",
        amount: Number(row.amount ?? 0),
      }))
    );
  }, [filteredRows, accounts]);

  const latestRows = useMemo(() => {
    return [...filteredRows]
      .sort((a, b) => {
        const da = new Date(a.competency_date || a.due_date || a.created_at).getTime();
        const db = new Date(b.competency_date || b.due_date || b.created_at).getTime();
        return db - da;
      })
      .slice(0, 20);
  }, [filteredRows]);

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

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/financeiro" style={btn}>
            Voltar
          </Link>
        </div>
      </div>

      <div style={card}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1.4fr auto",
            gap: 10,
          }}
        >
          <SelectDark
            value={scope}
            onChange={(v) => setScope(v as "clinic" | "personal")}
            searchable={false}
            options={[
              { value: "clinic", label: "Clínica" },
              { value: "personal", label: "Pessoal" },
            ]}
          />

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={inputStyle}
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={inputStyle}
          />

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

          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={inputStyle}
            placeholder="Buscar descrição, pessoa..."
          />

          <button
            type="button"
            onClick={() => {
              setDateFrom(monthStartValue());
              setDateTo(todayInputValue());
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
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginTop: 10,
          }}
        >
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
                    categories.find((c) => c.id === row.category_id)?.name ?? "—";
                  const accountName =
                    accounts.find((a) => a.id === row.account_id)?.name ?? "—";

                  const chipKind =
                    row.status === "late"
                      ? "danger"
                      : row.status === "pending"
                      ? "warn"
                      : "primary";

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
                        {row.kind === "income" ? "Receita" : "Despesa"}
                      </td>

                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <span style={chipStyle(chipKind as any)}>{row.status}</span>
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
                        {formatDateBR(row.competency_date || row.due_date || row.paid_at || row.created_at)}
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