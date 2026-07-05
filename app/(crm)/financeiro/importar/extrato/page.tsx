"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";

type ParsedEntry = {
  _key: string;
  date: string;
  competencyDate: string | null;
  description: string;
  amount: number;
  kind: "income" | "expense";
  parcelamento: string | null;
  titularidade: string | null;
  source: "conta_corrente" | "cartao";
};

type ImportResult = {
  inserted: number;
  skipped: number;
  errors: number;
  batchId: string;
  lastError?: string;
};

function makeKey(date: string, desc: string, amount: number) {
  return `itau|${date}|${desc.trim().toLowerCase().slice(0, 40)}|${amount}`;
}

function parseDateToISO(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0, 10);
  return null;
}

function parseContaCorrente(workbook: XLSX.WorkBook): ParsedEntry[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  let dataStart = 9;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    const rowLower = row.map((c: any) => String(c ?? "").toLowerCase());
    if (rowLower.some((c: any) => c && typeof c === "string" && (c.includes("lançamento") || c.includes("lancamento")))) {
      dataStart = i + 2; break;
    }
  }
  const entries: ParsedEntry[] = [];
  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    const data = parseDateToISO(row[0]);
    const desc = String(row[1] ?? "").trim();
    const valor = parseFloat(String(row[3] ?? "").replace(",", "."));
    if (!data || !desc || isNaN(valor) || valor === 0) continue;
    if (desc.toUpperCase().includes("SALDO")) continue;
    entries.push({
      _key: makeKey(data, desc, Math.abs(valor)),
      date: data, competencyDate: null, description: desc, amount: Math.abs(valor),
      kind: valor > 0 ? "income" : "expense",
      parcelamento: null, titularidade: null, source: "conta_corrente",
    });
  }
  return entries;
}

function parseCartao(workbook: XLSX.WorkBook, dateOverride?: string | null): ParsedEntry[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Extrair mês/ano do extrato — ex: "Fatura Fechada - Julho/2026"
  let mesExtrato: string | null = null;
  const MESES: Record<string, string> = {
    janeiro: "01", fevereiro: "02", marco: "03", abril: "04",
    maio: "05", junho: "06", julho: "07", agosto: "08",
    setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  };
  for (let i = 0; i < 15; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    const rowStr = row.map((c: any) => String(c ?? "")).join(" ");
    const rowNorm = rowStr.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    // Buscar padrão: qualquer texto seguido de MêsNome/Ano
    const m = rowNorm.match(/([a-z]+)\s*\/\s*(\d{4})/);
    if (m && MESES[m[1]]) {
      mesExtrato = `${m[2]}-${MESES[m[1]]}-01`;
      break;
    }
  }

  // Encontrar linha de cabeçalho dos lançamentos
  let headerRow = 12;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    const cells = row.map((c: any) => String(c ?? "").toLowerCase().trim());
    if (cells.includes("data") && cells.some((c: any) => c && typeof c === "string" && c.includes("valor"))) {
      headerRow = i; break;
    }
  }

  const headers = (rows[headerRow] ?? []).map((c: any) =>
    String(c ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );
  const col = (terms: string[]) => headers.findIndex((h: any) => h && typeof h === "string" && terms.some(t => h.includes(t)));
  const cDataOrigem = col(["data"]);
  const cDesc = col(["lancamento"]);
  const cValor = col(["valor"]);
  const cParc = col(["parcelamento"]);
  const cTit = col(["titularidade"]);

  const entries: ParsedEntry[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    const dataOrigem = parseDateToISO(row[cDataOrigem >= 0 ? cDataOrigem : 1]);
    const desc = String(row[cDesc >= 0 ? cDesc : 2] ?? "").trim();
    const valorRaw = String(row[cValor >= 0 ? cValor : 4] ?? "").replace(",", ".");
    const valor = parseFloat(valorRaw);
    const parcelamento = cParc >= 0 ? String(row[cParc] ?? "").trim() || null : null;
    const titularidade = cTit >= 0 ? String(row[cTit] ?? "").trim() || null : null;

    if (!dataOrigem || !desc || isNaN(valor) || valor === 0) continue;
    if (desc.toLowerCase().includes("pagamento efetuado")) continue;

    // Data do cartão = 01 do mês escolhido (simples, sem risco de data inválida)
    // A data original não importa para o cartão — o que importa é o mês de competência
    const baseDate = dateOverride ?? mesExtrato ?? dataOrigem;
    const dateToUse = baseDate ? `${baseDate.slice(0, 7)}-01` : dataOrigem;
    const competencyDate = dateToUse;

    // Adicionar parcelamento na descrição se existir
    const descFinal = parcelamento ? `${desc} (${parcelamento})` : desc;

    entries.push({
      _key: makeKey(dataOrigem, desc, Math.abs(valor)),
      date: dateToUse,
      competencyDate: competencyDate,
      description: descFinal,
      amount: Math.abs(valor),
      kind: valor < 0 ? "income" : "expense",
      parcelamento,
      titularidade,
      source: "cartao",
    });
  }
  return entries;
}

