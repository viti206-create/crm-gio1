"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAdminAccess } from "../../_hooks/useAdminAccess";
import SelectDark from "../../_components/SelectDark";

type FinancialAccount = {
  id: string;
  scope: "clinic" | "personal";
  name: string;
  type: string;
  is_active: boolean;
};

type ParsedBaseRow = {
  raw_date: string;
  raw_description: string;
  raw_amount: number;
};

type PreviewRow = {
  line_no: number;
  scope: "clinic" | "personal";
  import_source: "bank_statement" | "credit_card_invoice";
  description: string;
  amount: number;
  kind: "income" | "expense";
  status: "pending" | "paid" | "received" | "late";
  due_date: string | null;
  paid_at: string | null;
  competency_date: string | null;
  account_id: string | null;
  external_import_key: string;
  import_note: string | null;
  result: "new" | "duplicate" | "ignored";
  ignored_by_user?: boolean;
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

function normalizeText(v: string) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parseBrazilDate(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const [, dd, mm, yyyy] = br;
    return `${yyyy}-${mm}-${dd}`;
  }

  const brShort = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (brShort) {
    const [, dd, mm, yy] = brShort;
    const yyyy = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
    return `${yyyy}-${mm}-${dd}`;
  }

  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

function parseBrazilAmount(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  let raw = String(value ?? "").trim();
  if (!raw) return 0;

  raw = raw.replace(/\s/g, "");
  raw = raw.replace(/[R$\u00A0]/g, "");
  raw = raw.replace(/[^0-9,.\-]/g, "");
  if (!raw) return 0;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  if (hasComma && hasDot && raw.lastIndexOf(",") > raw.lastIndexOf(".")) {
    const normalized = raw.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  if (hasComma && !hasDot) {
    const normalized = raw.replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  if (hasDot && !hasComma) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function splitDelimitedLine(line: string, delimiter: string) {
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

    if (ch === delimiter && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out.map((x) => x.trim());
}

async function loadXlsxModule() {
  const mod = await import("xlsx");
  return mod;
}

async function parseBankStatementFile(file: File): Promise<ParsedBaseRow[]> {
  const XLSX = await loadXlsxModule();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const sheetName =
    workbook.SheetNames.find((n) => normalizeText(n).includes("lanc")) ??
    workbook.SheetNames[0];

  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1,
    raw: false,
    blankrows: false,
  });

  let headerRowIndex = -1;
  let dateCol = -1;
  let descCol = -1;
  let valueCol = -1;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i].map((c) => normalizeText(String(c ?? "")));

    const d = row.findIndex((x) => x === "data");
    const l = row.findIndex((x) => x.includes("lanc"));
    const v = row.findIndex((x) => x.includes("valor"));

    if (d >= 0 && l >= 0 && v >= 0) {
      headerRowIndex = i;
      dateCol = d;
      descCol = l;
      valueCol = v;
      break;
    }
  }

  if (headerRowIndex < 0) {
    throw new Error(
      "Não encontrei as colunas esperadas no extrato. Esperado algo como Data / Lançamento / Valor."
    );
  }

  function looksLikeMoneyCell(value: unknown) {
    if (typeof value === "number") return true;

    const raw = String(value ?? "").trim();
    if (!raw) return false;

    return (
      /^-?\d{1,3}(\.\d{3})*,\d{2}$/.test(raw) ||
      /^-?\d+,\d{2}$/.test(raw) ||
      /^-?\d+\.\d{2}$/.test(raw)
    );
  }

  function findAmountInRow(
    row: (string | number | null)[],
    preferredIndex: number
  ) {
    const directRaw = row[preferredIndex];
    if (looksLikeMoneyCell(directRaw)) {
      const direct = parseBrazilAmount(directRaw);
      if (Number.isFinite(direct) && direct !== 0) return direct;
    }

    const neighborIndexes = [preferredIndex - 1, preferredIndex + 1];

    for (const idx of neighborIndexes) {
      if (idx < 0 || idx >= row.length) continue;
      const raw = row[idx];
      if (!looksLikeMoneyCell(raw)) continue;

      const parsed = parseBrazilAmount(raw);
      if (Number.isFinite(parsed) && parsed !== 0) return parsed;
    }

    for (let i = row.length - 1; i >= 0; i -= 1) {
      const raw = row[i];
      if (!looksLikeMoneyCell(raw)) continue;

      const parsed = parseBrazilAmount(raw);
      if (Number.isFinite(parsed) && parsed !== 0) {
        return parsed;
      }
    }

    return 0;
  }

  const parsed: ParsedBaseRow[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];

    const rawDate = String(row[dateCol] ?? "").trim();
    const rawDescription = String(row[descCol] ?? "").trim();

    if (!rawDate && !rawDescription) continue;

    const dateIso = parseBrazilDate(rawDate);
    if (!dateIso) continue;
    if (!rawDescription.trim()) continue;

    const normalizedDesc = normalizeText(rawDescription);

    if (normalizedDesc.includes("saldo anterior")) continue;
    if (normalizedDesc.includes("saldo total")) continue;
    if (normalizedDesc === "saldo") continue;
    if (normalizedDesc.startsWith("saldo ")) continue;

    const amount = findAmountInRow(row, valueCol);

    parsed.push({
      raw_date: dateIso,
      raw_description: rawDescription,
      raw_amount: Number.isFinite(amount) ? amount : 0,
    });
  }

  return parsed;
}

