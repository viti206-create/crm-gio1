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
};

type ProcedureOption = {
  value: string;
  label: string;
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

function normalizeProcedureLabel(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeProcedureKey(value: string) {
  return normalizeProcedureLabel(value).toLocaleLowerCase("pt-BR");
}

function parseProcedureString(value: string | null | undefined) {
  return String(value ?? "")
    .split(";")
    .map((item) => normalizeProcedureLabel(item))
    .filter(Boolean);
}

function buildProcedureOptions(values: Array<string | null | undefined>) {
  const map = new Map<string, string>();

  for (const raw of values) {
    for (const item of parseProcedureString(raw)) {
      const key = normalizeProcedureKey(item);
      if (!map.has(key)) {
        map.set(key, item);
      }
    }
  }

  return Array.from(map.values())
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((item) => ({
      value: item,
      label: item,
    }));
}

function ProcedureMultiCreatable({
  value,
  onChange,
  options,
  placeholder = "Digite e pressione Enter",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options: ProcedureOption[];
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selectedKeys = useMemo(() => {
    return new Set(value.map((item) => normalizeProcedureKey(item)));
  }, [value]);

  const filtered = useMemo(() => {
    const q = normalizeProcedureKey(query);
    let list = options.filter(
      (opt) => !selectedKeys.has(normalizeProcedureKey(opt.value))
    );

    if (q) {
      list = list.filter((opt) =>
        normalizeProcedureKey(opt.label).includes(q)
      );
    }

    return list.slice(0, 8);
  }, [options, query, selectedKeys]);

  const canCreate = useMemo(() => {
    const clean = normalizeProcedureLabel(query);
    if (!clean) return false;

    const key = normalizeProcedureKey(clean);
    if (selectedKeys.has(key)) return false;
    if (options.some((opt) => normalizeProcedureKey(opt.value) === key)) {
      return false;
    }

    return true;
  }, [query, options, selectedKeys]);

  function addItem(raw: string) {
    const clean = normalizeProcedureLabel(raw);
    if (!clean) return;

    const key = normalizeProcedureKey(clean);
    if (value.some((item) => normalizeProcedureKey(item) === key)) {
      setQuery("");
      return;
    }

    onChange([...value, clean]);
    setQuery("");
    setOpen(false);
  }

  function removeItem(raw: string) {
    const key = normalizeProcedureKey(raw);
    onChange(value.filter((item) => normalizeProcedureKey(item) !== key));
  }

  const inputStyleLocal: React.CSSProperties = {
    background: "transparent",
    border: "none",
    outline: "none",
    color: "white",
    fontSize: 13,
    minWidth: 180,
    flex: 1,
    padding: "2px 0",
  };

  const chipStyleLocal: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(180,120,255,0.28)",
    background: "rgba(180,120,255,0.12)",
    color: "white",
    fontSize: 12,
    fontWeight: 800,
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div
        style={{
          width: "100%",
          minHeight: 42,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)",
          color: "white",
          padding: "8px 10px",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
        onClick={() => setOpen(true)}
      >
        {value.map((item) => (
          <span key={item} style={chipStyleLocal}>
            {item}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeItem(item);
              }}
              style={{
                border: "none",
                background: "transparent",
                color: "rgba(255,255,255,0.80)",
                cursor: "pointer",
                fontWeight: 900,
                padding: 0,
                lineHeight: 1,
              }}
              aria-label={`Remover ${item}`}
              title={`Remover ${item}`}
            >
              ×
            </button>
          </span>
        ))}

        <input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ";") {
              e.preventDefault();
              addItem(query);
            }

            if (e.key === "Backspace" && !query && value.length) {
              removeItem(value[value.length - 1]);
            }
          }}
          placeholder={value.length ? "" : placeholder}
          style={inputStyleLocal}
        />
      </div>

      {open && (filtered.length > 0 || canCreate) ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            zIndex: 50,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(10,10,14,0.96)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.65)",
            overflow: "hidden",
          }}
        >
          {filtered.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => addItem(opt.value)}
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
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
              }}
            >
              {opt.label}
            </button>
          ))}

          {canCreate ? (
            <button
              type="button"
              onClick={() => addItem(query)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                cursor: "pointer",
                background: "rgba(180,120,255,0.10)",
                border: "none",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                color: "white",
                fontWeight: 900,
              }}
            >
              Criar: {normalizeProcedureLabel(query)}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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

export default function VendasPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [procedureOptions, setProcedureOptions] = useState<ProcedureOption[]>(
    []
  );
  const [errorMsg, setErrorMsg] = useState("");

  const [leadId, setLeadId] = useState("");
  const [procedureItems, setProcedureItems] = useState<string[]>([]);
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
        "id,lead_id,recorrencia_id,value,value_gross,value_net,fee_percent,payment_method,installments_label,sale_type,seller_name,source,procedure,notes,closed_at,leads(id,name,phone_raw,phone_e164)"
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

  async function fetchProcedureOptions() {
    const { data, error } = await supabase
      .from("sales")
      .select("procedure")
      .order("closed_at", { ascending: false });

    if (error) {
      console.error(error);
      setProcedureOptions([]);
      return;
    }

    setProcedureOptions(
      buildProcedureOptions((data ?? []).map((row: any) => row.procedure))
    );
  }

  useEffect(() => {
    if (isAdmin) {
      fetchSales();
      fetchLeads();
      fetchProcedureOptions();
    }
  }, [isAdmin]);

  const total = useMemo(() => {
    return rows.reduce((sum, r) => sum + Number(r.value ?? 0), 0);
  }, [rows]);

  function updateByGrossAndNet(nextGrossRaw: string, nextNetRaw: string) {
    const gross = Number(nextGrossRaw || 0);
    const net = Number(nextNetRaw || 0);

    setGrossValue(nextGrossRaw);
    setNetValue(nextNetRaw);

    if (gross > 0 && net >= 0) {
      const pct = ((gross - net) / gross) * 100;
      setFeePercentValue(Number.isFinite(pct) ? pct.toFixed(2) : "");
    } else {
      setFeePercentValue("");
    }
  }

  function updateByGrossAndFee(nextGrossRaw: string, nextFeeRaw: string) {
    const gross = Number(nextGrossRaw || 0);
    const fee = Number(nextFeeRaw || 0);

    setGrossValue(nextGrossRaw);
    setFeePercentValue(nextFeeRaw);

    if (gross > 0 && fee >= 0) {
      const net = gross * (1 - fee / 100);
      setNetValue(Number.isFinite(net) ? net.toFixed(2) : "");
    } else {
      setNetValue("");
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    const gross = Number(grossValue || 0);
    const net = Number(netValue || 0);
    const shouldCreateRecorrencia = saleType === "recorrencia";

    const normalizedProcedure = procedureItems
      .map((item) => normalizeProcedureLabel(item))
      .filter(Boolean)
      .join("; ");

    if (!leadId) {
      setErrorMsg("Selecione o cliente.");
      return;
    }

    if (!procedureItems.length) {
      setErrorMsg("Informe pelo menos um procedimento.");
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
      let recorrenciaId: string | null = null;

      if (shouldCreateRecorrencia) {
        const installmentsTotal =
          Number(installmentsLabel.replace(/\D/g, "")) > 0
            ? Number(installmentsLabel.replace(/\D/g, ""))
            : 1;

        const installmentValue =
          installmentsTotal > 0
            ? Number((gross / installmentsTotal).toFixed(2))
            : gross;

        const { data: recData, error: recError } = await supabase
          .from("recorrencias")
          .insert({
            lead_id: leadId,
            status: recStatus,
            start_date: closedAt,
            installments_total: installmentsTotal,
            installments_done: 1,
            price_per_installment: installmentValue,
          })
          .select("id")
          .single();

        if (recError) {
          throw recError;
        }

        recorrenciaId = recData?.id ?? null;
      }

      const feePercent =
        gross > 0 ? Number((((gross - net) / gross) * 100).toFixed(2)) : 0;

      const { error: saleError } = await supabase.from("sales").insert({
        lead_id: leadId,
        recorrencia_id: recorrenciaId,
        sale_type: shouldCreateRecorrencia ? "recorrencia" : saleType,
        procedure: normalizedProcedure,
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
      });

      if (saleError) {
        throw saleError;
      }

      setLeadId("");
      setProcedureItems([]);
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
      setRecStatus("ativo");

      await fetchSales();
      await fetchLeads();
      await fetchProcedureOptions();
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
            <label style={labelStyle}>Procedimentos</label>
            <ProcedureMultiCreatable
              value={procedureItems}
              onChange={setProcedureItems}
              options={procedureOptions}
              placeholder="Ex.: Botox 3 áreas"
            />
            <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
              Digite para buscar, clique para adicionar ou pressione Enter para
              criar novo.
            </div>
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
              onChange={(e) => {
                if (feePercentValue) {
                  updateByGrossAndFee(e.target.value, feePercentValue);
                } else {
                  updateByGrossAndNet(e.target.value, netValue);
                }
              }}
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
              onChange={(e) => updateByGrossAndNet(grossValue, e.target.value)}
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
              onChange={(e) =>
                updateByGrossAndFee(grossValue, e.target.value)
              }
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
                <th style={{ textAlign: "left", paddingBottom: 10 }}>
                  Cliente
                </th>
                <th style={{ textAlign: "left", paddingBottom: 10 }}>
                  Procedimentos
                </th>
                <th style={{ textAlign: "left", paddingBottom: 10 }}>
                  Pagamento
                </th>
                <th style={{ textAlign: "left", paddingBottom: 10 }}>
                  Valor
                </th>
                <th style={{ textAlign: "left", paddingBottom: 10 }}>
                  Data
                </th>
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
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {parseProcedureString(r.procedure).length ? (
                          parseProcedureString(r.procedure).map((item) => (
                            <span
                              key={item}
                              style={{
                                fontSize: 11,
                                padding: "3px 8px",
                                borderRadius: 999,
                                border:
                                  "1px solid rgba(180,120,255,0.28)",
                                background: "rgba(180,120,255,0.10)",
                                color: "white",
                                fontWeight: 700,
                              }}
                            >
                              {item}
                            </span>
                          ))
                        ) : (
                          <div>—</div>
                        )}
                      </div>

                      {r.recorrencia_id ? (
                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
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
                      <div>
                        {r.payment_method === "cartao_recorrente"
                          ? "Cartão Recorrente"
                          : r.payment_method ?? "—"}
                      </div>
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