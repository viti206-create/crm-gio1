"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import SelectDark from "../_components/SelectDark";

type LeadRow = {
  id: string;
  name: string;
  phone_raw: string | null;
  phone_e164: string | null;
};

type RecRow = {
  id: string;
  lead_id: string;
  status: string | null;
  start_date: string; // yyyy-mm-dd
  installments_total: number;
  installments_done: number;
  leads?: LeadRow | null; // join
};

type ChipKind = "primary" | "muted" | "warn" | "danger";

function chipStyle(kind: ChipKind = "muted"): React.CSSProperties {
  let border = "1px solid rgba(255,255,255,0.10)";
  let bg = "rgba(255,255,255,0.04)";
  let color = "rgba(255,255,255,0.90)";

  if (kind === "primary") {
    border = "1px solid rgba(180,120,255,0.35)";
    bg = "rgba(180,120,255,0.12)";
  }
  if (kind === "warn") {
    border = "1px solid rgba(255,200,120,0.35)";
    bg = "rgba(255,200,120,0.10)";
  }
  if (kind === "danger") {
    border = "1px solid rgba(255,120,160,0.35)";
    bg = "rgba(255,120,160,0.12)";
  }

  return {
    
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 999,
    border,
    background: bg,
    color,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    lineHeight: "16px",
    whiteSpace: "nowrap",
    fontWeight: 900,
  };
}

function formatDateBR(d: Date | string | null | undefined) {
  try {
    if (!d) return "—";
    const dt = typeof d === "string" ? new Date(d) : d;
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return "—";
  }
}

function parseYMD(ymd: string) {
  // cria em UTC para não “puxar” um dia por fuso
  const [y, m, d] = (ymd || "").split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
}

