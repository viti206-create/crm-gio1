"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAdminAccess } from "../../../_hooks/useAdminAccess";
import SelectDark from "../../../_components/SelectDark";
import FinancialCalendar, {
  type FinancialCalendarRow,
} from "../../../_components/FinancialCalendar";

type FinancialAccount = {
  id: string;
  scope: "clinic" | "personal";
  name: string;
  type: string;
  is_active: boolean;
};

type FinancialCategory = {
  id: string;
  scope: "clinic" | "personal";
  name: string;
  type: "income" | "expense" | "both";
  is_active: boolean;
};

type FinancialTransaction = {
  id: string;
  scope: "clinic" | "personal";
  kind: "income" | "expense";
  status: "pending" | "paid" | "received" | "late";
  description: string;
  notes: string | null;
  amount: number;
  gross_amount: number | null;
  net_amount: number | null;
  fee_amount: number | null;
  fee_percent: number | null;
  due_date: string | null;
  paid_at: string | null;
  competency_date: string | null;
  account_id: string | null;
  category_id: string | null;
  counterparty_name: string | null;
  source_type: string | null;
  source_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  is_future: boolean;
  created_at: string;
  updated_at: string;
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

function statusLabel(v: string) {
  if (v === "pending") return "Pendente";
  if (v === "paid") return "Pago";
  if (v === "received") return "Recebido";
  if (v === "late") return "Atrasado";
  return v;
}

function kindLabel(v: string) {
  if (v === "income") return "Receita";
  if (v === "expense") return "Despesa";
  return v;
}

function chipStyle(
  kind: "primary" | "muted" | "warn" | "danger" = "muted"
): React.CSSProperties {
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

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.82,
  fontWeight: 900,
  marginBottom: 6,
  display: "block",
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

const btnDanger: React.CSSProperties = {
  ...btn,
  border: "1px solid rgba(255,120,120,0.30)",
  background:
    "linear-gradient(180deg, rgba(255,120,120,0.16) 0%, rgba(255,120,120,0.07) 100%)",
};

export default function FinanceiroClinicaLancamentosPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const scope = "clinic";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<FinancialTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");

  const [editingId, setEditingId] = useState<string | null>(null);

  const [kind, setKind] = useState<"income" | "expense">("income");
  const [status, setStatus] = useState<"pending" | "paid" | "received" | "late">("pending");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayInputValue());
  const [paidAt, setPaidAt] = useState("");
  const [accountInput, setAccountInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [notes, setNotes] = useState("");

  const [filterText, setFilterText] = useState("");
  const [filterKind, setFilterKind] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterAccount, setFilterAccount] = useState("all");

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/home");
    }
  }, [loadingRole, isAdmin, router]);

  async function fetchAll() {
    setLoading(true);

    const [
      { data: txData, error: txError },
      { data: accData, error: accError },
      { data: catData, error: catError },
    ] = await Promise.all([
      supabase
        .from("financial_transactions")
        .select("*")
        .eq("scope", scope)
        .order("due_date", { ascending: false })
        .order("created_at", { ascending: false }),

      supabase
        .from("financial_accounts")
        .select("id,scope,name,type,is_active")
        .eq("scope", scope)
        .eq("is_active", true)
        .order("name", { ascending: true }),

      supabase
        .from("financial_categories")
        .select("id,scope,name,type,is_active")
        .eq("scope", scope)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (txError) console.error(txError);
    if (accError) console.error(accError);
    if (catError) console.error(catError);

    setRows((txData as FinancialTransaction[]) ?? []);
    setAccounts((accData as FinancialAccount[]) ?? []);
    setCategories((catData as FinancialCategory[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) {
      fetchAll();
    }
  }, [isAdmin]);

  function resetForm() {
    setEditingId(null);
    setKind("income");
    setStatus("pending");
    setDescription("");
    setAmount("");
    setDueDate(todayInputValue());
    setPaidAt("");
    setAccountInput("");
    setCategoryInput("");
    setCounterpartyName("");
    setNotes("");
    setErrorMsg("");
  }

  async function resolveCategoryIdByName(rawName: string, currentKind: "income" | "expense") {
    const name = rawName.trim();
    if (!name) return null;

    const normalized = name.toLowerCase();

    const existing = categories.find(
      (c) => c.name.trim().toLowerCase() === normalized
    );

    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("financial_categories")
      .insert({
        scope,
        name,
        type: currentKind,
        is_active: true,
        sort_order: 0,
      })
      .select("id")
      .single();

    if (error) throw error;
    return data.id as string;
  }

  async function resolveAccountIdByName(rawName: string) {
    const name = rawName.trim();
    if (!name) return null;

    const normalized = name.toLowerCase();

    const existing = accounts.find(
      (a) => a.name.trim().toLowerCase() === normalized
    );

    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("financial_accounts")
      .insert({
        scope,
        name,
        type: "other",
        is_active: true,
        initial_balance: 0,
      })
      .select("id")
      .single();

    if (error) throw error;
    return data.id as string;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    const parsedAmount = Number(amount || 0);

    if (!description.trim()) {
      setErrorMsg("Informe a descrição.");
      return;
    }

    if (!parsedAmount || parsedAmount <= 0) {
      setErrorMsg("Informe um valor válido.");
      return;
    }

    setSaving(true);

    try {
      const resolvedCategoryId = await resolveCategoryIdByName(categoryInput, kind);
      const resolvedAccountId = await resolveAccountIdByName(accountInput);

      const payload = {
        scope,
        kind,
        status,
        description: description.trim(),
        amount: parsedAmount,
        gross_amount: parsedAmount,
        net_amount: parsedAmount,
        fee_amount: 0,
        fee_percent: 0,
        due_date: dueDate || null,
        paid_at: paidAt || null,
        account_id: resolvedAccountId,
        category_id: resolvedCategoryId,
        counterparty_name: counterpartyName.trim() || null,
        notes: notes.trim() || null,
        source_type: "manual",
        source_id: null,
        is_future: !!dueDate && new Date(dueDate) > new Date(),
      };

      if (editingId) {
        const { error } = await supabase
          .from("financial_transactions")
          .update(payload)
          .eq("id", editingId)
          .eq("scope", scope);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("financial_transactions")
          .insert(payload);

        if (error) throw error;
      }

      resetForm();
      await fetchAll();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Erro ao salvar lançamento.");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(row: FinancialTransaction) {
    setEditingId(row.id);
    setKind(row.kind);
    setStatus(row.status);
    setDescription(row.description ?? "");
    setAmount(String(row.amount ?? ""));
    setDueDate(row.due_date ?? "");
    setPaidAt(row.paid_at ?? "");

    const foundAccount = accounts.find((a) => a.id === row.account_id);
    const foundCategory = categories.find((c) => c.id === row.category_id);

    setAccountInput(foundAccount?.name ?? "");
    setCategoryInput(foundCategory?.name ?? "");

    setCounterpartyName(row.counterparty_name ?? "");
    setNotes(row.notes ?? "");
    setErrorMsg("");
    setViewMode("list");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: string) {
    const ok = window.confirm("Deseja realmente excluir este lançamento?");
    if (!ok) return;

    try {
      const { error } = await supabase
        .from("financial_transactions")
        .delete()
        .eq("id", id)
        .eq("scope", scope);

      if (error) throw error;

      if (editingId === id) resetForm();
      await fetchAll();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Erro ao excluir lançamento.");
    }
  }

  async function handleQuickStatus(row: FinancialTransaction) {
    const nextStatus = row.kind === "income" ? "received" : "paid";

    try {
      const { error } = await supabase
        .from("financial_transactions")
        .update({
          status: nextStatus,
          paid_at: todayInputValue(),
        })
        .eq("id", row.id)
        .eq("scope", scope);

      if (error) throw error;
      await fetchAll();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Erro ao atualizar status.");
    }
  }

  const filteredCategoryNames = useMemo(() => {
    return categories
      .filter((c) => c.type === "both" || c.type === kind)
      .map((c) => c.name);
  }, [categories, kind]);

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();

    return rows.filter((row) => {
      if (filterKind !== "all" && row.kind !== filterKind) return false;
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
  }, [rows, filterText, filterKind, filterStatus, filterCategory, filterAccount, categories, accounts]);

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    let pending = 0;
    let late = 0;

    for (const row of filteredRows) {
      if (row.kind === "income") income += Number(row.amount ?? 0);
      if (row.kind === "expense") expense += Number(row.amount ?? 0);
      if (row.status === "pending") pending += 1;
      if (row.status === "late") late += 1;
    }

    return {
      income,
      expense,
      balance: income - expense,
      pending,
      late,
    };
  }, [filteredRows]);

  const calendarRows: FinancialCalendarRow[] = useMemo(() => {
    return filteredRows.map((row) => ({
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
            Lançamentos • Clínica
          </div>
          <div style={chipStyle("primary")}>Scope: clinic</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/financeiro/clinica" style={btn}>
            Voltar
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
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 18,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.72 }}>Receitas</div>
          <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>
            {formatBRL(summary.income)}
          </div>
        </div>

        <div
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 18,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.72 }}>Despesas</div>
          <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>
            {formatBRL(summary.expense)}
          </div>
        </div>

        <div
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 18,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.72 }}>Resultado</div>
          <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>
            {formatBRL(summary.balance)}
          </div>
        </div>

        <div
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 18,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.72 }}>Pendentes / Atrasados</div>
          <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>
            {summary.pending} / {summary.late}
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSave}
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)",
          borderRadius: 18,
          padding: 16,
          boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            {editingId ? "Editar lançamento" : "Novo lançamento"}
          </div>

          {editingId ? (
            <button type="button" style={btn} onClick={resetForm}>
              Cancelar edição
            </button>
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <label style={labelStyle}>Tipo</label>
            <SelectDark
              value={kind}
              onChange={(v) => setKind(v as "income" | "expense")}
              searchable={false}
              options={[
                { value: "income", label: "Receita" },
                { value: "expense", label: "Despesa" },
              ]}
            />
          </div>

          <div>
            <label style={labelStyle}>Status</label>
            <SelectDark
              value={status}
              onChange={(v) => setStatus(v as "pending" | "paid" | "received" | "late")}
              searchable={false}
              options={[
                { value: "pending", label: "Pendente" },
                { value: "paid", label: "Pago" },
                { value: "received", label: "Recebido" },
                { value: "late", label: "Atrasado" },
              ]}
            />
          </div>

          <div>
            <label style={labelStyle}>Valor</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={inputStyle}
              placeholder="0,00"
            />
          </div>

          <div>
            <label style={labelStyle}>Vencimento</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Descrição</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={inputStyle}
              placeholder="Ex.: Recebimento Botox / Aluguel / Conta energia"
            />
          </div>

          <div>
            <label style={labelStyle}>Categoria</label>
            <input
              list="financial-category-suggestions-clinic"
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value)}
              style={inputStyle}
              placeholder="Digite ou selecione"
            />
            <datalist id="financial-category-suggestions-clinic">
              {filteredCategoryNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div>
            <label style={labelStyle}>Conta</label>
            <input
              list="financial-account-suggestions-clinic"
              value={accountInput}
              onChange={(e) => setAccountInput(e.target.value)}
              style={inputStyle}
              placeholder="Digite ou selecione"
            />
            <datalist id="financial-account-suggestions-clinic">
              {accounts.map((a) => (
                <option key={a.id} value={a.name} />
              ))}
            </datalist>
          </div>

          <div>
            <label style={labelStyle}>Pago / Recebido em</label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Cliente / Favorecido</label>
            <input
              value={counterpartyName}
              onChange={(e) => setCounterpartyName(e.target.value)}
              style={inputStyle}
              placeholder="Opcional"
            />
          </div>

          <div style={{ gridColumn: "span 3" }}>
            <label style={labelStyle}>Observações</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={inputStyle}
              placeholder="Opcional"
            />
          </div>
        </div>

        {errorMsg ? (
          <div
            style={{
              marginTop: 12,
              color: "#ff9b9b",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {errorMsg}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button type="submit" disabled={saving} style={btnPrimary}>
            {saving
              ? "Salvando..."
              : editingId
              ? "Salvar alterações"
              : "Salvar lançamento"}
          </button>
        </div>
      </form>

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
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 900 }}>Lançamentos</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={viewMode === "list" ? btnPrimary : btn}
              onClick={() => setViewMode("list")}
            >
              Lista
            </button>

            <button
              type="button"
              style={viewMode === "calendar" ? btnPrimary : btn}
              onClick={() => setViewMode("calendar")}
            >
              Calendário
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr auto",
            gap: 10,
          }}
        >
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={inputStyle}
            placeholder="Buscar descrição, observação, pessoa..."
          />

          <SelectDark
            value={filterKind}
            onChange={setFilterKind}
            searchable={false}
            options={[
              { value: "all", label: "Todos tipos" },
              { value: "income", label: "Receita" },
              { value: "expense", label: "Despesa" },
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
              setFilterKind("all");
              setFilterStatus("all");
              setFilterCategory("all");
              setFilterAccount("all");
            }}
            style={btn}
          >
            Limpar
          </button>
        </div>

        {viewMode === "calendar" ? (
          <FinancialCalendar
            transactions={calendarRows}
            onOpen={(row) => {
              const found = rows.find((r) => r.id === row.id);
              if (found) handleEdit(found);
            }}
            onQuickFinish={(row) => {
              const found = rows.find((r) => r.id === row.id);
              if (found) handleQuickStatus(found);
            }}
            finishLabel="Finalizar"
          />
        ) : loading ? (
          <div>Carregando...</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Descrição</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Tipo</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Status</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Valor</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Vencimento</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Categoria</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Conta</th>
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
                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>{row.description}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {row.counterparty_name || row.notes || "—"}
                        </div>
                      </td>

                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {kindLabel(row.kind)}
                      </td>

                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <span style={chipStyle(chipKind)}>
                          {statusLabel(row.status)}
                        </span>
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
                        <div>{formatDateBR(row.due_date)}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {row.paid_at ? `Baixa: ${formatDateBR(row.paid_at)}` : "—"}
                        </div>
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
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            style={btn}
                            onClick={() => handleEdit(row)}
                          >
                            Editar
                          </button>

                          {(row.status === "pending" || row.status === "late") ? (
                            <button
                              type="button"
                              style={btnPrimary}
                              onClick={() => handleQuickStatus(row)}
                            >
                              {row.kind === "income" ? "Receber" : "Pagar"}
                            </button>
                          ) : null}

                          <button
                            type="button"
                            style={btnDanger}
                            onClick={() => handleDelete(row.id)}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!filteredRows.length ? (
                  <tr>
                    <td colSpan={8} style={{ paddingTop: 12, opacity: 0.7 }}>
                      Nenhum lançamento encontrado.
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