async function parseCardInvoiceFile(file: File): Promise<ParsedBaseRow[]> {
  const text = await file.text();
  const delimiter = detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter((x) => x.trim());

  if (lines.length < 2) {
    throw new Error("CSV vazio ou sem linhas de dados.");
  }

  const headers = splitDelimitedLine(lines[0], delimiter).map((h) =>
    normalizeText(h)
  );

  const idxDate = headers.findIndex((h) => h === "data");
  const idxDesc = headers.findIndex((h) => h.includes("lanc"));
  const idxValue = headers.findIndex((h) => h === "valor" || h.includes("valor"));

  if (idxDate < 0 || idxDesc < 0 || idxValue < 0) {
    throw new Error(
      "CSV inválido. Esperado cabeçalho com data, lançamento e valor."
    );
  }

  const parsed: ParsedBaseRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitDelimitedLine(lines[i], delimiter);
    if (!cols.some((c) => c.trim())) continue;

    const dateIso = parseBrazilDate(cols[idxDate]);
    const desc = String(cols[idxDesc] ?? "").trim();
    const amount = parseBrazilAmount(cols[idxValue]);

    if (!dateIso || !desc || !Number.isFinite(amount) || amount === 0) continue;

    parsed.push({
      raw_date: dateIso,
      raw_description: desc,
      raw_amount: amount,
    });
  }

  return parsed;
}

function buildExternalImportKey(params: {
  scope: "clinic" | "personal";
  importSource: "bank_statement" | "credit_card_invoice";
  dateIso: string;
  description: string;
  amount: number;
  occurrence: number;
}) {
  const cents = Math.round(Math.abs(params.amount) * 100);

  return [
    params.scope,
    params.importSource,
    params.dateIso,
    normalizeText(params.description),
    cents,
    params.occurrence,
  ].join("|");
}

const card: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.82,
  fontWeight: 900,
  marginBottom: 6,
  display: "block",
};

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

function resultChip(result: PreviewRow["result"]): React.CSSProperties {
  if (result === "new") {
    return {
      fontSize: 11,
      padding: "3px 8px",
      borderRadius: 999,
      border: "1px solid rgba(120,255,160,0.22)",
      background: "rgba(70,185,120,0.12)",
      color: "white",
      display: "inline-flex",
      alignItems: "center",
      fontWeight: 900,
    };
  }

  if (result === "duplicate") {
    return {
      fontSize: 11,
      padding: "3px 8px",
      borderRadius: 999,
      border: "1px solid rgba(255,200,120,0.25)",
      background: "rgba(255,200,120,0.10)",
      color: "white",
      display: "inline-flex",
      alignItems: "center",
      fontWeight: 900,
    };
  }

  return {
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,120,120,0.25)",
    background: "rgba(255,120,120,0.10)",
    color: "white",
    display: "inline-flex",
    alignItems: "center",
    fontWeight: 900,
  };
}