function addDays(dt: Date, days: number) {
  const x = new Date(dt.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function addMonths(dt: Date, months: number) {
  const x = new Date(dt.getTime());
  x.setUTCMonth(x.getUTCMonth() + months);
  return x;
}

function normalizePhoneReadable(raw: string | null, e164: string | null) {
  const base = (raw && raw.trim().length > 0 ? raw : e164) || "";
  return base.trim();
}

function statusKind(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "ativo") return "primary";
  if (s.includes("paus")) return "warn";
  if (s.includes("cancel")) return "danger";
  if (s.includes("encerr")) return "danger";
  return "muted";
}

export default function RecorrenciasPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [rows, setRows] = useState<RecRow[]>([]);

  // filtros
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | string>("all");

  // modo edição
  const [editingId, setEditingId] = useState<string | null>(null);

  // form (serve para criar e para editar)
  const [formLeadId, setFormLeadId] = useState<string>("");
  const [formStatus, setFormStatus] = useState<string>("ativo");
  const [formStartDate, setFormStartDate] = useState<string>(""); // yyyy-mm-dd
  const [formTotal, setFormTotal] = useState<number>(12);
  const [formDone, setFormDone] = useState<number>(0);

  const [saving, setSaving] = useState(false);
  const topRef = useRef<HTMLDivElement | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function fetchAll() {
    setLoading(true);

    const { data: leadsData, error: leadsErr } = await supabase
      .from("leads")
      .select("id,name,phone_raw,phone_e164")
      .order("name", { ascending: true });

    const { data: recData, error: recErr } = await supabase
      .from("recorrencias")
      .select("id,lead_id,status,start_date,installments_total,installments_done,leads(id,name,phone_raw,phone_e164)")
      .order("start_date", { ascending: false });

    if (leadsErr) console.error("leads error:", leadsErr);
    if (recErr) console.error("recorrencias error:", recErr);

    setLeads((leadsData as any) ?? []);
    setRows((recData as any) ?? []);

    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  function resetFormToCreate() {
    setEditingId(null);
    setFormLeadId("");
    setFormStatus("ativo");
    setFormStartDate("");
    setFormTotal(12);
    setFormDone(0);
  }

  const computed = useMemo(() => {
    const now = new Date();
    const qLower = q.trim().toLowerCase();

    return (rows ?? []).map((r) => {
      const start = parseYMD(r.start_date);
      const total = Number(r.installments_total || 0);
      const done = Number(r.installments_done || 0);

      // Fim previsto = data do ÚLTIMO pagamento (mensal)
      // ex: total 12 -> soma 11 meses
      const end = addMonths(start, Math.max(0, total - 1));

      // janela permitida: 1 dia após até 27 dias após
      const cancelFrom = addDays(end, 1);
      const cancelTo = addDays(end, 27);

      const inWindow = now >= cancelFrom && now <= cancelTo;

      const daysToClose = inWindow
        ? Math.ceil((cancelTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : Math.ceil((cancelFrom.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // “últimos dias” = últimos 3 dias da janela
      const lastDays = inWindow && daysToClose <= 3;

      let windowLabel = "Fora da janela";
      if (inWindow) windowLabel = lastDays ? "Últimos dias" : "Dentro da janela";
      else if (now < cancelFrom) windowLabel = "Aguardando janela";

      // filtro texto
      const leadName = r.leads?.name ?? "";
      const phone = normalizePhoneReadable(r.leads?.phone_raw ?? null, r.leads?.phone_e164 ?? null);
      const status = (r.status ?? "").toString();

      const hay = `${leadName} ${phone} ${status}`.toLowerCase();
      const passesQ = !qLower || hay.includes(qLower);

      const passesStatus = statusFilter === "all" || status.toLowerCase() === statusFilter.toLowerCase();

      return {
        r,
        start,
        end,
        cancelFrom,
        cancelTo,
        inWindow,
        lastDays,
        daysToClose,
        windowLabel,
        passesQ,
        passesStatus,
      };
    });
  }, [rows, q, statusFilter]);

  const filtered = useMemo(() => {
    return computed.filter((x) => x.passesQ && x.passesStatus);
  }, [computed]);

  // cards de resumo (1 linha)
  const summary = useMemo(() => {
    const total = rows.length;
    const ativos = rows.filter((r) => (r.status ?? "").toLowerCase() === "ativo").length;

    const inWindow = computed.filter((x) => x.inWindow).length;
    const lastDays = computed.filter((x) => x.lastDays).length;

    return { total, ativos, inWindow, lastDays };
  }, [rows, computed]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.status) set.add(r.status);
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    return arr;
  }, [rows]);

  const canSave = useMemo(() => {
    if (saving) return false;
    if (!formLeadId) return false;
    if (!formStartDate) return false;
    if (!formStatus.trim()) return false;
    const total = Number(formTotal);
    const done = Number(formDone);
    if (!Number.isFinite(total) || total <= 0) return false;
    if (!Number.isFinite(done) || done < 0) return false;
    if (done > total) return false;
    return true;
  }, [saving, formLeadId, formStartDate, formStatus, formTotal, formDone]);

async function handleDelete(id: string) {
  const ok = window.confirm("Tem certeza que deseja excluir essa recorrência?\n\nEssa ação não pode ser desfeita.");
  if (!ok) return;

  setDeletingId(id);

  // remove da tela primeiro (sensação de rapidez)
  setRows((prev) => prev.filter((r) => r.id !== id)); // <- se o seu estado não se chama setRows, veja o ajuste abaixo

  const { error } = await supabase.from("recorrencias").delete().eq("id", id);

  setDeletingId(null);

  if (error) {
    console.error("delete recorrencia error:", error);
    alert(error.message ?? "Não consegui excluir (RLS/policy?)");

    // se falhar, recarrega tudo pra voltar ao normal
    fetchAll();
  }
}

  async function handleSave() {
    if (!canSave) return;

    setSaving(true);

    const payload = {
      lead_id: formLeadId,
      status: formStatus.trim(),
      start_date: formStartDate,
      installments_total: Number(formTotal),
      installments_done: Number(formDone),
    };

    let err: any = null;

    if (editingId) {
      const { error } = await supabase.from("recorrencias").update(payload).eq("id", editingId);
      err = error;
    } else {
      const { error } = await supabase.from("recorrencias").insert(payload);
      err = error;
    }

    setSaving(false);

    if (err) {
      console.error("save recorrencia error:", err);
      alert(err.message ?? "Erro ao salvar. Pode ser RLS/policy.");
      return;
    }

    await fetchAll();
    resetFormToCreate();
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function startEdit(x: RecRow) {
    setEditingId(x.id);
    setFormLeadId(x.lead_id);
    setFormStatus(x.status ?? "ativo");
    setFormStartDate(x.start_date);
    setFormTotal(Number(x.installments_total || 12));
    setFormDone(Number(x.installments_done || 0));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // estilos
  const page: React.CSSProperties = {
    padding: 16,
    color: "white",
  };

  const card: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 22px 70px rgba(0,0,0,0.55)",
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    outline: "none",
    width: "100%",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    minWidth: 190,
    cursor: "pointer",
  };

  const btn: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 900,
    whiteSpace: "nowrap",
  };

  const btnPrimary: React.CSSProperties = {
    ...btn,
    border: "1px solid rgba(180,120,255,0.28)",
    background:
      "linear-gradient(180deg, rgba(180,120,255,0.20) 0%, rgba(180,120,255,0.08) 100%)",
  };

  const btnDanger: React.CSSProperties = {
    ...btn,
    border: "1px solid rgba(255,120,160,0.35)",
    background: "rgba(255,120,160,0.10)",
  };

  const label: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.85,
    fontWeight: 900,
    letterSpacing: 0.2,
  };

  const th: React.CSSProperties = {
    textAlign: "left",
    fontSize: 12,
    opacity: 0.85,
    fontWeight: 900,
    padding: "12px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: "12px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    verticalAlign: "top",
    fontSize: 13,
  };

  return (
    <div style={page}>
      <button onClick={() => router.push("/leads/new")} style={btnPrimary}>
       + Novo lead
      </button>
      <div
        style={{
          background:
            "radial-gradient(900px 500px at 20% 15%, rgba(180,120,255,0.25), transparent 60%), linear-gradient(180deg, #09070c 0%, #050408 100%)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          padding: 16,
        }}
      >
        <div ref={topRef} />

        {/* topo */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-start",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 0.2 }}>
              Recorrências
            </div>

            {/* 1 linha só */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={chipStyle("muted")}>Total: {summary.total}</span>
              <span style={chipStyle("primary")}>Ativos: {summary.ativos}</span>
              <span style={chipStyle("warn")}>Na janela: {summary.inWindow}</span>
              <span style={chipStyle("danger")}>Últimos dias: {summary.lastDays}</span>
            </div>
                    
            {editingId ? (
              <button type="button" style={btnDanger} onClick={resetFormToCreate}>
                Cancelar edição
              </button>
            ) : null}
          </div>
        </div>

        {/* form criar/editar */}
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontWeight: 950, marginBottom: 10 }}>
            {editingId ? "Editar recorrência" : "Adicionar recorrência"}
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "1.3fr 0.8fr 0.7fr 0.6fr 0.6fr",
              alignItems: "end",
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Cliente *</div>
              <SelectDark
                value={formLeadId}
                onChange={setFormLeadId}
                placeholder="Selecione..."
                options={leads.map((l) => ({
                  value: l.id,
                  label: l.name,
                  meta: l.phone_raw ?? l.phone_e164 ?? "",
                }))}
                searchable
                searchPlaceholder="Buscar cliente..."
                minWidth={300}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Status *</div>
              <SelectDark
                value={formStatus}
                onChange={setFormStatus}
                options={[
                  { value: "ativo", label: "Ativo" },
                  { value: "pausado", label: "Pausado" },
                  { value: "cancelado", label: "Cancelado" },
                  { value: "encerrado", label: "Encerrado" },
                ]}
                searchable={false}
                minWidth={180}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Início *</div>
              <input
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Total</div>
              <input
                type="number"
                min={1}
                value={formTotal}
                onChange={(e) => setFormTotal(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Pagas</div>
              <input
                type="number"
                min={0}
                value={formDone}
                onChange={(e) => setFormDone(Number(e.target.value))}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, gap: 10 }}>
            <button type="button" style={btnPrimary} onClick={handleSave} disabled={!canSave}>
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar"}
            </button>
          </div>

           </div>

        {/* filtros */}
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              style={{ ...inputStyle, minWidth: 260 }}
              placeholder="Buscar (nome, telefone, status...)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all">Todos os status</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <button
              type="button"
              style={btn}
              onClick={() => {
                setQ("");
                setStatusFilter("all");
              }}
            >
              Limpar
            </button>
          </div>
        </div>

        {/* tabela */}
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={th}>Cliente</th>
                  <th style={th}>Status</th>
                  <th style={th}>Ações</th>
                  <th style={th}>Início</th>
                  <th style={th}>Parcelas</th>
                  <th style={th}>Fim previsto</th>
                  <th style={th}>Janela permitida</th>
                  <th style={th}>Situação</th>
                </tr>
              </thead>

              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td style={td} colSpan={8}>
                      <div style={{ opacity: 0.75 }}>
                        {loading ? "Carregando..." : "Nenhuma recorrência encontrada com esses filtros."}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((x) => {
                    const leadName = x.r.leads?.name ?? "—";
                    const phone = normalizePhoneReadable(
                      x.r.leads?.phone_raw ?? null,
                      x.r.leads?.phone_e164 ?? null
                    );

                    const status = (x.r.status ?? "—").toString();
                    const stLower = status.toLowerCase();

                    let windowChipKind: ChipKind = "muted";
                    if (x.inWindow) windowChipKind = x.lastDays ? "danger" : "warn";

                    return (
                      <tr key={x.r.id}>
                        <td style={td}>
                          <div style={{ fontWeight: 900 }}>{leadName}</div>
                          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{phone || "—"}</div>
                        </td>

                        <td style={td}>
                          <span style={chipStyle(stLower === "ativo" ? "primary" : "muted")}>{status}</span>
                        </td>

                        {/* AÇÕES */}
                        <td style={td}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            style={btn}
                            onClick={() => {
                              setEditingId(x.r.id);
                              setFormLeadId(x.r.lead_id);
                              setFormStatus((x.r.status ?? "ativo").toString());
                              setFormStartDate(x.r.start_date);
                              setFormTotal(Number(x.r.installments_total ?? 0));
                              setFormDone(Number(x.r.installments_done ?? 0));
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            Editar
                          </button>

                          <button
                            style={{
                              ...btn,
                              border: "1px solid rgba(255,120,160,0.35)",
                              background: "rgba(255,120,160,0.10)",
                            }}
                            onClick={() => handleDelete(x.r.id)}
                            disabled={deletingId === x.r.id}
                            title="Excluir recorrência"
                          >
                            {deletingId === x.r.id ? "Excluindo..." : "Excluir"}
                          </button>
                        </div>
                      </td>

                        <td style={td}>{formatDateBR(x.start)}</td>

                        <td style={td}>
                          <div style={{ fontWeight: 900 }}>
                            {Number(x.r.installments_done || 0)} / {Number(x.r.installments_total || 0)}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Pagas / Total</div>
                        </td>

                        <td style={td}>
                          <div style={{ fontWeight: 900 }}>{formatDateBR(x.end)}</div>
                          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Último pagamento</div>
                        </td>

                        <td style={td}>
                          <div style={{ fontWeight: 900 }}>
                            {formatDateBR(x.cancelFrom)} → {formatDateBR(x.cancelTo)}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Janela permitida</div>
                        </td>

                        <td style={td}>
                          <span style={chipStyle(windowChipKind)}>{x.windowLabel}</span>
                          {x.inWindow ? (
                            <div style={{ fontSize: 12, opacity: 0.78, marginTop: 6 }}>
                              {x.lastDays
                                ? `⚠️ Faltam ${x.daysToClose} dia(s)`
                                : `Faltam ${x.daysToClose} dia(s) p/ fechar`}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, opacity: 0.78, marginTop: 6 }}>
                              Ainda não é a hora de cancelar
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          </div>
      </div>
    </div>
  );
}