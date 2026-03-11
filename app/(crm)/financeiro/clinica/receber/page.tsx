"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAdminAccess } from "../../../_hooks/useAdminAccess";
import SelectDark from "../../../_components/SelectDark";

type FinancialTransaction = {
  id: string;
  scope: "clinic" | "personal";
  kind: "income" | "expense";
  status: "pending" | "paid" | "received" | "late";
  description: string;
  notes: string | null;
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
};

type FinancialAccount = {
  id: string;
  scope: "clinic" | "personal";
  name: string;
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

const btnPrimary: React.CSSProperties = {
  ...btn,
  border: "1px solid rgba(180,120,255,0.30)",
  background:
    "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)",
};

export default function FinanceiroClinicaReceberPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const scope = "clinic";

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FinancialTransaction[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

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
        .eq("scope", scope)
        .eq("kind", "income")
        .order("due_date", { ascending: true })
        .order("created_at", { ascending: false }),

      supabase
        .from("financial_categories")
        .select("id,scope,name")
        .eq("scope", scope)
        .order("name", { ascending: true }),

      supabase
        .from("financial_accounts")
        .select("id,scope,name")
        .eq("scope", scope)
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

  async function handleReceive(row: FinancialTransaction) {
    try {
      const { error } = await supabase
        .from("financial_transactions")
        .update({
          status: "received",
          paid_at: todayInputValue(),
        })
        .eq("id", row.id)
        .eq("scope", scope);

      if (error) throw error;
      await fetchAll();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Erro ao marcar como recebido.");
    }
  }

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();

    return rows.filter((row) => {
      if (filterStatus !== "all" && row.status !== filterStatus) return false;
      if (filterCategory !== "all" && row.category_id !== filterCategory) return false;
      if (filterAccount !== "all" && row.account_id !== filterAccount) return false;

      if (!q) return true;

      const categoryName =
        categories.find((c) => c.id === row.category_id)?.name ?? "";
      const accountName =
        accounts.find((a) => a.id === row.account_id)?.name ?? "";

      const hay = [
        row.description ?? "",
        row.notes ?? "",
        row.counterparty_name ?? "",
        categoryName,
        accountName,
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, filterStatus, filterCategory, filterAccount, filterText, categories, accounts]);

  const summary = useMemo(() => {
    let total = 0;
    let pending = 0;
    let received = 0;
    let late = 0;

    for (const row of filteredRows) {
      const amount = Number(row.amount ?? 0);
      total += amount;
      if (row.status === "pending") pending += amount;
      if (row.status === "received") received += amount;
      if (row.status === "late") late += amount;
    }

    return { total, pending, received, late };
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
            Contas a Receber • Clínica
          </div>
          <div style={chipStyle("primary")}>Scope: clinic</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/financeiro/clinica" style={btn}>
            Voltar
          </Link>
          <Link href="/financeiro/clinica/lancamentos" style={btnPrimary}>
            Ir para lançamentos
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
        <div style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", borderRadius: 18, padding: 14 }}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Total</div>
          <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>{formatBRL(summary.total)}</div>
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", borderRadius: 18, padding: 14 }}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Pendentes</div>
          <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>{formatBRL(summary.pending)}</div>
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", borderRadius: 18, padding: 14 }}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Recebidas</div>
          <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>{formatBRL(summary.received)}</div>
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", borderRadius: 18, padding: 14 }}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Atrasadas</div>
          <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>{formatBRL(summary.late)}</div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)",
          borderRadius: 18,
          padding: 16,
          boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
          display: "grid",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr 1fr auto",
            gap: 10,
          }}
        >
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={inputStyle}
            placeholder="Buscar descrição, observação, cliente..."
          />

          <SelectDark
            value={filterStatus}
            onChange={setFilterStatus}
            searchable={false}
            options={[
              { value: "all", label: "Todos status" },
              { value: "pending", label: "Pendente" },
              { value: "received", label: "Recebido" },
              { value: "late", label: "Atrasado" },
            ]}
          />

          <SelectDark
            value={filterCategory}
            onChange={setFilterCategory}
            searchable
            options={[
              { value: "all", label: "Todas categorias" },
              ...categories.map((c) => ({
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
              ...accounts.map((a) => ({
                value: a.id,
                label: a.name,
              })),
            ]}
          />

          <button
            type="button"
            onClick={() => {
              setFilterText("");
              setFilterStatus("all");
              setFilterCategory("all");
              setFilterAccount("all");
            }}
            style={btn}
          >
            Limpar
          </button>
        </div>

        {errorMsg ? (
          <div style={{ color: "#ff9b9b", fontSize: 12, fontWeight: 700 }}>
            {errorMsg}
          </div>
        ) : null}

        {loading ? (
          <div>Carregando...</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Descrição</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Status</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Categoria</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Conta</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Valor</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Vencimento</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Ações</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((row) => {
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
                      <td style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <div style={{ fontWeight: 900 }}>{row.description}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {row.counterparty_name || row.notes || "—"}
                        </div>
                      </td>

                      <td style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <span style={chipStyle(chipKind as any)}>
                          {row.status === "pending"
                            ? "Pendente"
                            : row.status === "received"
                            ? "Recebido"
                            : row.status === "late"
                            ? "Atrasado"
                            : row.status}
                        </span>
                      </td>

                      <td style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        {categoryName}
                      </td>

                      <td style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        {accountName}
                      </td>

                      <td style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontWeight: 900 }}>
                        {formatBRL(row.amount)}
                      </td>

                      <td style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <div>{formatDateBR(row.due_date)}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {row.paid_at ? `Baixa: ${formatDateBR(row.paid_at)}` : "—"}
                        </div>
                      </td>

                      <td style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        {(row.status === "pending" || row.status === "late") ? (
                          <button
                            type="button"
                            style={btnPrimary}
                            onClick={() => handleReceive(row)}
                          >
                            Marcar como recebido
                          </button>
                        ) : (
                          <span style={chipStyle("primary")}>Finalizado</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {!filteredRows.length ? (
                  <tr>
                    <td colSpan={7} style={{ paddingTop: 12, opacity: 0.7 }}>
                      Nenhuma conta a receber encontrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}