export default function ImportarExtratosPage() {
  const router = useRouter();
  const [scopeParam, setScopeParam] = useState<"clinic" | "personal">("personal");
  const isClinica = scopeParam === "clinic";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("scope") === "clinic") setScopeParam("clinic");
  }, []);

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileType, setFileType] = useState<"conta_corrente" | "cartao" | null>(null);
  const [chosenType, setChosenType] = useState<"conta_corrente" | "cartao" | null>(null);
  const [entries, setEntries] = useState<ParsedEntry[]>([]);
  const [loading, setLoading] = useState(false);
  // Mês/ano escolhido pelo usuário para lançar o cartão
  const [cardMonth, setCardMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterSource, setFilterSource] = useState<"all" | "conta_corrente" | "cartao">("all");

  function handleFile(file: File) {
    if (!chosenType) { setError("Selecione o tipo do extrato antes de anexar o arquivo."); return; }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xls", "xlsx"].includes(ext ?? "")) { setError("Apenas .xls e .xlsx são suportados."); return; }
    setFileName(file.name); setLoading(true); setResult(null); setError(null);
    const type = chosenType;
    setFileType(type);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        // Para cartão, usar o mês escolhido pelo usuário
        const cardDate = type === "cartao" ? `${cardMonth}-01` : null;
        const parsed = type === "cartao" ? parseCartao(workbook, cardDate) : parseContaCorrente(workbook);
        if (parsed.length === 0) setError("Nenhum lançamento encontrado.");
        else setEntries(parsed);
      } catch (err: any) { setError("Erro ao ler: " + (err?.message ?? String(err))); }
      finally { setLoading(false); }
    };
    reader.readAsArrayBuffer(file);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!chosenType) { setError("Selecione o tipo do extrato antes de arrastar o arquivo."); return; }
    if (e.dataTransfer.files.length > 1) { setError("Importe um arquivo por vez."); return; }
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [chosenType]);

  async function handleImport() {
    if (!entries.length) return;
    setImporting(true);
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes?.user?.id ?? null;
    const batchId = crypto.randomUUID();
    let inserted = 0, skipped = 0, errors = 0, lastError = "";
    const toImport = filterSource === "all" ? entries : entries.filter(e => e.source === filterSource);

    for (const e of toImport) {
      const { error: insertErr } = await supabase.from("financial_transactions").insert({
        scope: scopeParam, kind: e.kind, status: "paid",
        description: e.description, amount: e.amount,
        gross_amount: e.amount, net_amount: e.amount,
        due_date: e.date, paid_at: e.date, competency_date: e.competencyDate ?? e.date,
        counterparty_name: e.titularidade ?? null,
        notes: e.parcelamento ?? null, is_future: false,
        source_type: "bank_import", created_by: userId,
        import_source: e.source, import_file_name: fileName,
        import_batch_id: batchId, external_import_key: e._key,
        import_note: `${e.source === "cartao" ? "Cartão" : "Conta Corrente"} Itaú — ${isClinica ? "Clínica" : "Pessoal"}`,
      });
      if (insertErr) {
        if (insertErr.code === "23505" || (insertErr.message ?? "").includes("unique") || (insertErr.message ?? "").includes("duplicate")) skipped++;
        else { errors++; lastError = insertErr.message ?? ""; }
      } else inserted++;
    }

    setImporting(false);
    setResult({ inserted, skipped, errors, batchId, lastError: lastError || undefined });
    if (inserted > 0) setEntries([]);
  }

  const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 16 };
  const btn: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "8px 16px", borderRadius: 10, cursor: "pointer", fontWeight: 900 };
  const btnP: React.CSSProperties = { ...btn, border: "1px solid rgba(180,120,255,0.30)", background: "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)" };
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const filteredEntries = filterSource === "all" ? entries : entries.filter(e => e.source === filterSource);
  const incomes = filteredEntries.filter(e => e.kind === "income");
  const expenses = filteredEntries.filter(e => e.kind === "expense");

  return (
    <div style={{ color: "white", display: "grid", gap: 14, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 950 }}>Importar Extrato — {isClinica ? "Clínica" : "Pessoal"}</div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>Itaú — Conta Corrente (.xls) ou Fatura Cartão (.xlsx)</div>
        </div>
        <button onClick={() => router.back()} style={btn}>Voltar</button>
      </div>

      {!entries.length && !result && (
        <div style={card}>
          {/* Seletor de tipo de extrato */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <button
              onClick={() => setChosenType("conta_corrente")}
              style={{ flex: 1, padding: 16, borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 14, border: chosenType === "conta_corrente" ? "2px solid rgba(80,200,120,0.6)" : "1px solid rgba(255,255,255,0.12)", background: chosenType === "conta_corrente" ? "rgba(80,200,120,0.12)" : "rgba(255,255,255,0.04)", color: "white" }}>
              🏦 Extrato Conta Corrente<br/>
              <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>(.xls — usa a data de cada lançamento)</span>
            </button>
            <button
              onClick={() => setChosenType("cartao")}
              style={{ flex: 1, padding: 16, borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 14, border: chosenType === "cartao" ? "2px solid rgba(180,120,255,0.6)" : "1px solid rgba(255,255,255,0.12)", background: chosenType === "cartao" ? "rgba(180,120,255,0.12)" : "rgba(255,255,255,0.04)", color: "white" }}>
              🃏 Fatura Cartão de Crédito<br/>
              <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>(.xlsx — você escolhe o mês de competência)</span>
            </button>
          </div>

          <div onDrop={onDrop} onDragOver={(e) => e.preventDefault()} onClick={() => chosenType ? fileRef.current?.click() : setError("Selecione o tipo do extrato primeiro.")}
            style={{ border: chosenType ? "2px dashed rgba(180,120,255,0.35)" : "2px dashed rgba(255,255,255,0.15)", borderRadius: 12, padding: 40, textAlign: "center", cursor: chosenType ? "pointer" : "not-allowed", background: chosenType ? "rgba(180,120,255,0.04)" : "rgba(255,255,255,0.02)", opacity: chosenType ? 1 : 0.6 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏦</div>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>Arraste o extrato aqui ou clique para selecionar</div>
            <div style={{ opacity: 0.65, fontSize: 13 }}>Extrato Conta Corrente (.xls) ou Fatura Cartão (.xlsx)</div>
            <div style={{ marginTop: 8, fontSize: 12, background: "rgba(255,200,80,0.10)", border: "1px solid rgba(255,200,80,0.25)", borderRadius: 8, padding: "6px 12px", color: "#ffc850", display: "inline-block" }}>
              ⚠️ Importe um arquivo por vez — conta corrente e cartão separadamente
            </div>
            <input ref={fileRef} type="file" accept=".xls,.xlsx" multiple={false} style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          </div>
          {loading && <div style={{ marginTop: 12, opacity: 0.8 }}>Lendo arquivo...</div>}
          {error && <div style={{ marginTop: 12, color: "#ff8080" }}>{error}</div>}

          {/* Seletor de mês para cartão — só aparece quando tipo for cartão */}
          {chosenType === "cartao" && <div style={{ marginTop: 16, padding: 14, background: "rgba(180,120,255,0.06)", border: "1px solid rgba(180,120,255,0.2)", borderRadius: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>🃏 Mês de competência do cartão</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
              Se estiver importando uma fatura de cartão, selecione o mês em que os gastos devem ser lançados
              (geralmente o mês anterior ao vencimento da fatura).
            </div>
            <input
              type="month"
              value={cardMonth}
              onChange={e => setCardMonth(e.target.value)}
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "white", padding: "8px 12px", fontSize: 14, outline: "none" }}
            />
            <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 10 }}>
              Todos os lançamentos do cartão serão lançados em 01/{cardMonth.split("-")[1]}/{cardMonth.split("-")[0]}
            </span>
          </div>}
          <div style={{ marginTop: 16, fontSize: 13, opacity: 0.7, display: "grid", gap: 6 }}>
            <div>✅ <strong>Sem duplicatas:</strong> pode importar toda semana — lançamentos já importados são ignorados</div>
            <div>✅ <strong>Cartão:</strong> todos os lançamentos registrados no mês do extrato</div>
            <div>✅ <strong>Pagamento de fatura</strong> é ignorado automaticamente</div>
            <div>✅ Importando como: <strong>{isClinica ? "Clínica" : "Pessoal"}</strong></div>
          </div>
        </div>
      )}

      {entries.length > 0 && !result && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 950, fontSize: 15 }}>{fileType === "cartao" ? "🃏 Fatura Cartão" : "🏦 Conta Corrente"} — {fileName}</div>
                <div style={{ fontSize: 13, opacity: 0.8, marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <span>{entries.length} lançamentos</span>
                  <span style={{ color: "#78ffb4" }}>↑ {incomes.length} entradas: {fmt(incomes.reduce((s, e) => s + e.amount, 0))}</span>
                  <span style={{ color: "#ff8080" }}>↓ {expenses.length} saídas: {fmt(expenses.reduce((s, e) => s + e.amount, 0))}</span>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  {(["all", "conta_corrente", "cartao"] as const).map(v => (
                    <button key={v} onClick={() => setFilterSource(v)}
                      style={{ ...btn, padding: "4px 10px", fontSize: 12,
                        background: filterSource === v ? "rgba(180,120,255,0.2)" : "rgba(255,255,255,0.05)",
                        border: filterSource === v ? "1px solid rgba(180,120,255,0.4)" : "1px solid rgba(255,255,255,0.12)" }}>
                      {v === "all" ? "Todos" : v === "cartao" ? "🃏 Cartão" : "🏦 Conta"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setEntries([]); setFileName(null); setChosenType(null); }} style={btn}>Cancelar</button>
                <button onClick={handleImport} disabled={importing} style={{ ...btnP, opacity: importing ? 0.5 : 1 }}>
                  {importing ? "Importando..." : `Importar ${filteredEntries.length} lançamento(s)`}
                </button>
              </div>
            </div>
          </div>
          <div style={card}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ opacity: 0.7 }}>
                    {["Data", "Descrição", "Valor", "Tipo", "Parcelamento"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.10)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.slice(0, 50).map((e, i) => (
                    <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{e.date}</td>
                      <td style={{ padding: "6px 8px", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.description}>{e.description}</td>
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: e.kind === "income" ? "#78ffb4" : "#ff8080", whiteSpace: "nowrap" }}>
                        {e.kind === "expense" ? "-" : ""}{fmt(e.amount)}
                      </td>
                      <td style={{ padding: "6px 8px" }}>{e.kind === "income" ? "Entrada" : "Saída"}</td>
                      <td style={{ padding: "6px 8px", opacity: 0.7 }}>{e.parcelamento ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredEntries.length > 50 && <div style={{ padding: 8, opacity: 0.6, fontSize: 12 }}>... e mais {filteredEntries.length - 50} lançamentos</div>}
            </div>
          </div>
        </div>
      )}

      {result && (
        <div style={{ ...card, border: result.errors === 0 ? "1px solid rgba(120,255,180,0.3)" : "1px solid rgba(255,200,80,0.3)" }}>
          <div style={{ fontWeight: 950, fontSize: 16, marginBottom: 12 }}>
            {result.errors === 0 ? "✅ Importação concluída!" : "⚠️ Importação com alertas"}
          </div>
          <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
            <div style={{ color: "#78ffb4" }}>✅ <strong>{result.inserted}</strong> lançamento(s) importado(s)</div>
            {result.skipped > 0 && <div style={{ opacity: 0.7 }}>⏭️ <strong>{result.skipped}</strong> já existiam — ignorados</div>}
            {result.errors > 0 && <div style={{ color: "#ff8080" }}>❌ <strong>{result.errors}</strong> com erro{result.lastError ? `: ${result.lastError}` : ""}</div>}
            <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>Lote: {result.batchId}</div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button onClick={() => { setResult(null); setFileName(null); setEntries([]); setFileType(null); setChosenType(null); }} style={btn}>Importar outro</button>
            <button onClick={() => router.push(isClinica ? "/financeiro/clinica" : "/financeiro/pessoal")} style={btnP}>
              Ver no financeiro {isClinica ? "clínica" : "pessoal"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
