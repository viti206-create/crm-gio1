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
  payment_provider?: string | null;
  card_brand?: string | null;
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

type PaymentProvider =
  | "direct"
  | "pagbank_machine"
  | "pagbank_link"
  | "stone_machine"
  | "stone_link"
  | "gio_card";

type PaymentKind =
  | "pix"
  | "dinheiro"
  | "deposito"
  | "debito"
  | "credito"
  | "boleto";

type CardBrand =
  | "mastercard"
  | "visa"
  | "elo"
  | "amex"
  | "outras";

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

function normalizePaymentKindLabel(v: string | null | undefined) {
  const key = String(v ?? "").trim().toLowerCase();
  if (key === "pix") return "Pix";
  if (key === "credito") return "Crédito";
  if (key === "debito") return "Débito";
  if (key === "dinheiro") return "Dinheiro";
  if (key === "boleto") return "Boleto";
  if (key === "deposito") return "Depósito";
  return v || "—";
}

function normalizeProviderLabel(v: string | null | undefined) {
  const key = String(v ?? "").trim().toLowerCase();
  if (key === "direct") return "Direto";
  if (key === "pagbank_machine") return "PagBank Maquininha";
  if (key === "pagbank_link") return "PagBank Link";
  if (key === "stone_machine") return "Stone Maquininha";
  if (key === "stone_link") return "Stone Link";
  if (key === "gio_card") return "Cartão GIO";
  return v || "—";
}

function normalizeBrandLabel(v: string | null | undefined) {
  const key = String(v ?? "").trim().toLowerCase();
  if (key === "mastercard") return "Mastercard";
  if (key === "visa") return "Visa";
  if (key === "elo") return "Elo";
  if (key === "amex") return "American Express";
  if (key === "outras") return "Outras";
  return v || "—";
}

function calcNetFromFee(gross: number, feePercent: number) {
  return Number((gross * (1 - feePercent / 100)).toFixed(2));
}

function getGioSimulatedFee(installments: number) {
  if (installments <= 1) return 2.35;
  if (installments >= 12) return 14.21;
  const start = 2.35;
  const end = 14.21;
  const steps = 11;
  const pct = start + ((end - start) / steps) * (installments - 1);
  return Number(pct.toFixed(2));
}

function interpolateFee(
  table: Record<number, number>,
  installments: number
): number {
  const safeInstallments = Math.max(1, installments);
  if (table[safeInstallments] != null) return table[safeInstallments];

  const keys = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);

  if (!keys.length) return 0;
  if (safeInstallments <= keys[0]) return table[keys[0]];
  if (safeInstallments >= keys[keys.length - 1]) return table[keys[keys.length - 1]];

  let prev = keys[0];
  let next = keys[keys.length - 1];

  for (let i = 0; i < keys.length - 1; i += 1) {
    const a = keys[i];
    const b = keys[i + 1];
    if (safeInstallments > a && safeInstallments < b) {
      prev = a;
      next = b;
      break;
    }
  }

  const prevValue = table[prev];
  const nextValue = table[next];
  const ratio = (safeInstallments - prev) / (next - prev);

  return Number((prevValue + (nextValue - prevValue) * ratio).toFixed(2));
}

