"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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

type CsvImportRow = {
  kind: "income" | "expense";
  status: "pending" | "paid" | "received" | "late";
  description: string;
  amount: number;
  due_date: string | null;
  paid_at: string | null;
  category_name: string;
  account_name: string;
  counterparty_name: string | null;
  notes: string | null;
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
  const d = new Date(`${v}T12:00:00`);
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

function addMonthsToDateString(dateStr: string, plusMonths: number) {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setMonth(d.getMonth() + plusMonths);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
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
  height: 44,
  boxSizing: "border-box",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  padding: "0 12px",
  borderRadius: 12,
  outline: "none",
  minWidth: 0,
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

const btnActive: React.CSSProperties = {
  ...btn,
  border: "1px solid rgba(180,120,255,0.40)",
  background: "rgba(180,120,255,0.20)",
};

const btnDanger: React.CSSProperties = {
  ...btn,
  border: "1px solid rgba(255,120,120,0.30)",
  background:
    "linear-gradient(180deg, rgba(255,120,120,0.16) 0%, rgba(255,120,120,0.07) 100%)",
};

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function parseCsvLine(line: string) {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out.map((x) => x.trim());
}

function splitCsvRows(content: string) {
  const rows: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (current.trim()) rows.push(current);
      current = "";

      if (ch === "\r" && next === "\n") {
        i += 1;
      }
      continue;
    }

    current += ch;
  }

  if (current.trim()) rows.push(current);

  return rows;
}

function normalizeHeader(text: string) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function mapCsvKind(value: string) {
  const v = String(value ?? "").trim().toLowerCase();
  if (["income", "receita", "receber", "entrada"].includes(v)) return "income";
  if (["expense", "despesa", "pagar", "saida", "saída"].includes(v)) return "expense";
  return null;
}

function mapCsvStatus(value: string, kind: "income" | "expense") {
  const v = String(value ?? "").trim().toLowerCase();

  if (["pending", "pendente"].includes(v)) return "pending";
  if (["late", "atrasado"].includes(v)) return "late";
  if (["paid", "pago"].includes(v)) return "paid";
  if (["received", "recebido"].includes(v)) return "received";

  return kind === "income" ? "received" : "paid";
}

