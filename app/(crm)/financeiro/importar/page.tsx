"use client";

import React, { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// ---------- tipos ----------

type CsvRow = Record<string, string>;

type ParsedEntry = {
  _rowIndex: number;
  _raw: CsvRow;
  scope: string;
  kind: string;
  status: string;
  description: string;
  amount: number;
  due_date: string | null;
  paid_at: string | null;
  competency_date: string | null;
  counterparty_name: string | null;
  notes: string | null;
  reference_code: string | null;
  is_future: boolean;
  _errors: string[];
  _ok: boolean;
};

// ---------- helpers ----------

function parseDateBR(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  // DD/MM/YYYY
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,"0")}-${m1[1].padStart(2,"0")}`;
  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return s;
  // DD-MM-YYYY
  const m3 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m3) return `${m3[3]}-${m3[2].padStart(2,"0")}-${m3[1].padStart(2,"0")}`;
  return null;
}

function parseAmount(v: string | undefined): number | null {
  if (!v) return null;
  const s = v.trim().replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.abs(n);
}

function normalizeScope(v: string | undefined): string {
  const s = (v || "").trim().toLowerCase();
  if (["clinica", "clínica", "clinic", "clinico"].includes(s)) return "clinic";
  if (["pessoal", "personal", "pessoa", "pessoal"].includes(s)) return "personal";
  return "clinic"; // padrão
}

function normalizeKind(v: string | undefined): string {
  const s = (v || "").trim().toLowerCase();
  if (["receita", "entrada", "income", "credit", "credito", "crédito"].includes(s)) return "income";
  if (["despesa", "saida", "saída", "expense", "debit", "debito", "débito"].includes(s)) return "expense";
  return s || "expense";
}

function normalizeStatus(v: string | undefined): string {
  const s = (v || "").trim().toLowerCase();
  if (["pago", "paga", "paid", "confirmado", "confirmada", "concluido", "concluída"].includes(s)) return "paid";
  if (["recebido", "recebida", "received"].includes(s)) return "received";
  if (["atrasado", "atrasada", "late", "vencido", "vencida"].includes(s)) return "late";
  return "pending"; // padrão para pendente, cancelado e qualquer outro
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
  return lines.slice(1).map(line => {
    const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ""));
    const row: CsvRow = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  }).filter(row => Object.values(row).some(v => v.trim()));
}

// Mapeia nomes de colunas comuns do CSV para os campos internos
function mapRow(row: CsvRow, idx: number): ParsedEntry {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = row[k] ?? row[k.toLowerCase()] ?? "";
      if (v.trim()) return v.trim();
    }
    return "";
  };

  const errors: string[] = [];

  const description = get("descricao", "descrição", "description", "historico", "histórico", "memo");
  if (!description) errors.push("Descrição obrigatória");

  const amountRaw = get("valor", "amount", "value", "quantia", "montante", "total");
  const amount = parseAmount(amountRaw);
  if (amount === null || amount <= 0) errors.push(`Valor inválido: '${amountRaw}'`);

  const due_date = parseDateBR(get("data_vencimento", "vencimento", "due_date", "data", "date", "data_lancamento"));
  const paid_at = parseDateBR(get("data_pagamento", "paid_at", "pagamento", "data_baixa"));
  const competency_date = parseDateBR(get("competencia", "competência", "competency_date", "data_competencia"));

  const scope = normalizeScope(get("escopo", "scope", "ambiente", "modulo", "módulo"));
  const kind = normalizeKind(get("tipo", "kind", "type", "natureza"));
  const status = normalizeStatus(get("status", "situacao", "situação", "estado"));
  const counterparty_name = get("fornecedor", "cliente", "counterparty", "counterparty_name", "parceiro", "favorecido") || null;
  const notes = get("obs", "observacao", "observação", "notes", "nota", "detalhes") || null;
  const reference_code = get("codigo", "código", "reference", "reference_code", "ref", "nf", "nota_fiscal") || null;
  const is_future = status === "pending" && !!due_date && due_date > new Date().toISOString().slice(0, 10);

  return {
    _rowIndex: idx + 2,
    _raw: row,
    scope, kind, status, description,
    amount: amount ?? 0,
    due_date: due_date || paid_at || competency_date,
    paid_at,
    competency_date,
    counterparty_name,
    notes,
    reference_code,
    is_future,
    _errors: errors,
    _ok: errors.length === 0,
  };
}

// ---------- componente ----------

export default function ImportarPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; err: number; batchId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const validRows = rows.filter(r => r._ok);
  const invalidRows = rows.filter(r => !r._ok);

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) { setError("Apenas arquivos .csv são suportados."); return; }
    setFileName(file.name);
    setLoading(true);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const csvRows = parseCsv(text);
        if (csvRows.length === 0) { setError("Arquivo CSV vazio ou sem dados válidos."); setLoading(false); return; }
        const parsed = csvRows.map((r, i) => mapRow(r, i));
        setRows(parsed);
      } catch (err: any) {
        setError("Erro ao ler o arquivo: " + (err?.message ?? String(err)));
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  async function handleImport() {
    if (!validRows.length) return;
    setImporting(true);
    setError(null);

    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes?.user?.id ?? null;
    const batchId = crypto.randomUUID();
    const importedAt = new Date().toISOString();

    const payload = validRows.map(r => ({
      scope: r.scope,
      kind: r.kind,
      status: r.status,
      description: r.description,
      amount: r.amount,
      gross_amount: r.amount,
      net_amount: r.amount,
      due_date: r.due_date,
      paid_at: r.paid_at,
      competency_date: r.competency_date,
      counterparty_name: r.counterparty_name,
      notes: r.notes,
      reference_code: r.reference_code,
      is_future: r.is_future,
      created_by: userId,
      source_type: "csv_import",
      import_source: "csv",
      import_file_name: fileName,
      import_batch_id: batchId,
      external_import_key: r.reference_code ?? `row-${r._rowIndex}-${batchId}`,
      import_note: `Importado em ${importedAt}`,
    }));

    // Inserir em lotes de 100
    let okCount = 0;
    let errCount = 0;
    for (let i = 0; i < payload.length; i += 100) {
      const batch = payload.slice(i, i + 100);
      const { error: insertErr, data } = await supabase.from("financial_transactions").insert(batch).select("id");
      if (insertErr) {
        errCount += batch.length;
        console.error("Erro ao inserir lote:", insertErr);
        setLastError(insertErr.message ?? JSON.stringify(insertErr));
      } else {
        okCount += (data?.length ?? batch.length);
      }
    }

    setImporting(false);
    setResult({ ok: okCount, err: errCount, batchId });
    if (okCount > 0) setRows([]);
  }

  const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", borderRadius: 18, padding: 16 };
  const btn: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "10px 16px", borderRadius: 12, cursor: "pointer", fontWeight: 900 };
  const btnPrimary: React.CSSProperties = { ...btn, border: "1px solid rgba(180,120,255,0.30)", background: "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)" };
  const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.7, marginBottom: 4 };

  const kindLabel = (k: string) => k === "income" ? "✅ Receita" : "❌ Despesa";
  const statusLabel = (s: string) => s === "paid" ? "Pago" : s === "pending" ? "Pendente" : "Cancelado";
  const scopeLabel = (s: string) => s === "clinica" ? "Clínica" : "Pessoal";

  return (
    <div style={{ color: "white", display: "grid", gap: 16, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 950 }}>Importar lançamentos (CSV)</div>
        <button onClick={() => router.back()} style={btn}>Voltar</button>
      </div>

      {/* Área de upload */}
      {!rows.length && !result && (
        <div style={card}>
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            style={{ border: "2px dashed rgba(180,120,255,0.35)", borderRadius: 14, padding: 40, textAlign: "center", cursor: "pointer", background: "rgba(180,120,255,0.04)" }}
          >
            <div style={{ fontSize: 40, marginBottom: 10 }}>📂</div>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>Arraste o CSV aqui ou clique para selecionar</div>
            <div style={{ opacity: 0.65, fontSize: 13 }}>Formato: .csv com separador vírgula ou ponto-e-vírgula</div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          </div>

          {loading && <div style={{ marginTop: 12, opacity: 0.8 }}>Lendo arquivo...</div>}
          {error && <div style={{ marginTop: 12, color: "#ff8080" }}>{error}</div>}

          {/* Modelo de CSV */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Colunas aceitas no CSV:</div>
            <div style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.8 }}>
              <div><strong>Obrigatórias:</strong> descrição (ou descricao), valor (ou amount)</div>
              <div><strong>Tipo:</strong> tipo — receita / despesa (ou income / expense)</div>
              <div><strong>Status:</strong> status — pago / pendente (ou paid / pending)</div>
              <div><strong>Escopo:</strong> escopo — clinica / pessoal</div>
              <div><strong>Datas:</strong> data_vencimento, data_pagamento, competencia — formato DD/MM/AAAA ou AAAA-MM-DD</div>
              <div><strong>Opcionais:</strong> fornecedor, obs, codigo</div>
            </div>
            <div style={{ marginTop: 10, padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 10, fontFamily: "monospace", fontSize: 11, overflowX: "auto", whiteSpace: "nowrap" }}>
              descrição;valor;tipo;status;escopo;data_vencimento;data_pagamento;fornecedor;obs<br/>
              Fornecedor XYZ;1500,00;despesa;pago;clinica;01/07/2026;01/07/2026;XYZ Ltda;Nota 123<br/>
              Receita de serviço;800,00;receita;pago;clinica;04/07/2026;04/07/2026;;
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && !result && (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 950, fontSize: 16 }}>Preview: {fileName}</div>
                <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                  <span style={{ color: "#78ffb4" }}>✅ {validRows.length} válidos</span>
                  {invalidRows.length > 0 && <span style={{ color: "#ff8080", marginLeft: 12 }}>❌ {invalidRows.length} com erro</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setRows([]); setFileName(null); }} style={btn}>Cancelar</button>
                <button onClick={handleImport} disabled={importing || validRows.length === 0} style={{ ...btnPrimary, opacity: importing || validRows.length === 0 ? 0.5 : 1 }}>
                  {importing ? "Importando..." : `Importar ${validRows.length} lançamento(s)`}
                </button>
              </div>
            </div>
          </div>

          {/* Linhas com erro */}
          {invalidRows.length > 0 && (
            <div style={{ ...card, border: "1px solid rgba(255,80,80,0.3)" }}>
              <div style={{ fontWeight: 900, color: "#ff8080", marginBottom: 10 }}>❌ Linhas com erro ({invalidRows.length})</div>
              <div style={{ display: "grid", gap: 8 }}>
                {invalidRows.map(r => (
                  <div key={r._rowIndex} style={{ background: "rgba(255,80,80,0.08)", borderRadius: 10, padding: 10, fontSize: 12 }}>
                    <div><strong>Linha {r._rowIndex}:</strong> {r._raw["descrição"] || r._raw["descricao"] || r._raw["description"] || "(sem descrição)"}</div>
                    <div style={{ color: "#ff8080", marginTop: 4 }}>{r._errors.join(" • ")}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabela preview */}
          <div style={card}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>✅ Lançamentos válidos para importar</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ opacity: 0.7 }}>
                    {["#", "Descrição", "Valor", "Tipo", "Status", "Escopo", "Vencimento", "Pagamento", "Fornecedor"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.10)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {validRows.map(r => (
                    <tr key={r._rowIndex} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <td style={{ padding: "8px", opacity: 0.5 }}>{r._rowIndex}</td>
                      <td style={{ padding: "8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</td>
                      <td style={{ padding: "8px", fontWeight: 700 }}>R$ {r.amount.toFixed(2).replace(".", ",")}</td>
                      <td style={{ padding: "8px" }}>{kindLabel(r.kind)}</td>
                      <td style={{ padding: "8px" }}>{statusLabel(r.status)}</td>
                      <td style={{ padding: "8px" }}>{scopeLabel(r.scope)}</td>
                      <td style={{ padding: "8px" }}>{r.due_date ?? "—"}</td>
                      <td style={{ padding: "8px" }}>{r.paid_at ?? "—"}</td>
                      <td style={{ padding: "8px", opacity: 0.8 }}>{r.counterparty_name ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div style={{ ...card, border: result.err === 0 ? "1px solid rgba(120,255,180,0.3)" : "1px solid rgba(255,200,80,0.3)" }}>
          <div style={{ fontWeight: 950, fontSize: 16, marginBottom: 10 }}>
            {result.err === 0 ? "✅ Importação concluída!" : "⚠️ Importação concluída com erros"}
          </div>
          <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
            <div>✅ <strong>{result.ok}</strong> lançamento(s) importado(s) com sucesso</div>
            {result.err > 0 && <div style={{ color: "#ff8080" }}>❌ <strong>{result.err}</strong> lançamento(s) com erro na inserção</div>}
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>ID do lote: {result.batchId}</div>
            {lastError && <div style={{ fontSize: 12, color: "#ff8080", marginTop: 8, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>Erro: {lastError}</div>}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button onClick={() => { setResult(null); setFileName(null); setRows([]); }} style={btn}>Importar outro arquivo</button>
            <button onClick={() => router.push("/financeiro/clinica")} style={btnPrimary}>Ver lançamentos</button>
          </div>
        </div>
      )}
    </div>
  );
}
