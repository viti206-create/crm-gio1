"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
  indicated_client?: string | null;
  indicated_professional?: string | null;
  closed_at: string | null;
  leads?: LeadRow | null;
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

function normalizePaymentLabel(v: string | null | undefined) {
  const key = String(v ?? "").trim().toLowerCase();
  if (key === "pix") return "Pix";
  if (key === "cartao") return "Cartão";
  if (key === "cartao_recorrente") return "Cartão recorrente";
  if (key === "debito") return "Débito";
  if (key === "dinheiro") return "Dinheiro";
  if (key === "boleto") return "Boleto";
  return v || "—";
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

function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const parts = value.split(";");
  const lastPart = parts[parts.length - 1].trim().toLowerCase();

  const filtered = useMemo(() => {
    const uniq = new Map<string, string>();

    for (const item of suggestions) {
      const clean = String(item || "").trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (!uniq.has(key)) uniq.set(key, clean);
    }

    return Array.from(uniq.values())
      .filter((item) => {
        if (!lastPart) return true;
        return item.toLowerCase().includes(lastPart);
      })
      .slice(0, 8);
  }, [suggestions, lastPart]);

  function insertSuggestion(s: string) {
    const arr = value.split(";");
    arr[arr.length - 1] = " " + s;
    onChange(arr.join(";").replace(/^ /, ""));
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        style={{
          ...inputStyle,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.06)",
        }}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />

      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            zIndex: 60,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(10,10,14,0.96)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.65)",
            overflow: "hidden",
          }}
        >
          {filtered.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => insertSuggestion(item)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                cursor: "pointer",
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.92)",
                fontWeight: 850,
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VendasPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const [procedureSuggestions, setProcedureSuggestions] = useState<string[]>([]);
  const [sourceSuggestions, setSourceSuggestions] = useState<string[]>([]);
  const [sellerSuggestions, setSellerSuggestions] = useState<string[]>([]);
  const [indicatedClientSuggestions, setIndicatedClientSuggestions] = useState<
    string[]
  >([]);
  const [
    indicatedProfessionalSuggestions,
    setIndicatedProfessionalSuggestions,
  ] = useState<string[]>([]);

  const [leadId, setLeadId] = useState("");
  const [procedure, setProcedure] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [installmentsLabel, setInstallmentsLabel] = useState("À vista");
  const [saleType, setSaleType] = useState("avulsa");

  const [grossValue, setGrossValue] = useState("");
  const [netValue, setNetValue] = useState("");
  const [feePercentInput, setFeePercentInput] = useState("");

  const [closedAt, setClosedAt] = useState(todayInputValue());
  const [sellerName, setSellerName] = useState("");
  const [source, setSource] = useState("");
  const [indicatedClient, setIndicatedClient] = useState("");
  const [indicatedProfessional, setIndicatedProfessional] = useState("");
  const [notes, setNotes] = useState("");

  const [lastEditedField, setLastEditedField] = useState<"net" | "percent" | null>(
    null
  );

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
        "id,lead_id,recorrencia_id,value,value_gross,value_net,fee_percent,payment_method,installments_label,sale_type,seller_name,source,procedure,notes,indicated_client,indicated_professional,closed_at,leads(id,name,phone_raw,phone_e164)"
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

  async function fetchSuggestions() {
    const { data, error } = await supabase
      .from("sales")
      .select(
        "procedure,source,seller_name,indicated_client,indicated_professional"
      );

    if (error) {
      console.error(error);
      setProcedureSuggestions([]);
      setSourceSuggestions([]);
      setSellerSuggestions([]);
      setIndicatedClientSuggestions([]);
      setIndicatedProfessionalSuggestions([]);
      return;
    }

    const rows = (data ?? []) as Array<{
      procedure: string | null;
      source: string | null;
      seller_name: string | null;
      indicated_client: string | null;
      indicated_professional: string | null;
    }>;

    const splitProcedures = rows
      .flatMap((r) =>
        String(r.procedure ?? "")
          .split(";")
          .map((x) => x.trim())
          .filter(Boolean)
      )
      .filter(Boolean);

    const procedureUnique = Array.from(
      new Map(splitProcedures.map((item) => [item.toLowerCase(), item])).values()
    ).sort((a, b) => a.localeCompare(b));

    const sourceUnique = Array.from(
      new Map(
        rows
          .map((r) => String(r.source ?? "").trim())
          .filter(Boolean)
          .map((item) => [item.toLowerCase(), item])
      ).values()
    ).sort((a, b) => a.localeCompare(b));

    const sellerUnique = Array.from(
      new Map(
        rows
          .map((r) => String(r.seller_name ?? "").trim())
          .filter(Boolean)
          .map((item) => [item.toLowerCase(), item])
      ).values()
    ).sort((a, b) => a.localeCompare(b));

    const indicatedClientUnique = Array.from(
      new Map(
        rows
          .map((r) => String(r.indicated_client ?? "").trim())
          .filter(Boolean)
          .map((item) => [item.toLowerCase(), item])
      ).values()
    ).sort((a, b) => a.localeCompare(b));

    const indicatedProfessionalUnique = Array.from(
      new Map(
        rows
          .map((r) => String(r.indicated_professional ?? "").trim())
          .filter(Boolean)
          .map((item) => [item.toLowerCase(), item])
      ).values()
    ).sort((a, b) => a.localeCompare(b));

    setProcedureSuggestions(procedureUnique);
    setSourceSuggestions(sourceUnique);
    setSellerSuggestions(sellerUnique);
    setIndicatedClientSuggestions(indicatedClientUnique);
    setIndicatedProfessionalSuggestions(indicatedProfessionalUnique);
  }

  useEffect(() => {
    if (isAdmin) {
      fetchSales();
      fetchLeads();
      fetchSuggestions();
    }
  }, [isAdmin]);

  const total = useMemo(() => {
    return rows.reduce((sum, r) => sum + Number(r.value ?? 0), 0);
  }, [rows]);

  useEffect(() => {
    const gross = Number(grossValue || 0);
    if (!gross || gross <= 0) {
      if (!grossValue) {
        setNetValue("");
        setFeePercentInput("");
      }
      return;
    }

    if (lastEditedField === "net") {
      const net = Number(netValue || 0);
      if (!Number.isFinite(net)) return;
      const pct = ((gross - net) / gross) * 100;
      setFeePercentInput(Number.isFinite(pct) ? pct.toFixed(2) : "");
    }

    if (lastEditedField === "percent") {
      const pct = Number(feePercentInput || 0);
      if (!Number.isFinite(pct)) return;
      const calculatedNet = gross * (1 - pct / 100);
      setNetValue(Number.isFinite(calculatedNet) ? calculatedNet.toFixed(2) : "");
    }
  }, [grossValue, netValue, feePercentInput, lastEditedField]);

  const feePercentPreview = useMemo(() => {
    const gross = Number(grossValue || 0);
    const net = Number(netValue || 0);
    if (!gross || gross <= 0) return 0;
    const pct = ((gross - net) / gross) * 100;
    return Number.isFinite(pct) ? pct : 0;
  }, [grossValue, netValue]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    const gross = Number(grossValue || 0);
    const net = Number(netValue || 0);
    const installmentsTotal = parseInstallmentsTotal(installmentsLabel);

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
      const normalizedProcedure = procedure
        .split(";")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((item) => {
          const found = procedureSuggestions.find(
            (s) => s.trim().toLowerCase() === item.trim().toLowerCase()
          );
          return found ?? item;
        })
        .join("; ");

      const normalizedSource =
        sourceSuggestions.find(
          (s) => s.trim().toLowerCase() === source.trim().toLowerCase()
        ) ?? source.trim();

      const normalizedSeller =
        sellerSuggestions.find(
          (s) => s.trim().toLowerCase() === sellerName.trim().toLowerCase()
        ) ?? sellerName.trim();

      const normalizedIndicatedClient =
        indicatedClientSuggestions.find(
          (s) => s.trim().toLowerCase() === indicatedClient.trim().toLowerCase()
        ) ?? indicatedClient.trim();

      const normalizedIndicatedProfessional =
        indicatedProfessionalSuggestions.find(
          (s) =>
            s.trim().toLowerCase() === indicatedProfessional.trim().toLowerCase()
        ) ?? indicatedProfessional.trim();

      let recorrenciaId: string | null = null;

      if (saleType === "recorrencia") {
        const monthlyGross =
          installmentsTotal > 0 ? Number((gross / installmentsTotal).toFixed(2)) : gross;

        const { data: recData, error: recError } = await supabase
          .from("recorrencias")
          .insert({
            lead_id: leadId,
            status: "ativo",
            start_date: closedAt,
            installments_total: installmentsTotal,
            installments_done: 1,
            price_per_installment: monthlyGross,
          })
          .select("id")
          .single();

        if (recError) throw recError;
        recorrenciaId = recData?.id ?? null;
      }

      const feePercent =
        gross > 0 ? Number((((gross - net) / gross) * 100).toFixed(2)) : 0;

      const { error: saleError } = await supabase.from("sales").insert({
        lead_id: leadId,
        recorrencia_id: recorrenciaId,
        sale_type: saleType,
        procedure: normalizedProcedure,
        value: gross,
        value_gross: gross,
        value_net: net,
        fee_percent: feePercent,
        payment_method: paymentMethod.trim(),
        installments_label: installmentsLabel,
        seller_name: normalizedSeller || null,
        source: normalizedSource || null,
        indicated_client: normalizedIndicatedClient || null,
        indicated_professional: normalizedIndicatedProfessional || null,
        notes: notes.trim() || null,
        closed_at: closedAt,
      });

      if (saleError) throw saleError;

      setLeadId("");
      setProcedure("");
      setPaymentMethod("pix");
      setInstallmentsLabel("À vista");
      setSaleType("avulsa");
      setGrossValue("");
      setNetValue("");
      setFeePercentInput("");
      setClosedAt(todayInputValue());
      setSellerName("");
      setSource("");
      setIndicatedClient("");
      setIndicatedProfessional("");
      setNotes("");
      setLastEditedField(null);

      await fetchSales();
      await fetchLeads();
      await fetchSuggestions();
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
              <span style={chipStyle("muted")}>Total: {formatBRL(total)}</span>
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
          }}
        >
          Nova venda
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
            <SuggestInput
              value={procedure}
              onChange={setProcedure}
              suggestions={procedureSuggestions}
              placeholder="Ex.: Botox 3 áreas; Preenchimento labial"
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
                { value: "cartao_recorrente", label: "Cartão recorrente" },
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
              onChange={(e) => setGrossValue(e.target.value)}
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
              onChange={(e) => {
                setNetValue(e.target.value);
                setLastEditedField("net");
              }}
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
              value={feePercentInput}
              onChange={(e) => {
                setFeePercentInput(e.target.value);
                setLastEditedField("percent");
              }}
              style={inputStyle}
              placeholder="0,00"
            />
          </div>

          <div>
            <label style={labelStyle}>Vendedor</label>
            <SuggestInput
              value={sellerName}
              onChange={setSellerName}
              suggestions={sellerSuggestions}
              placeholder="Nome"
            />
          </div>

          <div>
            <label style={labelStyle}>Origem</label>
            <SuggestInput
              value={source}
              onChange={setSource}
              suggestions={sourceSuggestions}
              placeholder="Meta, indicação..."
            />
          </div>

          <div>
            <label style={labelStyle}>Indicação (Cliente)</label>
            <SuggestInput
              value={indicatedClient}
              onChange={setIndicatedClient}
              suggestions={indicatedClientSuggestions}
              placeholder="Opcional"
            />
          </div>

          <div>
            <label style={labelStyle}>Indicação (Profissional)</label>
            <SuggestInput
              value={indicatedProfessional}
              onChange={setIndicatedProfessional}
              suggestions={indicatedProfessionalSuggestions}
              placeholder="Opcional"
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

        {saleType === "recorrencia" ? (
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              opacity: 0.8,
            }}
          >
            Recorrência: o valor total será dividido automaticamente pelas parcelas.
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

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 14,
          }}
        >
          <button
            type="submit"
            disabled={saving}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "white",
              padding: "6px 10px",
              borderRadius: 8,
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 800,
              lineHeight: 1.1,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Salvando..." : "Salvar venda"}
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

                      {r.indicated_client ? (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          Indicação cliente: {r.indicated_client}
                        </div>
                      ) : null}

                      {r.indicated_professional ? (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          Indicação profissional: {r.indicated_professional}
                        </div>
                      ) : null}
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div>{normalizePaymentLabel(r.payment_method)}</div>
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
                  </tr>
                );
              })}

              {!rows.length ? (
                <tr>
                  <td colSpan={5} style={{ paddingTop: 12, opacity: 0.7 }}>
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