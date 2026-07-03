"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "../_hooks/useAdminAccess";

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
  start_date: string;
  installments_total: number;
  installments_done: number;
  price_per_installment: number | null;
  sale_type?: string | null;
  leads?: LeadRow | null;
};

type EditForm = {
  start_date: string;
  installments_total: string;
  installments_done: string;
  price_per_installment: string;
};

type TabType = "cartao" | "boleto" | "canceladas";

function formatDateBR(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatBRL(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseYMD(ymd: string) {
  const [y, m, d] = (ymd || "").split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
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
  return (raw && raw.trim()) || (e164 && e164.trim()) || "";
}

function normalizeRecStatus(status: string | null | undefined) {
  const s = (status || "").trim().toLowerCase();
  if (["ativo", "ativa"].includes(s)) return "ativo";
  if (["pausado", "pausada"].includes(s)) return "pausado";
  if (s === "cancelar_hoje") return "cancelar_hoje";
  if (["finalizado", "finalizada", "concluida", "concluida", "encerrado", "encerrada"].includes(s)) return "finalizado";
  return "ativo";
}

const thCenter: React.CSSProperties = { textAlign: "center", paddingBottom: 10 };
const tdCenter: React.CSSProperties = {
  padding: "10px 0",
  borderTop: "1px solid rgba(255,255,255,0.06)",
  textAlign: "center",
  verticalAlign: "top",
};

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  color: "white",
  padding: "7px 10px",
  width: "100%",
  fontSize: 14,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  marginBottom: 4,
  display: "block",
};

export default function RecorrenciasPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RecRow[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("cartao");
  const [editRec, setEditRec] = useState<RecRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadingRole && !isAdmin) router.replace("/dashboard");
  }, [loadingRole, isAdmin, router]);

  async function fetchAll() {
    setLoading(true);

    const { data: recData, error: recError } = await supabase
      .from("recorrencias")
      .select("id,lead_id,status,start_date,installments_total,installments_done,price_per_installment,leads(id,name,phone_raw,phone_e164)")
      .order("start_date", { ascending: false });

    if (recError) { console.error(recError); setRows([]); setLoading(false); return; }

    const { data: salesData } = await supabase
      .from("sales")
      .select("recorrencia_id,sale_type")
      .in("sale_type", ["recorrencia", "boleto_recorrente"])
      .not("recorrencia_id", "is", null);

    const recTypeMap = new Map<string, string>();
    for (const s of (salesData ?? []) as any[]) {
      if (s.recorrencia_id && !recTypeMap.has(s.recorrencia_id)) {
        recTypeMap.set(s.recorrencia_id, s.sale_type);
      }
    }

    const enriched = ((recData as any) ?? []).map((r: any) => ({
      ...r,
      sale_type: recTypeMap.get(r.id) ?? "recorrencia",
    }));

    setRows(enriched);
    setLoading(false);
  }

  useEffect(() => { if (isAdmin) fetchAll(); }, [isAdmin]);

  async function registerPayment(rec: RecRow) {
    const isBoleto = rec.sale_type === "boleto_recorrente";
    const ok = window.confirm(`Registrar pagamento desta mensalidade${isBoleto ? " (boleto)" : ""}?`);
    if (!ok) return;
    try {
      const price = Number(rec.price_per_installment ?? 0);
      const nextDone = Number(rec.installments_done ?? 0) + 1;
      const total = Number(rec.installments_total ?? 0);
      let nextStatus = normalizeRecStatus(rec.status);
      if (nextDone >= total) nextStatus = "finalizado";

      // Busca o vendedor da venda original para creditar em todas as parcelas
      const { data: originalSale } = await supabase
        .from("sales")
        .select("seller_name")
        .eq("recorrencia_id", rec.id)
        .order("closed_at", { ascending: true })
        .limit(1)
        .single();

      const sellerName = originalSale?.seller_name ?? null;

      const { error: saleError } = await supabase.from("sales").insert({
        lead_id: rec.lead_id,
        recorrencia_id: rec.id,
        sale_type: isBoleto ? "boleto_recorrente" : "recorrencia",
        procedure: isBoleto ? "Mensalidade boleto" : "Mensalidade recorrente",
        value: price,
        value_gross: price,
        value_net: price,
        fee_percent: 0,
        payment_method: isBoleto ? "boleto" : "cartao_recorrente",
        installments_label: "À vista",
        seller_name: sellerName,
        closed_at: new Date().toISOString(),
      });
      if (saleError) throw saleError;

      const { error: recError } = await supabase
        .from("recorrencias")
        .update({ installments_done: nextDone, status: nextStatus })
        .eq("id", rec.id);
      if (recError) throw recError;

      await fetchAll();
    } catch (e: any) {
      setDebugError(e?.message || e?.error_description || e?.details || JSON.stringify(e));
    }
  }

  async function cancelRec(rec: RecRow) {
    const nome = rec.leads?.name ?? "este cliente";
    const ok = window.confirm(`Cancelar a recorrência de ${nome}? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    try {
      const { error } = await supabase.from("recorrencias").update({ status: "finalizado" }).eq("id", rec.id);
      if (error) throw error;
      await fetchAll();
    } catch (e: any) {
      setDebugError(e?.message || e?.details || JSON.stringify(e));
    }
  }

  async function reativarRec(rec: RecRow) {
    const nome = rec.leads?.name ?? "este cliente";
    const ok = window.confirm(`Reativar a recorrência de ${nome}?`);
    if (!ok) return;
    try {
      const { error } = await supabase.from("recorrencias").update({ status: "ativo" }).eq("id", rec.id);
      if (error) throw error;
      await fetchAll();
    } catch (e: any) {
      setDebugError(e?.message || e?.details || JSON.stringify(e));
    }
  }

  function openEdit(rec: RecRow) {
    setEditRec(rec);
    setEditForm({
      start_date: rec.start_date ?? "",
      installments_total: String(rec.installments_total ?? ""),
      installments_done: String(rec.installments_done ?? ""),
      price_per_installment: String(rec.price_per_installment ?? ""),
    });
  }

  function closeEdit() { setEditRec(null); setEditForm(null); }

  async function saveEdit() {
    if (!editRec || !editForm) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("recorrencias")
        .update({
          start_date: editForm.start_date,
          installments_total: Number(editForm.installments_total),
          installments_done: Number(editForm.installments_done),
          price_per_installment: parseFloat(editForm.price_per_installment.replace(",", ".")),
        })
        .eq("id", editRec.id);
      if (error) throw error;
      closeEdit();
      await fetchAll();
    } catch (e: any) {
      alert("Erro ao salvar: " + (e?.message || e?.details || JSON.stringify(e)));
    } finally {
      setSaving(false);
    }
  }

  const computed = useMemo(() => {
    const now = new Date();
    return rows.map((r) => {
      const start = parseYMD(r.start_date);
      const total = Number(r.installments_total || 0);
      const done = Number(r.installments_done || 0);
      const nextPayment = addMonths(start, done);
      const finalPayment = addMonths(start, Math.max(total - 1, 0));
      const cancelFrom = addDays(finalPayment, 1);
      const cancelUntil = addDays(addMonths(finalPayment, 1), -2);
      const daysToNext = Math.ceil((nextPayment.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      let paymentStatus = "em dia";
      if (daysToNext < 0) paymentStatus = "atrasado";
      else if (daysToNext <= 3) paymentStatus = "vence em breve";

      const normalizedStatus = normalizeRecStatus(r.status);
      const isCompleted = done >= total && total > 0;
      const isCancelled = normalizedStatus === "finalizado" && !isCompleted;
      const isConcluded = normalizedStatus === "finalizado" && isCompleted;
      const isBoleto = r.sale_type === "boleto_recorrente";

      return {
        r, nextPayment, finalPayment, cancelFrom, cancelUntil,
        daysToNext, paymentStatus, normalizedStatus,
        isCompleted, isCancelled, isConcluded, isBoleto,
      };
    });
  }, [rows]);

  const cartaoAtivas = useMemo(() => computed.filter(x => x.normalizedStatus === "ativo" && !x.isBoleto), [computed]);
  const boletoAtivas = useMemo(() => computed.filter(x => x.normalizedStatus === "ativo" && x.isBoleto), [computed]);
  const canceladas = useMemo(() => computed.filter(x => x.isCancelled || x.isConcluded), [computed]);

  if (loadingRole) return <div style={{ padding: 20, color: "white" }}>Carregando permissões...</div>;
  if (!isAdmin) return null;

  const renderTable = (items: typeof computed, isCancelledTab = false) => (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", paddingBottom: 10 }}>Cliente</th>
          <th style={thCenter}>Parcelas</th>
          <th style={thCenter}>Mensal</th>
          {!isCancelledTab && <th style={thCenter}>Próx pagamento</th>}
          {!isCancelledTab && <th style={thCenter}>Último pagamento</th>}
          {!isCancelledTab && <th style={thCenter}>Cancelar recorrência</th>}
          {isCancelledTab && <th style={thCenter}>Tipo</th>}
          {isCancelledTab && <th style={thCenter}>Status</th>}
          <th style={thCenter}>Ação</th>
        </tr>
      </thead>
      <tbody>
        {items.map((x) => {
          const leadName = x.r.leads?.name ?? "—";
          const phone = normalizePhoneReadable(x.r.leads?.phone_raw ?? null, x.r.leads?.phone_e164 ?? null);
          return (
            <tr key={x.r.id} style={{ opacity: isCancelledTab ? 0.7 : 1 }}>
              <td style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)", textAlign: "left", verticalAlign: "top" }}>
                <div style={{ fontWeight: 900 }}>{leadName}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{phone}</div>
              </td>
              <td style={tdCenter}>{x.r.installments_done} / {x.r.installments_total}</td>
              <td style={tdCenter}>{formatBRL(x.r.price_per_installment)}</td>

              {!isCancelledTab && (
                <td style={tdCenter}>
                  {x.isCompleted ? (
                    <div style={{ opacity: 0.7 }}>Concluído</div>
                  ) : (
                    <>
                      <div style={{ fontWeight: 900 }}>{formatDateBR(x.nextPayment)}</div>
                      {x.paymentStatus === "atrasado" && <div style={{ color: "#ff7aa0", fontSize: 12 }}>⚠️ Atrasado {Math.abs(x.daysToNext)} dia(s)</div>}
                      {x.paymentStatus === "vence em breve" && <div style={{ color: "#ffc878", fontSize: 12 }}>⏳ Vence em {x.daysToNext} dia(s)</div>}
                    </>
                  )}
                </td>
              )}
              {!isCancelledTab && <td style={tdCenter}><div style={{ fontWeight: 900 }}>{formatDateBR(x.finalPayment)}</div></td>}
              {!isCancelledTab && (
                <td style={tdCenter}>
                  <div style={{ fontWeight: 900 }}>{formatDateBR(x.cancelFrom)}</div>
                  <div style={{ fontSize: 12, opacity: 0.72 }}>até {formatDateBR(x.cancelUntil)}</div>
                </td>
              )}

              {isCancelledTab && (
                <td style={tdCenter}>
                  <div style={{
                    display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                    background: x.isBoleto ? "rgba(255,200,80,0.12)" : "rgba(120,180,255,0.12)",
                    border: x.isBoleto ? "1px solid rgba(255,200,80,0.3)" : "1px solid rgba(120,180,255,0.3)",
                    color: x.isBoleto ? "#ffc850" : "#78b4ff",
                  }}>
                    {x.isBoleto ? "Boleto" : "Cartão"}
                  </div>
                </td>
              )}
              {isCancelledTab && (
                <td style={tdCenter}>
                  <div style={{
                    display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                    background: x.isConcluded ? "rgba(120,255,180,0.12)" : "rgba(255,120,120,0.12)",
                    border: x.isConcluded ? "1px solid rgba(120,255,180,0.3)" : "1px solid rgba(255,120,120,0.3)",
                    color: x.isConcluded ? "#78ffb4" : "#ff7878",
                  }}>
                    {x.isConcluded ? "Concluído" : "Cancelado"}
                  </div>
                </td>
              )}

              <td style={tdCenter}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                  {!isCancelledTab && (
                    <>
                      {x.normalizedStatus === "ativo" && !x.isCompleted && (
                        <button
                          style={{
                            background: x.isBoleto ? "rgba(255,200,80,0.15)" : "rgba(180,120,255,0.15)",
                            border: x.isBoleto ? "1px solid rgba(255,200,80,0.35)" : "1px solid rgba(180,120,255,0.35)",
                            color: "white", padding: "4px 7px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700,
                          }}
                          onClick={() => registerPayment(x.r)}
                        >
                          {x.isBoleto ? "Registrar boleto" : "Registrar pagamento"}
                        </button>
                      )}
                      <div style={{ display: "flex", gap: 4 }}>
                        <button style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "white", padding: "4px 7px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700 }} onClick={() => openEdit(x.r)}>Editar</button>
                        <button style={{ background: "rgba(255,80,80,0.12)", border: "1px solid rgba(255,80,80,0.3)", color: "#ff8080", padding: "4px 7px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700 }} onClick={() => cancelRec(x.r)}>Cancelar</button>
                      </div>
                    </>
                  )}
                  {isCancelledTab && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                      {x.isCancelled && (
                        <button style={{ background: "rgba(120,255,180,0.10)", border: "1px solid rgba(120,255,180,0.25)", color: "#78ffb4", padding: "4px 7px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700 }} onClick={() => reativarRec(x.r)}>Reativar</button>
                      )}
                      <button style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "white", padding: "4px 7px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700 }} onClick={() => openEdit(x.r)}>Editar</button>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
        {!items.length && (
          <tr>
            <td colSpan={8} style={{ paddingTop: 12, opacity: 0.7 }}>
              {isCancelledTab ? "Nenhuma recorrência cancelada ou concluída." : "Nenhuma recorrência nesta categoria."}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  const tabBtn = (tab: TabType): React.CSSProperties => ({
    background: activeTab === tab ? "rgba(180,120,255,0.2)" : "rgba(255,255,255,0.05)",
    border: activeTab === tab ? "1px solid rgba(180,120,255,0.4)" : "1px solid rgba(255,255,255,0.12)",
    color: "white", padding: "8px 18px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13,
  });

  return (
    <div style={{ padding: 16, color: "white" }}>
      {editRec && editForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#1a1625", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18, padding: 28, width: "100%", maxWidth: 420 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 20 }}>Editar — {editRec.leads?.name ?? "—"}</div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Data de início</label>
              <input type="date" style={inputStyle} value={editForm.start_date} onChange={e => setEditForm({ ...editForm, start_date: e.target.value })} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Valor mensal (R$)</label>
              <input type="number" step="0.01" style={inputStyle} value={editForm.price_per_installment} onChange={e => setEditForm({ ...editForm, price_per_installment: e.target.value })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Total de parcelas</label>
                <input type="number" min="1" style={inputStyle} value={editForm.installments_total} onChange={e => setEditForm({ ...editForm, installments_total: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Parcelas pagas</label>
                <input type="number" min="0" style={inputStyle} value={editForm.installments_done} onChange={e => setEditForm({ ...editForm, installments_done: e.target.value })} />
              </div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 20, lineHeight: 1.5 }}>
              Para corrigir a data de uma parcela, ajuste a Data de início e Parcelas pagas.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={closeEdit} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "white", padding: "8px 18px", borderRadius: 9, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={saveEdit} disabled={saving} style={{ background: "rgba(180,120,255,0.2)", border: "1px solid rgba(180,120,255,0.4)", color: "white", padding: "8px 18px", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", borderRadius: 18, padding: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>Recorrências</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <button style={tabBtn("cartao")} onClick={() => setActiveTab("cartao")}>
            Cartão ({cartaoAtivas.length})
          </button>
          <button style={tabBtn("boleto")} onClick={() => setActiveTab("boleto")}>
            Boleto ({boletoAtivas.length})
          </button>
          <button style={tabBtn("canceladas")} onClick={() => setActiveTab("canceladas")}>
            Canceladas / Concluídas ({canceladas.length})
          </button>
        </div>

        {debugError && (
          <div style={{ background: "rgba(255,80,80,0.15)", border: "1px solid rgba(255,80,80,0.4)", borderRadius: 12, padding: 14, marginBottom: 16, color: "#ff8080", whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 13 }}>
            <strong>Erro:</strong><br />{debugError}<br /><br />
            <button onClick={() => setDebugError(null)} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white", padding: "4px 10px", borderRadius: 8, cursor: "pointer" }}>Fechar</button>
          </div>
        )}

        {loading ? (
          <div style={{ opacity: 0.7, padding: 12 }}>Carregando...</div>
        ) : (
          <>
            {activeTab === "cartao" && renderTable(cartaoAtivas, false)}
            {activeTab === "boleto" && renderTable(boletoAtivas, false)}
            {activeTab === "canceladas" && renderTable(canceladas, true)}
          </>
        )}
      </div>
    </div>
  );
}