function getFeePercent(params: {
  provider: PaymentProvider;
  kind: PaymentKind;
  brand: CardBrand | "";
  installments: number;
  gross: number;
}) {
  const { provider, kind, brand, installments, gross } = params;

  if (kind === "pix" || kind === "dinheiro" || kind === "deposito") return 0;

  if (kind === "boleto") {
    if (provider === "pagbank_link") {
      if (!gross || gross <= 0) return 0;
      return Number(((1.45 / gross) * 100).toFixed(2));
    }
    return 0;
  }

  if (provider === "gio_card") {
    if (kind !== "credito") return 0;
    return getGioSimulatedFee(installments);
  }

  if (provider === "pagbank_link") {
    if (kind === "credito") {
      const table: Record<number, number> = {
        1: 2.75,
        2: 3.77,
        4: 5.0,
        5: 5.6,
        6: 6.2,
        8: 7.38,
        10: 8.55,
        12: 9.69,
      };
      return interpolateFee(table, installments);
    }
    return 0;
  }

  if (provider === "pagbank_machine") {
    if (kind === "debito") return 0.9;
    if (kind === "credito") {
      const table: Record<number, number> = {
        1: 2.75,
        2: 4.34,
        3: 5.11,
        4: 5.86,
        5: 6.51,
        6: 7.22,
        8: 8.82,
        10: 10.26,
        12: 11.66,
      };
      return interpolateFee(table, installments);
    }
    return 0;
  }

  if (provider === "stone_link") {
    if (kind === "debito") {
      const debitByBrand: Partial<Record<CardBrand, number>> = {
        mastercard: 1.25,
        elo: 1.49,
        visa: 1.35,
        outras: 1.35,
      };
      return debitByBrand[brand as CardBrand] ?? 1.35;
    }

    if (kind === "credito") {
      if (brand === "mastercard") {
        const table: Record<number, number> = {
          1: 2.15,
          5: 7.2,
          6: 7.4,
          7: 7.72,
          10: 9.72,
          12: 10.97,
        };
        return interpolateFee(table, installments);
      }

      if (brand === "elo") {
        const table: Record<number, number> = {
          1: 2.74,
          2: 3.09,
          6: 3.09,
          7: 3.56,
          12: 3.56,
          18: 3.56,
        };
        return interpolateFee(table, installments);
      }

      if (brand === "amex") {
        const table: Record<number, number> = {
          1: 2.76,
          2: 2.9,
          6: 2.9,
          7: 3.04,
          12: 3.04,
        };
        return interpolateFee(table, installments);
      }

      if (brand === "visa" || brand === "outras") {
        const table: Record<number, number> = {
          1: 2.45,
          2: 2.85,
          6: 2.85,
          7: 3.2,
          12: 3.2,
        };
        return interpolateFee(table, installments);
      }
    }

    return 0;
  }

  if (provider === "stone_machine") {
    if (kind === "debito") {
      const debitByBrand: Partial<Record<CardBrand, number>> = {
        mastercard: 0.75,
        elo: 0.99,
        visa: 0.9,
        outras: 0.9,
      };
      return debitByBrand[brand as CardBrand] ?? 0.9;
    }

    if (kind === "credito") {
      if (brand === "mastercard") {
        const table: Record<number, number> = {
          1: 2.98,
          2: 3.84,
          3: 4.5,
          4: 5.16,
          5: 5.83,
          6: 6.49,
          7: 7.28,
          8: 7.93,
          9: 8.61,
          10: 9.27,
          11: 9.93,
          12: 10.59,
          13: 11.25,
          14: 11.91,
          15: 12.58,
          16: 13.23,
          17: 13.9,
          18: 14.56,
        };
        return interpolateFee(table, installments);
      }

      if (brand === "elo") {
        const table: Record<number, number> = {
          1: 3.56,
          2: 4.56,
          3: 5.22,
          4: 5.88,
          5: 6.54,
          6: 7.64,
          7: 8.29,
          8: 8.95,
          9: 9.6,
          10: 10.26,
          11: 10.91,
          12: 11.57,
          13: 12.22,
          14: 12.87,
          15: 13.53,
          16: 14.18,
          17: 14.84,
          18: 15.49,
        };
        return interpolateFee(table, installments);
      }

      if (brand === "amex") {
        const table: Record<number, number> = {
          1: 3.58,
          2: 4.38,
          3: 5.04,
          4: 5.68,
          5: 6.35,
          6: 7.01,
          7: 7.8,
          8: 8.45,
          9: 9.12,
          10: 9.78,
          11: 10.43,
          12: 11.09,
        };
        return interpolateFee(table, installments);
      }

      if (brand === "visa" || brand === "outras") {
        const table: Record<number, number> = {
          1: 3.2,
          2: 4.05,
          3: 4.72,
          4: 5.39,
          5: 6.06,
          6: 6.73,
          7: 7.4,
          8: 8.07,
          9: 8.74,
          10: 9.41,
          11: 10.08,
          12: 10.75,
        };
        return interpolateFee(table, installments);
      }
    }

    return 0;
  }

  return 0;
}

function getPaymentKindsForProvider(provider: PaymentProvider) {
  if (provider === "direct") {
    return [
      { value: "pix", label: "Pix" },
      { value: "dinheiro", label: "Dinheiro" },
      { value: "deposito", label: "Depósito" },
    ] as Array<{ value: PaymentKind; label: string }>;
  }

  if (provider === "pagbank_machine" || provider === "stone_machine") {
    return [
      { value: "debito", label: "Débito" },
      { value: "credito", label: "Crédito" },
    ] as Array<{ value: PaymentKind; label: string }>;
  }

  if (provider === "pagbank_link" || provider === "stone_link") {
    return [
      { value: "credito", label: "Crédito" },
      { value: "boleto", label: "Boleto" },
    ] as Array<{ value: PaymentKind; label: string }>;
  }

  if (provider === "gio_card") {
    return [{ value: "credito", label: "Crédito" }] as Array<{
      value: PaymentKind;
      label: string;
    }>;
  }

  return [];
}