export default function FinanceiroImportarPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [scope, setScope] = useState<"clinic" | "personal">("clinic");
  const [importSource, setImportSource] = useState<
    "bank_statement" | "credit_card_invoice"
  >("bank_statement");
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [invoicePaymentDate, setInvoicePaymentDate] = useState("");

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  function updatePreviewRow(key: string, patch: Partial<PreviewRow>) {
    setPreviewRows((prev) =>
      prev.map((row) =>
        row.external_import_key === key ? { ...row, ...patch } : row
      )
    );
  }

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/home");
    }
  }, [loadingRole, isAdmin, router]);

  useEffect(() => {
    async function loadAccounts() {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id,scope,name,type,is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) {
        console.error(error);
        setAccounts([]);
        return;
      }

      const next = (data as FinancialAccount[]) ?? [];
      setAccounts(next);

      const firstAccount = next.find((a) => a.scope === scope);
      if (firstAccount && !accountId) {
        setAccountId(firstAccount.id);
      }
    }

    if (isAdmin) loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    const firstAccount = accounts.find((a) => a.scope === scope);
    if (firstAccount) {
      setAccountId((prev) => {
        const currentStillValid = accounts.some(
          (a) => a.id === prev && a.scope === scope
        );
        return currentStillValid ? prev : firstAccount.id;
      });
    } else {
      setAccountId("");
    }
  }, [scope, accounts]);

  const scopedAccounts = useMemo(() => {
    return accounts.filter((a) => a.scope === scope);
  }, [accounts, scope]);

  const summary = useMemo(() => {
    let news = 0;
    let duplicates = 0;
    let ignored = 0;

    for (const row of previewRows) {
      const result = row.ignored_by_user ? "ignored" : row.result;
      if (result === "new") news += 1;
      if (result === "duplicate") duplicates += 1;
      if (result === "ignored") ignored += 1;
    }

    return {
      total: previewRows.length,
      news,
      duplicates,
      ignored,
    };
  }, [previewRows]);

  async function buildPreview() {
    setErrorMsg("");
    setSuccessMsg("");
    setPreviewRows([]);

    if (!file) {
      setErrorMsg("Selecione um arquivo.");
      return;
    }

    if (!accountId) {
      setErrorMsg("Selecione a conta de destino.");
      return;
    }

    if (importSource === "credit_card_invoice" && !invoicePaymentDate) {
      setErrorMsg("Informe a data de pagamento da fatura.");
      return;
    }

    setLoadingPreview(true);

    try {
      let parsedRows: ParsedBaseRow[] = [];

      if (importSource === "bank_statement") {
        parsedRows = await parseBankStatementFile(file);
      } else {
        parsedRows = await parseCardInvoiceFile(file);
      }

      const occurrenceMap = new Map<string, number>();

      const normalizedRows = parsedRows.map((row, idx) => {
        const isCardImport = importSource === "credit_card_invoice";

        const kind =
          isCardImport
            ? ("expense" as const)
            : row.raw_amount < 0
            ? ("expense" as const)
            : ("income" as const);

        const competencyDate = row.raw_date;
        const effectiveDueDate = isCardImport ? invoicePaymentDate : row.raw_date;
        const effectivePaidAt = isCardImport ? invoicePaymentDate : row.raw_date;

        const status =
          kind === "income" ? ("received" as const) : ("paid" as const);

        const occurrenceBase = [
          competencyDate,
          normalizeText(row.raw_description),
          Math.round(Math.abs(row.raw_amount) * 100),
        ].join("|");

        const currentOccurrence = (occurrenceMap.get(occurrenceBase) ?? 0) + 1;
        occurrenceMap.set(occurrenceBase, currentOccurrence);

        const externalKey = buildExternalImportKey({
          scope,
          importSource,
          dateIso: competencyDate,
          description: row.raw_description,
          amount: row.raw_amount,
          occurrence: currentOccurrence,
        });

        const importNote = isCardImport
          ? `Compra em ${formatDateBR(competencyDate)} • pagamento da fatura em ${formatDateBR(invoicePaymentDate)}`
          : null;

        return {
          line_no: idx + 1,
          scope,
          import_source: importSource,
          description: row.raw_description.trim(),
          amount: Math.abs(Number(row.raw_amount ?? 0)),
          kind,
          status,
          due_date: effectiveDueDate,
          paid_at: effectivePaidAt,
          competency_date: competencyDate,
          account_id: accountId,
          external_import_key: externalKey,
          import_note: importNote,
          result: "new" as const,
          ignored_by_user: false,
        } satisfies PreviewRow;
      });

      const keysToCheck = normalizedRows.map((r) => r.external_import_key);
      const existingKeys = new Set<string>();

      for (let i = 0; i < keysToCheck.length; i += 200) {
        const chunk = keysToCheck.slice(i, i + 200);
        if (!chunk.length) continue;

        const { data, error } = await supabase
          .from("financial_transactions")
          .select("external_import_key")
          .in("external_import_key", chunk);

        if (error) throw error;

        for (const row of data ?? []) {
          if (row.external_import_key) existingKeys.add(row.external_import_key);
        }
      }

      const finalPreview = normalizedRows.map((row) => {
        if (existingKeys.has(row.external_import_key)) {
          return {
            ...row,
            result: "duplicate" as const,
          };
        }
        return row;
      });

      setPreviewRows(finalPreview);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(
        e?.message ??
          "Erro ao analisar o arquivo. Verifique o formato e tente novamente."
      );
    } finally {
      setLoadingPreview(false);
    }
  }

  async function confirmImport() {
    setErrorMsg("");
    setSuccessMsg("");

    const rowsToInsert = previewRows.filter(
      (r) => r.result === "new" && !r.ignored_by_user
    );

    if (!rowsToInsert.length) {
      setErrorMsg("Não há linhas novas para importar.");
      return;
    }

    setSaving(true);

    try {
      const duplicatedKeysInsideBatch = new Map<string, number>();

      for (const row of rowsToInsert) {
        duplicatedKeysInsideBatch.set(
          row.external_import_key,
          (duplicatedKeysInsideBatch.get(row.external_import_key) ?? 0) + 1
        );
      }

      const internalDuplicates = Array.from(
        duplicatedKeysInsideBatch.entries()
      ).filter(([, count]) => count > 1);

      if (internalDuplicates.length > 0) {
        throw new Error(
          `Existem chaves duplicadas dentro do próprio lote. Ex.: ${internalDuplicates
            .slice(0, 3)
            .map(([key]) => key)
            .join(" | ")}`
        );
      }

      const batchPayload = {
        scope,
        import_source: importSource,
        file_name: file?.name ?? null,
        total_rows: previewRows.length,
        imported_rows: 0,
        duplicate_rows: previewRows.filter((r) => r.result === "duplicate").length,
        ignored_rows: previewRows.filter((r) => r.ignored_by_user || r.result === "ignored").length,
      };

      const { data: batchData, error: batchError } = await supabase
        .from("financial_import_batches")
        .insert(batchPayload)
        .select("id")
        .single();

      if (batchError) {
        throw new Error(
          `Erro ao criar lote de importação: ${batchError.message || "desconhecido"}`
        );
      }

      const batchId = batchData.id as string;

      const inserts = rowsToInsert.map((row) => ({
        scope: row.scope,
        kind: row.kind,
        status: row.status,
        description: row.description || "Sem descrição",
        amount: row.amount,
        gross_amount: row.amount,
        net_amount: row.amount,
        fee_amount: 0,
        fee_percent: 0,
        due_date: row.due_date,
        paid_at: row.paid_at,
        competency_date: row.competency_date,
        account_id: row.account_id,
        category_id: null,
        counterparty_name: null,
        notes: null,
        source_type:
          row.import_source === "bank_statement"
            ? "bank_import"
            : "card_invoice_import",
        source_id: null,
        installment_number: 1,
        installment_total: 1,
        is_future:
          !!row.due_date && new Date(`${row.due_date}T12:00:00`) > new Date(),
        import_source: row.import_source,
        import_file_name: file?.name ?? null,
        import_batch_id: batchId,
        external_import_key: row.external_import_key,
        import_note: row.import_note,
      }));

      const { error: insertError } = await supabase
        .from("financial_transactions")
        .insert(inserts);

      if (insertError) {
        throw new Error(
          `Erro ao inserir lançamentos: ${insertError.message || "desconhecido"}`
        );
      }

      const { error: updateBatchError } = await supabase
        .from("financial_import_batches")
        .update({
          imported_rows: inserts.length,
        })
        .eq("id", batchId);

      if (updateBatchError) {
        throw new Error(
          `Erro ao atualizar resumo do lote: ${updateBatchError.message || "desconhecido"}`
        );
      }

      setSuccessMsg(
        `Importação concluída. ${inserts.length} linha(s) nova(s) inserida(s).`
      );
      setPreviewRows([]);
      setFile(null);
    } catch (e: any) {
      console.error("Erro completo na importação:", e);
      console.error("Mensagem:", e?.message);
      console.error("Detalhes:", e?.details);
      console.error("Hint:", e?.hint);
      console.error("Code:", e?.code);

      setErrorMsg(
        e?.message ||
          e?.details ||
          e?.hint ||
          "Erro ao confirmar a importação."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loadingRole) {
    return (
      <div style={{ padding: 20, color: "white" }}>
        Carregando permissões...
      </div>
    );
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
            Importar financeiro
          </div>
          <div
            style={{
              fontSize: 12,
              opacity: 0.76,
              lineHeight: 1.5,
            }}
          >
            Extrato bancário e fatura/cartão com deduplicação. Na fatura, cada
            compra entra uma única vez com competência na data real da compra e
            caixa no dia do pagamento da fatura.
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
            gridTemplateColumns: "1fr 1fr 1fr 1.2fr auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <label style={labelStyle}>Ambiente</label>
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

          <div>
            <label style={labelStyle}>Tipo de importação</label>
            <SelectDark
              value={importSource}
              onChange={(v) =>
                setImportSource(v as "bank_statement" | "credit_card_invoice")
              }
              searchable={false}
              options={[
                { value: "bank_statement", label: "Extrato bancário" },
                { value: "credit_card_invoice", label: "Fatura / Cartão" },
              ]}
            />
          </div>

          <div>
            <label style={labelStyle}>Conta de destino</label>
            <SelectDark
              value={accountId}
              onChange={setAccountId}
              searchable
              options={[
                { value: "", label: "Selecione a conta" },
                ...scopedAccounts.map((a) => ({
                  value: a.id,
                  label: a.name,
                })),
              ]}
            />
          </div>

          <div>
            <label style={labelStyle}>Arquivo</label>
            <input
              type="file"
              accept={
                importSource === "bank_statement"
                  ? ".xls,.xlsx,.csv"
                  : ".csv,.xls,.xlsx"
              }
              style={inputStyle}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <button
            type="button"
            onClick={buildPreview}
            style={btnPrimary}
            disabled={loadingPreview}
          >
            {loadingPreview ? "Analisando..." : "Gerar prévia"}
          </button>
        </div>

        {importSource === "credit_card_invoice" ? (
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "minmax(220px, 320px)",
              gap: 10,
            }}
          >
            <div>
              <label style={labelStyle}>Data de pagamento da fatura</label>
              <input
                type="date"
                value={invoicePaymentDate}
                onChange={(e) => setInvoicePaymentDate(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        ) : null}

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

        {successMsg ? (
          <div
            style={{
              marginTop: 12,
              color: "#9bffb5",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {successMsg}
          </div>
        ) : null}
      </div>

      <div style={card}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Total lido</div>
            <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
              {summary.total}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Novos</div>
            <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
              {summary.news}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Duplicados</div>
            <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
              {summary.duplicates}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Ignorados</div>
            <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
              {summary.ignored}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={confirmImport}
            style={btnPrimary}
            disabled={saving || summary.news === 0}
          >
            {saving ? "Importando..." : "Confirmar importação"}
          </button>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
          Prévia da importação
        </div>

        {!previewRows.length ? (
          <div style={{ opacity: 0.72 }}>
            Gere a prévia para ver as linhas classificadas.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>#</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Descrição</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Tipo</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Status</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Valor</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Competência</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Caixa</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Resultado</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Ignorar</th>
                </tr>
              </thead>

              <tbody>
                {previewRows.map((row) => {
                  const effectiveResult = row.ignored_by_user ? "ignored" : row.result;

                  return (
                    <tr key={row.external_import_key}>
                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {row.line_no}
                      </td>

                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                          fontWeight: 900,
                        }}
                      >
                        <div>{row.description}</div>
                        {row.import_note ? (
                          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                            {row.import_note}
                          </div>
                        ) : null}
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
                        {row.status === "received"
                          ? "Recebido"
                          : row.status === "paid"
                          ? "Pago"
                          : row.status === "pending"
                          ? "Pendente"
                          : "Atrasado"}
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
                        {formatDateBR(row.competency_date)}
                      </td>

                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {formatDateBR(row.due_date)}
                      </td>

                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <span style={resultChip(effectiveResult)}>
                          {effectiveResult === "new"
                            ? "Novo"
                            : effectiveResult === "duplicate"
                            ? "Duplicado"
                            : "Ignorado"}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!row.ignored_by_user}
                            onChange={(e) =>
                              updatePreviewRow(row.external_import_key, {
                                ignored_by_user: e.target.checked,
                              })
                            }
                          />
                          Ignorar
                        </label>
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