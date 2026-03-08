"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "../_hooks/useAdminAccess";
import SelectDark from "../_components/SelectDark";

type LeadRow = {
  id: string;
  name: string;
  phone_raw: string | null;
  phone_e164?: string | null;
};

type RecorrenciaJoin = {
  id: string;
  status: string | null;
  start_date: string | null;
  installments_total: number | null;
};

type SaleRow = {
  id: string;
  lead_id: string;
  recorrencia_id: string | null;
  value: number | null;
  value_gross: number | null;
  value_net: number | null;
  fee_percent: number | null;
  payment_method: string | null;
  installments_label: string | null;
  sale_type: string | null;
  seller_name: string | null;
  source: string | null;
  procedure: string | null;
  notes: string | null;
  closed_at: string | null;
  leads?: LeadRow | null;
  recorrencias?: RecorrenciaJoin | null;
};

function formatDateBR(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatBRL(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function normalizePhoneReadable(raw: string | null, e164: string | null) {
  return (raw && raw.trim()) || (e164 && e164.trim()) || "";
}

function todayInputValue() {
  const dt = new Date();
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseInstallmentsTotal(label: string) {
  if (!label || label === "À vista") return 1;
  const match = label.match(/^(\d+)x$/i);
  if (!match) return 1;
  return Number(match[1] ?? 1);
}

function toNumberOrZero(v: string | number | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  outline: "none",
  fontSize: 13,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 6,
  opacity: 0.85,
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

function chipStyle(kind: "primary" | "muted" = "muted"): React.CSSProperties {
  return {
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 999,
    border:
      kind === "primary"
        ? "1px solid rgba(180,120,255,0.35)"
        : "1px solid rgba(255,255,255,0.10)",
    background:
      kind === "primary"
        ? "rgba(180,120,255,0.12)"
        : "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.90)",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    lineHeight: "16px",
    whiteSpace: "nowrap",
  };
}

const smallBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "white",
  padding: "5px 8px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1.1,
};

const dangerBtn: React.CSSProperties = {
  ...smallBtn,
  border: "1px solid rgba(255,120,120,0.28)",
  background: "rgba(255,120,120,0.10)",
};

export default function VendasPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [leadId, setLeadId] = useState("");
  const [procedure, setProcedure] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [installmentsLabel, setInstallmentsLabel] = useState("À vista");
  const [saleType, setSaleType] = useState("avulsa");
  const [grossValue, setGrossValue] = useState("");
  const [netValue, setNetValue] = useState("");
  const [feePercentValue, setFeePercentValue] = useState("");
  const [closedAt, setClosedAt] = useState(todayInputValue());
  const [sellerName, setSellerName] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");

  const [createRecorrencia, setCreateRecorrencia] = useState(false);
  const [recStatus, setRecStatus] = useState("ativo");

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [loadingRole, isAdmin, router]);

  async function fetchSales() {
    setLoading(true);

    const { data, error } = await supabase
      .from("sales")
      .select(
        "id,lead_id,recorrencia_id,value,value_gross,value_net,fee_percent,payment_method,installments_label,sale_type,seller_name,source,procedure,notes,closed_at,leads(id,name,phone_raw,phone_e164),recorrencias(id,status,start_date,installments_total)"
      )
      .order("closed_at", { ascending: false });

    if (error) {
      console.error(error);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data as any) ?? []);
    setLoading(false);
  }

  async function fetchLeads() {
    const { data, error } = await supabase
      .from("leads")
      .select("id,name,phone_raw,phone_e164")
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      setLeads([]);
      return;
    }

    setLeads((data as LeadRow[]) ?? []);
  }

  useEffect(() => {
    if (isAdmin) {
      fetchSales();
      fetchLeads();
    }
  }, [isAdmin]);

  const total = useMemo(() => {
    return rows.reduce((sum, r) => sum + Number(r.value ?? 0), 0);
  }, [rows]);

  function handleGrossChange(nextGrossRaw: string) {
    setGrossValue(nextGrossRaw);

    const nextGross = toNumberOrZero(nextGrossRaw);
    const currentNet = toNumberOrZero(netValue);
    const currentFee = toNumberOrZero(feePercentValue);

    if (!nextGross || nextGross <= 0) return;

    if (currentNet > 0) {
      const pct = ((nextGross - currentNet) / nextGross) * 100;
      setFeePercentValue(Number.isFinite(pct) ? pct.toFixed(2) : "");
      return;
    }

    if (currentFee >= 0 && feePercentValue !== "") {
      const calculatedNet = nextGross * (1 - currentFee / 100);
      setNetValue(calculatedNet.toFixed(2));
    }
  }

  function handleNetChange(nextNetRaw: string) {
    setNetValue(nextNetRaw);

    const gross = toNumberOrZero(grossValue);
    const nextNet = toNumberOrZero(nextNetRaw);

    if (!gross || gross <= 0 || nextNet < 0) {
      setFeePercentValue("");
      return;
    }

    const pct = ((gross - nextNet) / gross) * 100;
    setFeePercentValue(Number.isFinite(pct) ? pct.toFixed(2) : "");
  }

  function handleFeePercentChange(nextFeeRaw: string) {
    setFeePercentValue(nextFeeRaw);

    const gross = toNumberOrZero(grossValue);
    const nextFee = toNumberOrZero(nextFeeRaw);

    if (!gross || gross <= 0 || nextFee < 0) return;

    const calculatedNet = gross * (1 - nextFee / 100);
    setNetValue(calculatedNet.toFixed(2));
  }

  function resetForm() {
    setEditingId(null);
    setLeadId("");
    setProcedure("");
    setPaymentMethod("pix");
    setInstallmentsLabel("À vista");
    setSaleType("avulsa");
    setGrossValue("");
    setNetValue("");
    setFeePercentValue("");
    setClosedAt(todayInputValue());
    setSellerName("");
    setSource("");
    setNotes("");
    setCreateRecorrencia(false);
    setRecStatus("ativo");
    setErrorMsg("");
  }

  function startEdit(row: SaleRow) {
    setEditingId(row.id);
    setLeadId(row.lead_id || "");
    setProcedure(row.procedure || "");
    setPaymentMethod(row.payment_method || "pix");
    setInstallmentsLabel(row.installments_label || "À vista");
    setSaleType(row.sale_type === "recorrencia" ? "recorrencia" : "avulsa");
    setGrossValue(String(row.value_gross ?? row.value ?? ""));
    setNetValue(String(row.value_net ?? row.value ?? ""));
    setFeePercentValue(String(row.fee_percent ?? ""));
    setClosedAt(row.closed_at ? String(row.closed_at).slice(0, 10) : todayInputValue());
    setSellerName(row.seller_name || "");
    setSource(row.source || "");
    setNotes(row.notes || "");
    setCreateRecorrencia(Boolean(row.recorrencia_id));
    setRecStatus(row.recorrencias?.status || "ativo");
    setErrorMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(row: SaleRow) {
    const ok = window.confirm("Excluir esta venda?");
    if (!ok) return;

    setDeletingId(row.id);
    setErrorMsg("");

    try {
      const recorrenciaId = row.recorrencia_id;

      const { error: saleDeleteError } = await supabase
        .from("sales")
        .delete()
        .eq("id", row.id);

      if (saleDeleteError) throw saleDeleteError;

      if (recorrenciaId) {
        const { count, error: countError } = await supabase
          .from("sales")
          .select("id", { count: "exact", head: true })
          .eq("recorrencia_id", recorrenciaId);

        if (countError) throw countError;

        if ((count ?? 0) === 0) {
          const { error: recDeleteError } = await supabase
            .from("recorrencias")
            .delete()
            .eq("id", recorrenciaId);

          if (recDeleteError) throw recDeleteError;
        }
      }

      if (editingId === row.id) {
        resetForm();
      }

      await fetchSales();
      await fetchLeads();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Erro ao excluir venda.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    const gross = Number(grossValue || 0);
    const net = Number(netValue || grossValue || 0);
    const feePercent =
      gross > 0 ? Number((((gross - net) / gross) * 100).toFixed(2)) : 0;
    const shouldCreateOrKeepRecorrencia =
      saleType === "recorrencia" || createRecorrencia;

    if (!leadId) {
      setErrorMsg("Selecione o cliente.");
      return;
    }

    if (!procedure.trim()) {
      setErrorMsg("Informe o procedimento.");
      return;
    }

    if (!paymentMethod.trim()) {
      setErrorMsg("Informe a forma de pagamento.");
      return;
    }

    if (!closedAt) {
      setErrorMsg("Informe a data.");
      return;
    }

    if (!gross || gross <= 0) {
      setErrorMsg("Informe um valor bruto válido.");
      return;
    }

    if (!net || net <= 0) {
      setErrorMsg("Informe um valor líquido válido.");
      return;
    }

    setSaving(true);

    try {
      let recorrenciaId: string | null =
        rows.find((x) => x.id === editingId)?.recorrencia_id ?? null;

      if (shouldCreateOrKeepRecorrencia) {
        const installmentsTotal = parseInstallmentsTotal(installmentsLabel);
        const pricePerInstallment =
          installmentsTotal > 0 ? gross / installmentsTotal : gross;

        if (recorrenciaId) {
          const { error: recUpdateError } = await supabase
            .from("recorrencias")
            .update({
              lead_id: leadId,
              status: recStatus,
              start_date: closedAt,
              installments_total: installmentsTotal,
              price_per_installment: Number(pricePerInstallment.toFixed(2)),
            })
            .eq("id", recorrenciaId);

          if (recUpdateError) throw recUpdateError;
        } else {
          const { data: recData, error: recError } = await supabase
            .from("recorrencias")
            .insert({
              lead_id: leadId,
              status: recStatus,
              start_date: closedAt,
              installments_total: installmentsTotal,
              installments_done: 1,
              price_per_installment: Number(pricePerInstallment.toFixed(2)),
            })
            .select("id")
            .single();

          if (recError) throw recError;
          recorrenciaId = recData?.id ?? null;
        }
      } else if (editingId && recorrenciaId) {
        const { count, error: countError } = await supabase
          .from("sales")
          .select("id", { count: "exact", head: true })
          .eq("recorrencia_id", recorrenciaId);

        if (countError) throw countError;

        if ((count ?? 0) <= 1) {
          const { error: recDeleteError } = await supabase
            .from("recorrencias")
            .delete()
            .eq("id", recorrenciaId);

          if (recDeleteError) throw recDeleteError;
        }

        recorrenciaId = null;
      }

      const payload = {
        lead_id: leadId,
        recorrencia_id: recorrenciaId,
        sale_type: shouldCreateOrKeepRecorrencia ? "recorrencia" : "avulsa",
        procedure: procedure.trim(),
        value: gross,
        value_gross: gross,
        value_net: net,
        fee_percent: feePercent,
        payment_method: paymentMethod.trim(),
        installments_label: installmentsLabel,
        seller_name: sellerName.trim() || null,
        source: source.trim() || null,
        notes: notes.trim() || null,
        closed_at: closedAt,
      };

      if (editingId) {
        const { error: saleUpdateError } = await supabase
          .from("sales")
          .update(payload)
          .eq("id", editingId);

        if (saleUpdateError) throw saleUpdateError;
      } else {
        const { error: saleInsertError } = await supabase
          .from("sales")
          .insert(payload);

        if (saleInsertError) throw saleInsertError;
      }

      resetForm();
      await fetchSales();
      await fetchLeads();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Erro ao salvar venda.");
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

  if (!isAdmin) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: 14, padding: 16, color: "white" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 0.2 }}>
            Vendas
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {loading ? (
              <span style={chipStyle("primary")}>Carregando…</span>
            ) : (
              <span style={chipStyle("muted")}>
                Total: {formatBRL(total)}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/leads/new" style={btnPrimary}>
            + Novo lead
          </Link>
        </div>
      </div>

      <form
        onSubmit={handleSave}
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)",
          borderRadius: 18,
          padding: 14,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 900,
            marginBottom: 14,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span>{editingId ? "Editar venda" : "Nova venda"}</span>

          {editingId ? (
            <button type="button" onClick={resetForm} style={smallBtn}>
              Cancelar edição
            </button>
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Cliente</label>
            <SelectDark
              value={leadId}
              onChange={setLeadId}
              placeholder="Selecione"
              searchable
              minWidth={220}
              options={[
                { value: "", label: "Selecione" },
                ...leads.map((lead) => ({
                  value: lead.id,
                  label: `${lead.name}${
                    normalizePhoneReadable(
                      lead.phone_raw ?? null,
                      lead.phone_e164 ?? null
                    )
                      ? ` - ${normalizePhoneReadable(
                          lead.phone_raw ?? null,
                          lead.phone_e164 ?? null
                        )}`
                      : ""
                  }`,
                })),
              ]}
            />
          </div>

          <div>
            <label style={labelStyle}>Tipo</label>
            <SelectDark
              value={saleType}
              onChange={setSaleType}
              placeholder="Tipo"
              searchable={false}
              minWidth={160}
              options={[
                { value: "avulsa", label: "Avulsa" },
                { value: "recorrencia", label: "Recorrência" },
              ]}
            />
          </div>

          <div>
            <label style={labelStyle}>Data</label>
            <input
              type="date"
              value={closedAt}
              onChange={(e) => setClosedAt(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Procedimento</label>
            <input
              value={procedure}
              onChange={(e) => setProcedure(e.target.value)}
              style={inputStyle}
              placeholder="Ex.: Botox 3 áreas"
            />
          </div>

          <div>
            <label style={labelStyle}>Pagamento</label>
            <SelectDark
              value={paymentMethod}
              onChange={setPaymentMethod}
              placeholder="Pagamento"
              searchable={false}
              minWidth={160}
              options={[
                { value: "pix", label: "Pix" },
                { value: "cartao", label: "Cartão" },
                { value: "cartao_recorrente", label: "Cartão Recorrente" },
                { value: "debito", label: "Débito" },
                { value: "dinheiro", label: "Dinheiro" },
                { value: "boleto", label: "Boleto" },
              ]}
            />
          </div>

          <div>
            <label style={labelStyle}>Parcelas</label>
            <SelectDark
              value={installmentsLabel}
              onChange={setInstallmentsLabel}
              placeholder="Parcelas"
              searchable={false}
              minWidth={160}
              options={[
                { value: "À vista", label: "À vista" },
                ...Array.from({ length: 18 }).map((_, i) => {
                  const n = i + 1;
                  return {
                    value: `${n}x`,
                    label: `${n}x`,
                  };
                }),
              ]}
            />
          </div>

          <div>
            <label style={labelStyle}>Valor bruto</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={grossValue}
              onChange={(e) => handleGrossChange(e.target.value)}
              style={inputStyle}
              placeholder="0,00"
            />
          </div>

          <div>
            <label style={labelStyle}>Valor líquido</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={netValue}
              onChange={(e) => handleNetChange(e.target.value)}
              style={inputStyle}
              placeholder="0,00"
            />
          </div>

          <div>
            <label style={labelStyle}>Taxa (%)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={feePercentValue}
              onChange={(e) => handleFeePercentChange(e.target.value)}
              style={inputStyle}
              placeholder="0,00"
            />
          </div>

          <div>
            <label style={labelStyle}>Vendedor</label>
            <input
              value={sellerName}
              onChange={(e) => setSellerName(e.target.value)}
              style={inputStyle}
              placeholder="Nome"
            />
          </div>

          <div>
            <label style={labelStyle}>Origem</label>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              style={inputStyle}
              placeholder="Meta, indicação..."
            />
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Observações</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={inputStyle}
              placeholder="Observações da venda"
            />
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
          }}
        >
          <input
            id="create-recorrencia"
            type="checkbox"
            checked={createRecorrencia}
            onChange={(e) => setCreateRecorrencia(e.target.checked)}
          />
          <label htmlFor="create-recorrencia" style={{ cursor: "pointer" }}>
            Criar recorrência junto com esta venda
          </label>
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
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 14,
          }}
        >
          {editingId ? (
            <button type="button" onClick={resetForm} style={smallBtn}>
              Cancelar
            </button>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            style={{
              ...smallBtn,
              opacity: saving ? 0.7 : 1,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Salvando..." : editingId ? "Salvar edição" : "Salvar venda"}
          </button>
        </div>
      </form>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)",
          borderRadius: 18,
          padding: 14,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 900,
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Vendas</span>
          <span>{formatBRL(total)}</span>
        </div>

        {loading ? (
          <div>Carregando...</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", paddingBottom: 10 }}>Cliente</th>
                <th style={{ textAlign: "left", paddingBottom: 10 }}>Procedimento</th>
                <th style={{ textAlign: "left", paddingBottom: 10 }}>Pagamento</th>
                <th style={{ textAlign: "left", paddingBottom: 10 }}>Valor</th>
                <th style={{ textAlign: "left", paddingBottom: 10 }}>Data</th>
                <th style={{ textAlign: "left", paddingBottom: 10 }}>Ações</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const leadName = r.leads?.name ?? "—";
                const phone = normalizePhoneReadable(
                  r.leads?.phone_raw ?? null,
                  r.leads?.phone_e164 ?? null
                );

                return (
                  <tr key={r.id}>
                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{leadName}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{phone}</div>
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div>{r.procedure ?? "—"}</div>
                      {r.recorrencia_id ? (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          Vinculada à recorrência
                        </div>
                      ) : null}
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div>{r.payment_method ?? "—"}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {r.installments_label ?? "—"}
                      </div>
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div>{formatBRL(r.value)}</div>
                      {r.value_net != null ? (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          Líq. {formatBRL(r.value_net)}
                        </div>
                      ) : null}
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {formatDateBR(r.closed_at)}
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          style={smallBtn}
                          onClick={() => startEdit(r)}
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          style={dangerBtn}
                          disabled={deletingId === r.id}
                          onClick={() => handleDelete(r)}
                        >
                          {deletingId === r.id ? "Excluindo..." : "Excluir"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!rows.length ? (
                <tr>
                  <td colSpan={6} style={{ paddingTop: 12, opacity: 0.7 }}>
                    Nenhuma venda encontrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}