function getBrandOptionsForProvider(provider: PaymentProvider) {
  if (provider === "stone_machine" || provider === "stone_link") {
    return [
      { value: "mastercard", label: "Mastercard" },
      { value: "elo", label: "Elo" },
      { value: "amex", label: "American Express" },
      { value: "visa", label: "Visa" },
      { value: "outras", label: "Outras" },
    ] as Array<{ value: CardBrand; label: string }>;
  }

  if (
    provider === "pagbank_machine" ||
    provider === "pagbank_link" ||
    provider === "gio_card"
  ) {
    return [
      { value: "mastercard", label: "Mastercard" },
      { value: "visa", label: "Visa" },
      { value: "elo", label: "Elo" },
      { value: "amex", label: "American Express" },
      { value: "outras", label: "Outras" },
    ] as Array<{ value: CardBrand; label: string }>;
  }

  return [];
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  boxSizing: "border-box",
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  outline: "none",
  fontSize: 13,
  minWidth: 0,
};

const readOnlyInputStyle: React.CSSProperties = {
  ...inputStyle,
  opacity: 0.85,
  cursor: "default",
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

const btnDanger: React.CSSProperties = {
  ...btn,
  border: "1px solid rgba(255,120,120,0.30)",
  background:
    "linear-gradient(180deg, rgba(255,120,120,0.16) 0%, rgba(255,120,120,0.07) 100%)",
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

const fieldWrapStyle: React.CSSProperties = {
  minWidth: 0,
};

function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
  multipleWithSemicolon = false,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  multipleWithSemicolon?: boolean;
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

  const searchTerm = useMemo(() => {
    if (!multipleWithSemicolon) return value.trim().toLowerCase();
    const parts = value.split(";");
    return parts[parts.length - 1].trim().toLowerCase();
  }, [value, multipleWithSemicolon]);

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
        if (!searchTerm) return true;
        return item.toLowerCase().includes(searchTerm);
      })
      .slice(0, 8);
  }, [suggestions, searchTerm]);

  function insertSuggestion(item: string) {
    if (!multipleWithSemicolon) {
      onChange(item);
      setOpen(false);
      return;
    }

    const parts = value.split(";");
    parts[parts.length - 1] = ` ${item}`;
    onChange(parts.join(";").replace(/^ /, ""));
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", minWidth: 0 }}>
      <input
        style={inputStyle}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />

      {open && filtered.length > 0 ? (
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
            maxHeight: 260,
            overflowY: "auto",
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
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
              }}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
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
  const [indicatedClientSuggestions, setIndicatedClientSuggestions] = useState<string[]>([]);
  const [indicatedProfessionalSuggestions, setIndicatedProfessionalSuggestions] =
    useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [leadId, setLeadId] = useState("");
  const [procedure, setProcedure] = useState("");
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>("direct");
  const [paymentMethod, setPaymentMethod] = useState<PaymentKind>("pix");
  const [cardBrand, setCardBrand] = useState<CardBrand | "">("");
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

  const [lastEditedField, setLastEditedField] = useState<"net" | null>(null);

  const [filterQ, setFilterQ] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");

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
        "id,lead_id,recorrencia_id,value,value_gross,value_net,fee_percent,payment_method,payment_provider,card_brand,installments_label,sale_type,seller_name,source,procedure,notes,indicated_client,indicated_professional,closed_at,leads(id,name,phone_raw,phone_e164)"
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

    const clientUnique = Array.from(
      new Map(
        rows
          .map((r) => String(r.indicated_client ?? "").trim())
          .filter(Boolean)
          .map((item) => [item.toLowerCase(), item])
      ).values()
    ).sort((a, b) => a.localeCompare(b));

    const professionalUnique = Array.from(
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
    setIndicatedClientSuggestions(clientUnique);
    setIndicatedProfessionalSuggestions(professionalUnique);
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

  const paymentKindOptions = useMemo(
    () => getPaymentKindsForProvider(paymentProvider),
    [paymentProvider]
  );

  const brandOptions = useMemo(
    () => getBrandOptionsForProvider(paymentProvider),
    [paymentProvider]
  );

  const requiresBrand = useMemo(() => {
    return (
      (paymentMethod === "credito" || paymentMethod === "debito") &&
      paymentProvider !== "direct"
    );
  }, [paymentMethod, paymentProvider]);

  const installmentOptions = useMemo(() => {
    if (paymentMethod !== "credito") {
      return [{ value: "À vista", label: "À vista" }];
    }

    const max = paymentProvider === "gio_card" ? 12 : 18;

    return [
      { value: "À vista", label: "À vista" },
      ...Array.from({ length: max - 1 }).map((_, i) => {
        const n = i + 2;
        return { value: `${n}x`, label: `${n}x` };
      }),
    ];
  }, [paymentMethod, paymentProvider]);

  useEffect(() => {
    const validKinds = paymentKindOptions.map((x) => x.value);
    if (!validKinds.includes(paymentMethod)) {
      setPaymentMethod(validKinds[0] ?? "pix");
      setLastEditedField(null);
    }
  }, [paymentKindOptions, paymentMethod]);

  useEffect(() => {
    if (!requiresBrand) {
      setCardBrand("");
      return;
    }

    const validBrands = brandOptions.map((x) => x.value);
    if (!validBrands.includes(cardBrand as CardBrand)) {
      setCardBrand(validBrands[0] ?? "");
    }
  }, [requiresBrand, brandOptions, cardBrand]);

  useEffect(() => {
    if (paymentMethod !== "credito") {
      if (installmentsLabel !== "À vista") {
        setInstallmentsLabel("À vista");
      }
    } else {
      const validInstallments = installmentOptions.map((x) => x.value);
      if (!validInstallments.includes(installmentsLabel)) {
        setInstallmentsLabel("À vista");
      }
    }
  }, [paymentMethod, installmentOptions, installmentsLabel]);

  useEffect(() => {
    const gross = Number(grossValue || 0);

    if (!gross || gross <= 0) {
      if (!grossValue) {
        setNetValue("");
        setFeePercentInput("");
      }
      return;
    }

    const installmentsTotal = parseInstallmentsTotal(installmentsLabel);
    const autoFeePercent = getFeePercent({
      provider: paymentProvider,
      kind: paymentMethod,
      brand: cardBrand,
      installments: installmentsTotal,
      gross,
    });

    if (lastEditedField === "net") {
      const net = Number(netValue || 0);
      if (!Number.isFinite(net) || net <= 0) return;

      const pct = ((gross - net) / gross) * 100;
      setFeePercentInput(Number.isFinite(pct) ? pct.toFixed(2) : "");
      return;
    }

    setFeePercentInput(autoFeePercent.toFixed(2));
    setNetValue(calcNetFromFee(gross, autoFeePercent).toFixed(2));
  }, [
    grossValue,
    netValue,
    paymentProvider,
    paymentMethod,
    cardBrand,
    installmentsLabel,
    lastEditedField,
  ]);

  const filteredRows = useMemo(() => {
    const q = filterQ.trim().toLowerCase();

    return rows.filter((r) => {
      if (filterType !== "all" && (r.sale_type ?? "") !== filterType) return false;
      if (filterPayment !== "all" && (r.payment_method ?? "") !== filterPayment) return false;

      if (!q) return true;

      const hay = [
        r.leads?.name ?? "",
        r.leads?.phone_raw ?? "",
        r.procedure ?? "",
        r.seller_name ?? "",
        r.source ?? "",
        r.indicated_client ?? "",
        r.indicated_professional ?? "",
        normalizePaymentKindLabel(r.payment_method),
        normalizeProviderLabel(r.payment_provider),
        normalizeBrandLabel(r.card_brand),
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, filterQ, filterType, filterPayment]);

  function resetForm() {
    setEditingId(null);
    setLeadId("");
    setProcedure("");
    setPaymentProvider("direct");
    setPaymentMethod("pix");
    setCardBrand("");
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
    setErrorMsg("");
  }

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

    if (requiresBrand && !cardBrand) {
      setErrorMsg("Selecione a bandeira.");
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

      const feePercent =
        gross > 0 ? Number((((gross - net) / gross) * 100).toFixed(2)) : 0;

      if (editingId) {
        const { error: updateError } = await supabase
          .from("sales")
          .update({
            lead_id: leadId,
            sale_type: saleType,
            procedure: normalizedProcedure,
            value: gross,
            value_gross: gross,
            value_net: net,
            fee_percent: feePercent,
            payment_method: paymentMethod.trim(),
            payment_provider: paymentProvider,
            card_brand: cardBrand || null,
            installments_label: installmentsLabel,
            seller_name: normalizedSeller || null,
            source: normalizedSource || null,
            indicated_client: normalizedIndicatedClient || null,
            indicated_professional: normalizedIndicatedProfessional || null,
            notes: notes.trim() || null,
            closed_at: closedAt,
          })
          .eq("id", editingId);

        if (updateError) throw updateError;
      } else {
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
          payment_provider: paymentProvider,
          card_brand: cardBrand || null,
          installments_label: installmentsLabel,
          seller_name: normalizedSeller || null,
          source: normalizedSource || null,
          indicated_client: normalizedIndicatedClient || null,
          indicated_professional: normalizedIndicatedProfessional || null,
          notes: notes.trim() || null,
          closed_at: closedAt,
        });

        if (saleError) throw saleError;
      }

      resetForm();
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

  function handleEdit(row: SaleRow) {
    setEditingId(row.id);
    setLeadId(row.lead_id ?? "");
    setProcedure(row.procedure ?? "");
    setPaymentProvider((row.payment_provider as PaymentProvider) ?? "direct");
    setPaymentMethod((row.payment_method as PaymentKind) ?? "pix");
    setCardBrand((row.card_brand as CardBrand) ?? "");
    setInstallmentsLabel(row.installments_label ?? "À vista");
    setSaleType(row.sale_type ?? "avulsa");
    setGrossValue(String(row.value_gross ?? row.value ?? ""));
    setNetValue(String(row.value_net ?? ""));
    setFeePercentInput(String(row.fee_percent ?? ""));
    setClosedAt(row.closed_at ? row.closed_at.slice(0, 10) : todayInputValue());
    setSellerName(row.seller_name ?? "");
    setSource(row.source ?? "");
    setIndicatedClient(row.indicated_client ?? "");
    setIndicatedProfessional(row.indicated_professional ?? "");
    setNotes(row.notes ?? "");
    setLastEditedField("net");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(row: SaleRow) {
    const ok = window.confirm("Deseja realmente excluir esta venda?");
    if (!ok) return;

    try {
      const { error } = await supabase.from("sales").delete().eq("id", row.id);
      if (error) throw error;

      if (editingId === row.id) resetForm();
      await fetchSales();
      await fetchSuggestions();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Erro ao excluir venda.");
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
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span>{editingId ? "Editar venda" : "Nova venda"}</span>
          {editingId ? (
            <button type="button" onClick={resetForm} style={btn}>
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
          <div style={{ ...fieldWrapStyle, gridColumn: "span 2" }}>
            <label style={labelStyle}>Cliente</label>
            <SelectDark
              value={leadId}
              onChange={setLeadId}
              placeholder="Selecione"
              searchable
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

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Tipo da venda</label>
            <SelectDark
              value={saleType}
              onChange={setSaleType}
              placeholder="Tipo"
              searchable={false}
              options={[
                { value: "avulsa", label: "Avulsa" },
                { value: "recorrencia", label: "Recorrência" },
              ]}
            />
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Data</label>
            <input
              type="date"
              value={closedAt}
              onChange={(e) => setClosedAt(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ ...fieldWrapStyle, gridColumn: "span 2" }}>
            <label style={labelStyle}>Procedimento</label>
            <SuggestInput
              value={procedure}
              onChange={setProcedure}
              suggestions={procedureSuggestions}
              placeholder="Ex.: Botox 3 áreas; Preenchimento labial"
              multipleWithSemicolon
            />
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Operadora</label>
            <SelectDark
              value={paymentProvider}
              onChange={(v) => {
                setPaymentProvider(v as PaymentProvider);
                setLastEditedField(null);
              }}
              placeholder="Operadora"
              searchable={false}
              options={[
                { value: "direct", label: "Direto" },
                { value: "pagbank_machine", label: "PagBank Maquininha" },
                { value: "pagbank_link", label: "PagBank Link" },
                { value: "stone_machine", label: "Stone Maquininha" },
                { value: "stone_link", label: "Stone Link" },
                { value: "gio_card", label: "Cartão GIO" },
              ]}
            />
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Tipo pagamento</label>
            <SelectDark
              value={paymentMethod}
              onChange={(v) => {
                setPaymentMethod(v as PaymentKind);
                setLastEditedField(null);
              }}
              placeholder="Pagamento"
              searchable={false}
              options={paymentKindOptions.map((x) => ({
                value: x.value,
                label: x.label,
              }))}
            />
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Bandeira</label>
            <SelectDark
              value={cardBrand}
              onChange={(v) => {
                setCardBrand(v as CardBrand);
                setLastEditedField(null);
              }}
              placeholder={requiresBrand ? "Selecione" : "Não se aplica"}
              searchable={false}
              options={
                requiresBrand
                  ? brandOptions.map((x) => ({
                      value: x.value,
                      label: x.label,
                    }))
                  : [{ value: "", label: "Não se aplica" }]
              }
            />
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Parcelas</label>
            <SelectDark
              value={installmentsLabel}
              onChange={(v) => {
                setInstallmentsLabel(v);
                setLastEditedField(null);
              }}
              placeholder="Parcelas"
              searchable={false}
              options={installmentOptions}
            />
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Valor bruto</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={grossValue}
              onChange={(e) => {
                setGrossValue(e.target.value);
              }}
              style={inputStyle}
              placeholder="0,00"
            />
          </div>

          <div style={fieldWrapStyle}>
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

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Taxa (%)</label>
            <input
              type="number"
              value={feePercentInput}
              readOnly
              style={readOnlyInputStyle}
              placeholder="0,00"
            />
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Vendedor</label>
            <SuggestInput
              value={sellerName}
              onChange={setSellerName}
              suggestions={sellerSuggestions}
              placeholder="Nome"
            />
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Origem</label>
            <SuggestInput
              value={source}
              onChange={setSource}
              suggestions={sourceSuggestions}
              placeholder="Meta, indicação..."
            />
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Indicação (Cliente)</label>
            <SuggestInput
              value={indicatedClient}
              onChange={setIndicatedClient}
              suggestions={indicatedClientSuggestions}
              placeholder="Opcional"
            />
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Indicação (Profissional)</label>
            <SuggestInput
              value={indicatedProfessional}
              onChange={setIndicatedProfessional}
              suggestions={indicatedProfessionalSuggestions}
              placeholder="Opcional"
            />
          </div>

          <div style={{ ...fieldWrapStyle, gridColumn: "span 2" }}>
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

        {paymentProvider === "gio_card" ? (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              opacity: 0.75,
            }}
          >
            Cartão GIO: parcelas menores estão simuladas temporariamente até você me passar a tabela real.
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
            {saving
              ? "Salvando..."
              : editingId
              ? "Salvar alterações"
              : "Salvar venda"}
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
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span>Vendas</span>
          <span>{formatBRL(total)}</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(240px, 1.5fr) minmax(160px, 1fr) minmax(180px, 1fr) auto",
            gap: 10,
            marginBottom: 14,
            alignItems: "stretch",
          }}
        >
          <div style={fieldWrapStyle}>
            <input
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
              placeholder="Buscar por cliente, procedimento, vendedor, origem..."
              style={inputStyle}
            />
          </div>

          <div style={fieldWrapStyle}>
            <SelectDark
              value={filterType}
              onChange={setFilterType}
              placeholder="Tipo"
              searchable={false}
              options={[
                { value: "all", label: "Todos os tipos" },
                { value: "avulsa", label: "Avulsa" },
                { value: "recorrencia", label: "Recorrência" },
              ]}
            />
          </div>

          <div style={fieldWrapStyle}>
            <SelectDark
              value={filterPayment}
              onChange={setFilterPayment}
              placeholder="Pagamento"
              searchable={false}
              options={[
                { value: "all", label: "Todos pagamentos" },
                { value: "pix", label: "Pix" },
                { value: "credito", label: "Crédito" },
                { value: "debito", label: "Débito" },
                { value: "dinheiro", label: "Dinheiro" },
                { value: "boleto", label: "Boleto" },
                { value: "deposito", label: "Depósito" },
              ]}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setFilterQ("");
              setFilterType("all");
              setFilterPayment("all");
            }}
            style={btn}
          >
            Limpar
          </button>
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
              {filteredRows.map((r) => {
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
                      <div>{normalizePaymentKindLabel(r.payment_method)}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {normalizeProviderLabel(r.payment_provider)}
                      </div>
                      {r.card_brand ? (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {normalizeBrandLabel(r.card_brand)}
                        </div>
                      ) : null}
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
                      {r.fee_percent != null ? (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          Taxa {Number(r.fee_percent).toFixed(2)}%
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
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          style={btn}
                          onClick={() => handleEdit(r)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          style={btnDanger}
                          onClick={() => handleDelete(r)}
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