function parseCsvAmount(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parseCsvDate(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const [, dd, mm, yyyy] = br;
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

export default function FinanceiroPessoalLancamentosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin, loadingRole } = useAdminAccess();

  const scope = "personal";

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [rows, setRows] = useState<FinancialTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [referenceMonth, setReferenceMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [movingTx, setMovingTx] = useState<string | null>(null);

  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [status, setStatus] = useState<"pending" | "paid" | "received" | "late">("paid");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayInputValue());
  const [paidAt, setPaidAt] = useState("");
  const [accountInput, setAccountInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [notes, setNotes] = useState("");
  const [isInstallment, setIsInstallment] = useState(false);
  const [installments, setInstallments] = useState(2);

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

  function clearEditQuery() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("edit");
    const next = params.toString();
    router.replace(next ? `/financeiro/pessoal/lancamentos?${next}` : "/financeiro/pessoal/lancamentos");
  }

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

    const nextRows = (txData as FinancialTransaction[]) ?? [];
    setRows(nextRows);
    setAccounts((accData as FinancialAccount[]) ?? []);
    setCategories((catData as FinancialCategory[]) ?? []);
    setLoading(false);

    const editId = searchParams.get("edit");
    if (editId) {
      const found = nextRows.find((r) => r.id === editId);
      if (found) {
        handleEdit(found);
      }
    }
  }

  useEffect(() => {
    if (isAdmin) {
      fetchAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    const shouldOpenNew = searchParams.get("novo") === "1";
    const editId = searchParams.get("edit");

    if (!shouldOpenNew || editId) return;

    resetForm();
    setShowFormModal(true);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("novo");

    const qs = params.toString();

    router.replace(
      qs
        ? `/financeiro/pessoal/lancamentos?${qs}`
        : "/financeiro/pessoal/lancamentos",
      { scroll: false }
    );
  }, [searchParams, router]);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || rows.length === 0) return;

    const found = rows.find((r) => r.id === editId);
    if (found) {
      handleEdit(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, rows]);

  function resetForm() {
    setEditingId(null);
    setKind("expense");
    setStatus("paid");
    setDescription("");
    setAmount("");
    setDueDate(todayInputValue());
    setPaidAt("");
    setAccountInput("");
    setCategoryInput("");
    setCounterpartyName("");
    setNotes("");
    setIsInstallment(false);
    setInstallments(2);
    setErrorMsg("");
  }

  async function resolveCategoryIdByName(
    rawName: string,
    currentKind: "income" | "expense"
  ) {
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

    setCategories((prev) => [
      ...prev,
      {
        id: data.id as string,
        scope,
        name,
        type: currentKind,
        is_active: true,
      },
    ]);

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

    setAccounts((prev) => [
      ...prev,
      {
        id: data.id as string,
        scope,
        name,
        type: "other",
        is_active: true,
      },
    ]);

    return data.id as string;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    const parsedAmount = Number(amount || 0);

    if (isInstallment && installments < 2) {
      setErrorMsg("Informe pelo menos 2 parcelas.");
      return;
    }

    if (isInstallment && parsedAmount <= 0) {
      setErrorMsg("Para parcelar, informe um valor maior que zero.");
      return;
    }

    setSaving(true);

    try {
      const category_id = await resolveCategoryIdByName(categoryInput, kind);
      const account_id = await resolveAccountIdByName(accountInput);

      const safeDescription = description.trim() || "Sem descrição";

      if (!isInstallment) {
        const payload = {
          scope,
          kind,
          status,
          description: safeDescription,
          amount: parsedAmount,
          gross_amount: parsedAmount,
          net_amount: parsedAmount,
          fee_amount: 0,
          fee_percent: 0,
          due_date: dueDate || null,
          paid_at: paidAt || null,
          account_id,
          category_id,
          counterparty_name: counterpartyName.trim() || null,
          notes: notes.trim() || null,
          source_type: "manual",
          source_id: null,
          installment_number: 1,
          installment_total: 1,
          is_future: !!dueDate && new Date(`${dueDate}T12:00:00`) > new Date(),
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
        setShowFormModal(false);
        clearEditQuery();
        await fetchAll();
        return;
      }

      if (editingId) {
        setErrorMsg("Para editar parcelado, apague e recrie em parcelas.");
        setSaving(false);
        return;
      }

      const eachValue = Number((parsedAmount / installments).toFixed(2));
      const inserts = [];

      for (let i = 0; i < installments; i += 1) {
        const parcelDueDate = addMonthsToDateString(dueDate, i);

        inserts.push({
          scope,
          kind,
          status: i === 0 ? status : "pending",
          description: `${safeDescription} ${i + 1}/${installments}`,
          amount: eachValue,
          gross_amount: eachValue,
          net_amount: eachValue,
          fee_amount: 0,
          fee_percent: 0,
          due_date: parcelDueDate,
          paid_at: i === 0 ? paidAt || null : null,
          account_id,
          category_id,
          counterparty_name: counterpartyName.trim() || null,
          notes: notes.trim() || null,
          source_type: "manual",
          source_id: null,
          installment_number: i + 1,
          installment_total: installments,
          is_future:
            !!parcelDueDate && new Date(`${parcelDueDate}T12:00:00`) > new Date(),
        });
      }

      const { error } = await supabase
        .from("financial_transactions")
        .insert(inserts);

      if (error) throw error;

      resetForm();
      setShowFormModal(false);
      clearEditQuery();
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
    setIsInstallment(false);
    setInstallments(
      row.installment_total && row.installment_total > 1
        ? row.installment_total
        : 2
    );
    setErrorMsg("");
    setViewMode("list");
    setShowFormModal(true);
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

      if (editingId === id) {
        resetForm();
        clearEditQuery();
      }
      await fetchAll();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Erro ao excluir lançamento.");
    }
  }

  async function moveToClinica(row: FinancialTransaction) {
    const ok = window.confirm(
      `Transferir "${row.description}" para o Financeiro da Clínica?`
    );

    if (!ok) return;

    setMovingTx(row.id);

    const { error } = await supabase
      .from("financial_transactions")
      .update({ scope: "clinic" })
      .eq("id", row.id);

    setMovingTx(null);

    if (error) {
      alert("Erro: " + error.message);
      return;
    }

    setRows((current) => current.filter((item) => item.id !== row.id));
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

  async function parseImportedCsv(file: File): Promise<CsvImportRow[]> {
    const content = await file.text();
    const rowsText = splitCsvRows(content);

    if (rowsText.length < 2) {
      throw new Error("O CSV está vazio ou sem linhas de dados.");
    }

    const headers = parseCsvLine(rowsText[0]).map(normalizeHeader);

    const getIndex = (...names: string[]) => {
      for (const name of names) {
        const idx = headers.indexOf(name);
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const idxTipo = getIndex("tipo", "kind");
    const idxStatus = getIndex("status");
    const idxDescricao = getIndex("descricao", "description");
    const idxValor = getIndex("valor", "amount");
    const idxVencimento = getIndex("vencimento", "due_date");
    const idxPagoEm = getIndex("pago_em", "pago", "paid_at");
    const idxCategoria = getIndex("categoria", "category");
    const idxConta = getIndex("conta", "account");
    const idxPessoa = getIndex("pessoa", "favorecido", "cliente", "counterparty_name");
    const idxObs = getIndex("observacoes", "observacao", "obs", "notes");

    if (idxTipo < 0 || idxDescricao < 0 || idxValor < 0) {
      throw new Error(
        "CSV inválido. Cabeçalhos mínimos: tipo, descricao, valor."
      );
    }

    const parsed: CsvImportRow[] = [];

    for (let i = 1; i < rowsText.length; i += 1) {
      const cols = parseCsvLine(rowsText[i]);
      if (!cols.some((x) => String(x ?? "").trim())) continue;

      const rawKind = cols[idxTipo] ?? "";
      const mappedKind = mapCsvKind(rawKind);

      if (!mappedKind) {
        throw new Error(`Linha ${i + 1}: tipo inválido "${rawKind}".`);
      }

      const description = String(cols[idxDescricao] ?? "").trim() || "Sem descrição";
      const amount = parseCsvAmount(cols[idxValor] ?? "");

      const due_date = idxVencimento >= 0 ? parseCsvDate(cols[idxVencimento]) : null;
      const paid_at = idxPagoEm >= 0 ? parseCsvDate(cols[idxPagoEm]) : null;
      const status = mapCsvStatus(
        idxStatus >= 0 ? cols[idxStatus] ?? "" : "",
        mappedKind
      );

      parsed.push({
        kind: mappedKind,
        status,
        description,
        amount,
        due_date,
        paid_at,
        category_name: idxCategoria >= 0 ? String(cols[idxCategoria] ?? "").trim() : "",
        account_name: idxConta >= 0 ? String(cols[idxConta] ?? "").trim() : "",
        counterparty_name: idxPessoa >= 0 ? String(cols[idxPessoa] ?? "").trim() || null : null,
        notes: idxObs >= 0 ? String(cols[idxObs] ?? "").trim() || null : null,
      });
    }

    return parsed;
  }

  async function handleImportCsv(file: File) {
    setImportingCsv(true);
    setErrorMsg("");

    try {
      const parsedRows = await parseImportedCsv(file);

      if (!parsedRows.length) {
        throw new Error("Nenhuma linha válida encontrada no CSV.");
      }

      const inserts = [];

      for (const row of parsedRows) {
        const category_id = await resolveCategoryIdByName(
          row.category_name || (row.kind === "income" ? "Importação Receita" : "Importação Despesa"),
          row.kind
        );

        const account_id = await resolveAccountIdByName(
          row.account_name || "Importação CSV"
        );

        const dueDate = row.due_date;
        const paidAt = row.paid_at;

        inserts.push({
          scope,
          kind: row.kind,
          status: row.status,
          description: row.description,
          amount: row.amount,
          gross_amount: row.amount,
          net_amount: row.amount,
          fee_amount: 0,
          fee_percent: 0,
          due_date: dueDate,
          paid_at: paidAt,
          account_id,
          category_id,
          counterparty_name: row.counterparty_name,
          notes: row.notes,
          source_type: "csv_import",
          source_id: null,
          installment_number: 1,
          installment_total: 1,
          is_future:
            !!dueDate && new Date(`${dueDate}T12:00:00`) > new Date(),
        });
      }

      const { error } = await supabase
        .from("financial_transactions")
        .insert(inserts);

      if (error) throw error;

      await fetchAll();
      window.alert(`${inserts.length} lançamento(s) importado(s) com sucesso.`);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Erro ao importar CSV.");
    } finally {
      setImportingCsv(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleExportCsv() {
    const header = [
      "tipo",
      "status",
      "descricao",
      "valor",
      "vencimento",
      "pago_em",
      "categoria",
      "conta",
      "pessoa",
      "observacoes",
    ];

    const csvLines = [
      header.join(","),
      ...filteredRows.map((row) => {
        const categoryName =
          categories.find((c) => c.id === row.category_id)?.name ?? "";
        const accountName =
          accounts.find((a) => a.id === row.account_id)?.name ?? "";

        return [
          csvEscape(row.kind),
          csvEscape(row.status),
          csvEscape(row.description),
          csvEscape(Number(row.amount ?? 0).toFixed(2)),
          csvEscape(row.due_date ?? ""),
          csvEscape(row.paid_at ?? ""),
          csvEscape(categoryName),
          csvEscape(accountName),
          csvEscape(row.counterparty_name ?? ""),
          csvEscape(row.notes ?? ""),
        ].join(",");
      }),
    ];

    const csvContent = "\uFEFF" + csvLines.join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const now = new Date();
    const filename = `financeiro-pessoal-lancamentos-${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.csv`;

    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredCategoryNames = useMemo(() => {
    return categories
      .filter((c) => c.type === "both" || c.type === kind)
      .map((c) => c.name);
  }, [categories, kind]);

  const referenceMonthLabel = useMemo(() => {
    return referenceMonth.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
  }, [referenceMonth]);

  function changeReferenceMonth(offset: number) {
    setReferenceMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + offset, 1)
    );
  }

  function goToCurrentMonth() {
    const now = new Date();
    setReferenceMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();

    return rows.filter((row) => {
      const rowDate = row.due_date ? new Date(`${row.due_date}T12:00:00`) : null;

      if (
        !rowDate ||
        rowDate.getFullYear() !== referenceMonth.getFullYear() ||
        rowDate.getMonth() !== referenceMonth.getMonth()
      ) {
        return false;
      }

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
  }, [
    rows,
    referenceMonth,
    filterText,
    filterKind,
    filterStatus,
    filterCategory,
    filterAccount,
    categories,
    accounts,
  ]);

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
      income: Number(income.toFixed(2)),
      expense: Number(expense.toFixed(2)),
      balance: Number((income - expense).toFixed(2)),
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
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleImportCsv(file);
          }
        }}
      />

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
            Lançamentos — Pessoal
          </div>
          
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            style={btnPrimary}
            onClick={() => {
              resetForm();
              clearEditQuery();
              setShowFormModal(true);
            }}
          >
            + Novo lançamento
          </button>

          <button
            type="button"
            style={btn}
            onClick={handleExportCsv}
            disabled={!filteredRows.length}
          >
            Exportar CSV
          </button>

          <button
            type="button"
            style={btn}
            onClick={() => fileInputRef.current?.click()}
            disabled={importingCsv}
          >
            {importingCsv ? "Importando..." : "Importar CSV"}
          </button>

          <button
            type="button"
            style={btn}
            onClick={() => changeReferenceMonth(-1)}
          >
            Anterior
          </button>

          <button type="button" style={btn} onClick={goToCurrentMonth}>
            Hoje
          </button>

          <button
            type="button"
            style={btn}
            onClick={() => changeReferenceMonth(1)}
          >
            Próximo
          </button>

          <Link href="/financeiro/pessoal" style={btn}>
            Voltar
          </Link>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
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

      </div>

      {showFormModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            overflowY: "auto",
          }}
        >
          <form
            onSubmit={handleSave}
            style={{
              background: "#1a1625",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 18,
              padding: 24,
              width: "100%",
              maxWidth: 560,
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
              boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 4 }}>
              {editingId ? "Editar lançamento" : "Novo lançamento"}
            </div>

            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 20 }}>
              Financeiro Pessoal
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={labelStyle}>Tipo</label>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setKind("expense");
                      if (status === "received") setStatus("paid");
                    }}
                    style={
                      kind === "expense"
                        ? { ...btnActive, color: "#ff9b9b" }
                        : btn
                    }
                  >
                    Despesa
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setKind("income");
                      if (status === "paid") setStatus("received");
                    }}
                    style={
                      kind === "income"
                        ? { ...btnActive, color: "#78ffb4" }
                        : btn
                    }
                  >
                    Receita
                  </button>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Descrição *</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={inputStyle}
                  placeholder={
                    kind === "expense"
                      ? "Ex.: Aluguel / Mercado / Internet"
                      : "Ex.: Salário / Recebimento"
                  }
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                  gap: 10,
                }}
              >
                <div>
                  <label style={labelStyle}>Valor (R$) *</label>
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
                  <label style={labelStyle}>Data *</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Status *</label>
                <SelectDark
                  value={status}
                  onChange={(v) =>
                    setStatus(v as "pending" | "paid" | "received" | "late")
                  }
                  searchable={false}
                  options={
                    kind === "expense"
                      ? [
                          { value: "paid", label: "Pago" },
                          { value: "pending", label: "Pendente" },
                          { value: "late", label: "Atrasado" },
                        ]
                      : [
                          { value: "received", label: "Recebido" },
                          { value: "pending", label: "Pendente" },
                          { value: "late", label: "Atrasado" },
                        ]
                  }
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                  gap: 10,
                }}
              >
                <div>
                  <label style={labelStyle}>Categoria</label>
                  <SelectDark
                    value={categoryInput}
                    onChange={setCategoryInput}
                    searchable
                    options={[
                      { value: "", label: "Sem categoria" },
                      ...filteredCategoryNames.map((name) => ({
                        value: name,
                        label: name,
                      })),
                    ]}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Conta</label>
                  <SelectDark
                    value={accountInput}
                    onChange={setAccountInput}
                    searchable
                    options={[
                      { value: "", label: "Sem conta" },
                      ...accounts.map((a) => ({
                        value: a.name,
                        label: a.name,
                      })),
                    ]}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Cliente / favorecido</label>
                <input
                  value={counterpartyName}
                  onChange={(e) => setCounterpartyName(e.target.value)}
                  style={inputStyle}
                  placeholder="Opcional"
                />
              </div>

              <div>
                <label style={labelStyle}>Observações</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    ...inputStyle,
                    minHeight: 90,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                  placeholder="Opcional"
                />
              </div>

              {!editingId ? (
                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isInstallment}
                      onChange={(e) => setIsInstallment(e.target.checked)}
                    />
                    Parcelar lançamento
                  </label>

                  {isInstallment ? (
                    <div style={{ marginTop: 10 }}>
                      <label style={labelStyle}>Quantidade de parcelas</label>
                      <input
                        type="number"
                        min="2"
                        max="24"
                        value={installments}
                        onChange={(e) => setInstallments(Number(e.target.value))}
                        style={inputStyle}
                      />

                      {Number(amount) > 0 && installments > 1 ? (
                        <div
                          style={{
                            marginTop: 7,
                            fontSize: 12,
                            opacity: 0.72,
                            fontWeight: 700,
                          }}
                        >
                          {installments}x de{" "}
                          {formatBRL(
                            Number(amount || 0) / Number(installments || 1)
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {(status === "paid" || status === "received") ? (
                <div>
                  <label style={labelStyle}>
                    {kind === "income" ? "Recebido em" : "Pago em"}
                  </label>
                  <input
                    type="date"
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              ) : null}
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

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                marginTop: 22,
              }}
            >
              <button
                type="button"
                style={btn}
                disabled={saving}
                onClick={() => {
                  resetForm();
                  setShowFormModal(false);
                  clearEditQuery();
                }}
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={saving}
                style={{
                  ...btnPrimary,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving
                  ? "Salvando..."
                  : editingId
                  ? "Salvar alterações"
                  : "Salvar lançamento"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div
        style={{
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
          <div style={{ opacity: 0.7 }}>Carregando...</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {filteredRows.length === 0 ? (
              <div style={{ opacity: 0.7 }}>Nenhum lançamento encontrado.</div>
            ) : (
              filteredRows.map((row) => (
                <div
                  key={row.id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    background: "rgba(255,255,255,0.03)",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>{row.description}</div>

                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.7,
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span>{formatDateBR(row.due_date)}</span>

                        {row.counterparty_name ? (
                          <span>• {row.counterparty_name}</span>
                        ) : null}

                        <span style={chipStyle(
                          row.status === "late"
                            ? "danger"
                            : row.status === "pending"
                            ? "warn"
                            : "primary"
                        )}>
                          {statusLabel(row.status)}
                        </span>

                        <span
                          style={{
                            padding: "1px 6px",
                            borderRadius: 999,
                            background:
                              row.kind === "income"
                                ? "rgba(120,255,180,0.1)"
                                : "rgba(255,120,120,0.1)",
                            fontSize: 11,
                            color:
                              row.kind === "income" ? "#78ffb4" : "#ff8080",
                          }}
                        >
                          {kindLabel(row.kind)}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: 15,
                          color:
                            row.kind === "income" ? "#78ffb4" : "#ff8080",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.kind === "expense" ? "-" : ""}
                        {formatBRL(row.amount)}
                      </div>

                      <button
                        type="button"
                        style={btn}
                        onClick={() => handleEdit(row)}
                      >
                        Editar
                      </button>

                      {row.status === "pending" || row.status === "late" ? (
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
                        onClick={() => moveToClinica(row)}
                        disabled={movingTx === row.id}
                        style={{
                          ...btn,
                          border: "1px solid rgba(255,200,80,0.3)",
                          background: "rgba(255,200,80,0.10)",
                          color: "#ffc850",
                          opacity: movingTx === row.id ? 0.5 : 1,
                        }}
                      >
                        {movingTx === row.id ? "..." : "Transferir"}
                      </button>

                      <button
                        type="button"
                        style={btnDanger}
                        onClick={() => handleDelete(row.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}