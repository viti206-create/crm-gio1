"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAdminAccess } from "../_hooks/useAdminAccess";

type LeadRow = {
  id: string;
  sex: string | null;
  birth_date: string | null;
};

type RecorrenciaJoin = {
  id: string;
  status: string | null;
  start_date: string | null;
  installments_total: number | null;
  installments_done: number | null;
  price_per_installment: number | null;
};

type SaleRow = {
  id: string;
  lead_id: string | null;
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
  recorrencias?: RecorrenciaJoin | null;
};

type RecRow = {
  id: string;
  lead_id: string | null;
  status: string | null;
  start_date: string | null;
  installments_total: number | null;
  installments_done: number | null;
  price_per_installment: number | null;
};

type ForecastMonthlyGroupedRow = {
  month: string;
  expected_amount: number;
  active_count: number;
};

type GroupAmountRow = {
  label: string;
  count: number;
  gross: number;
  net: number;
};

type MonthlySalesRow = {
  month: string;
  gross: number;
  net: number;
  count: number;
  recorrentes: number;
  avulsas: number;
};

type ExpandedSaleMetric = {
  lead_id: string | null;
  seller_name: string | null;
  source: string | null;
  payment_method: string | null;
  month: string;
  effectiveGross: number;
  effectiveNet: number;
  isRecurring: boolean;
};

type FilterMode = "monthly" | "yearly";

function FilterToggle({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 8,
        padding: 4,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        flexWrap: "wrap",
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;

        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              background: active
                ? "linear-gradient(180deg, rgba(180,120,255,0.20) 0%, rgba(180,120,255,0.08) 100%)"
                : "rgba(255,255,255,0.06)",
              color: "white",
              border: active
                ? "1px solid rgba(180,120,255,0.30)"
                : "1px solid rgba(255,255,255,0.12)",
              padding: "10px 14px",
              borderRadius: 12,
              cursor: "pointer",
              fontWeight: 900,
              fontSize: 13,
              minWidth: 72,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function formatBRL(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

function formatMonthLabel(v: string | null | undefined) {
  if (!v) return "—";
  const text = String(v);

  if (/^\d{4}-\d{2}$/.test(text)) {
    const [year, month] = text.split("-");
    return `${month}/${year}`;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const d = new Date(text);
    if (Number.isNaN(d.getTime())) return text;
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}/${yyyy}`;
  }

  return text;
}

function monthKeyFromDate(v: string | Date | null | undefined) {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}`;
}

function addMonths(dt: Date, months: number) {
  const x = new Date(dt.getTime());
  x.setMonth(x.getMonth() + months);
  return x;
}

function normalizeRecStatus(status: string | null | undefined) {
  const s = String(status ?? "").trim().toLowerCase();

  if (["ativo", "ativa"].includes(s)) return "ativo";
  if (
    [
      "encerrado",
      "encerrada",
      "concluido",
      "concluida",
      "concluído",
      "concluída",
    ].includes(s)
  ) {
    return "encerrado";
  }
  if (s === "pausada") return "pausada";
  if (s === "cancelada") return "cancelada";
  return s || "ativo";
}

function formatPaymentMethod(v: string | null | undefined) {
  const key = String(v ?? "").trim().toLowerCase();

  if (key === "pix") return "Pix";
  if (key === "cartao") return "Cartão";
  if (key === "cartao_recorrente") return "Cartão recorrente";
  if (key === "debito") return "Débito";
  if (key === "dinheiro") return "Dinheiro";
  if (key === "boleto") return "Boleto";

  return v || "—";
}

function normalizeSexLabel(v: string | null | undefined) {
  const key = String(v ?? "").trim().toLowerCase();

  if (key === "feminino") return "Feminino";
  if (key === "masculino") return "Masculino";
  return "Não informado";
}

function calculateAge(birthDate: string | null | undefined) {
  if (!birthDate) return null;

  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birth.getDate())
  ) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function ageRange(age: number | null) {
  if (age === null) return "Não informado";
  if (age <= 17) return "Até 17";
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  if (age <= 54) return "45-54";
  return "55+";
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

function isInPeriod(date: Date, mode: FilterMode, year: number, month: number) {
  if (mode === "yearly") return date.getFullYear() === year;
  return date.getFullYear() === year && date.getMonth() === month;
}

function periodLabel(mode: FilterMode, year: number, month: number) {
  if (mode === "yearly") return `Ano ${year}`;
  return `${String(month + 1).padStart(2, "0")}/${year}`;
}

export default function RelatoriosPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const todayRef = useMemo(() => new Date(), []);
  const [filterMode, setFilterMode] = useState<FilterMode>("monthly");
  const [selectedYear, setSelectedYear] = useState(todayRef.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(todayRef.getMonth());

  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [recorrencias, setRecorrencias] = useState<RecRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [loadingRole, isAdmin, router]);

  async function fetchAll() {
    setLoading(true);
    setErrors([]);

    const [
      { data: salesData, error: salesErr },
      { data: recData, error: recErr },
      { data: leadsData, error: leadsErr },
    ] = await Promise.all([
      supabase
        .from("sales")
        .select(
          "id,lead_id,recorrencia_id,value,value_gross,value_net,fee_percent,payment_method,installments_label,sale_type,seller_name,source,procedure,notes,closed_at,recorrencias(id,status,start_date,installments_total,installments_done,price_per_installment)"
        )
        .order("closed_at", { ascending: false }),
      supabase
        .from("recorrencias")
        .select(
          "id,lead_id,status,start_date,installments_total,installments_done,price_per_installment"
        )
        .order("start_date", { ascending: false }),
      supabase
        .from("leads")
        .select("id,sex,birth_date"),
    ]);

    const nextErrors: string[] = [];

    if (salesErr) {
      console.error("sales error:", JSON.stringify(salesErr, null, 2));
      nextErrors.push("Vendas não carregaram.");
    }

    if (recErr) {
      console.error("recorrencias error:", JSON.stringify(recErr, null, 2));
      nextErrors.push("Recorrências não carregaram.");
    }

    if (leadsErr) {
      console.error("leads error:", JSON.stringify(leadsErr, null, 2));
      nextErrors.push("Leads não carregaram.");
    }

    setSales((salesData as any) ?? []);
    setRecorrencias((recData as any) ?? []);
    setLeads((leadsData as any) ?? []);
    setErrors(nextErrors);
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) {
      fetchAll();
    }
  }, [isAdmin]);

  const allYears = useMemo(() => {
    const set = new Set<number>();
    set.add(todayRef.getFullYear());

    for (const s of sales) {
      if (!s.closed_at) continue;
      const d = new Date(s.closed_at);
      if (!Number.isNaN(d.getTime())) set.add(d.getFullYear());
    }

    for (const r of recorrencias) {
      if (!r.start_date) continue;
      const d = new Date(r.start_date);
      if (!Number.isNaN(d.getTime())) set.add(d.getFullYear());
    }

    return Array.from(set).sort((a, b) => b - a);
  }, [sales, recorrencias, todayRef]);

  const monthOptions = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];

  const expandedMetrics = useMemo<ExpandedSaleMetric[]>(() => {
    const out: ExpandedSaleMetric[] = [];

    for (const row of sales) {
      if (!row.closed_at) continue;

      const saleDate = new Date(row.closed_at);
      if (Number.isNaN(saleDate.getTime())) continue;

      const isRecurring = row.sale_type === "recorrencia" || !!row.recorrencia_id;
      const grossTotal = Number(row.value_gross ?? row.value ?? 0);
      const netTotal = Number(row.value_net ?? 0);
      const feePercent = Number(row.fee_percent ?? 0);

      if (!isRecurring) {
        if (saleDate > todayRef) continue;
        if (!isInPeriod(saleDate, filterMode, selectedYear, selectedMonth)) continue;

        out.push({
          lead_id: row.lead_id ?? null,
          seller_name: row.seller_name ?? null,
          source: row.source ?? null,
          payment_method: row.payment_method ?? null,
          month: monthKeyFromDate(saleDate),
          effectiveGross: grossTotal,
          effectiveNet:
            netTotal > 0
              ? netTotal
              : Number((grossTotal * (1 - feePercent / 100)).toFixed(2)),
          isRecurring: false,
        });
        continue;
      }

      const totalInstallments =
        Number(row.recorrencias?.installments_total ?? 0) ||
        Number((row.installments_label || "").replace(/\D/g, "")) ||
        1;

      const monthlyGross =
        totalInstallments > 0 ? Number((grossTotal / totalInstallments).toFixed(2)) : grossTotal;
      const monthlyNet =
        totalInstallments > 0
          ? Number((netTotal / totalInstallments).toFixed(2))
          : Number((monthlyGross * (1 - feePercent / 100)).toFixed(2));

      for (let i = 0; i < totalInstallments; i += 1) {
        const installmentDate = addMonths(saleDate, i);
        if (installmentDate > todayRef) break;
        if (!isInPeriod(installmentDate, filterMode, selectedYear, selectedMonth)) continue;

        out.push({
          lead_id: row.lead_id ?? null,
          seller_name: row.seller_name ?? null,
          source: row.source ?? null,
          payment_method: row.payment_method ?? null,
          month: monthKeyFromDate(installmentDate),
          effectiveGross: monthlyGross,
          effectiveNet:
            monthlyNet > 0
              ? monthlyNet
              : Number((monthlyGross * (1 - feePercent / 100)).toFixed(2)),
          isRecurring: true,
        });
      }
    }

    return out;
  }, [sales, todayRef, filterMode, selectedYear, selectedMonth]);

  const forecastMonthlyAll = useMemo<ForecastMonthlyGroupedRow[]>(() => {
    const map = new Map<string, ForecastMonthlyGroupedRow>();

    for (const row of recorrencias) {
      const status = normalizeRecStatus(row.status);
      if (status !== "ativo") continue;

      const startDate = row.start_date ? new Date(row.start_date) : null;
      if (!startDate || Number.isNaN(startDate.getTime())) continue;

      const total = Number(row.installments_total ?? 0);
      const done = Number(row.installments_done ?? 0);
      const monthly = Number(row.price_per_installment ?? 0);

      if (!total || !monthly) continue;

      for (let idx = Math.max(done - 1, 0); idx < total; idx += 1) {
        const paymentDate = addMonths(startDate, idx);
        const month = monthKeyFromDate(paymentDate);
        if (!month) continue;

        if (!map.has(month)) {
          map.set(month, {
            month,
            expected_amount: 0,
            active_count: 0,
          });
        }

        const current = map.get(month)!;
        current.expected_amount += monthly;
        current.active_count += 1;
      }
    }

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [recorrencias]);

  const forecastMonthly = useMemo<ForecastMonthlyGroupedRow[]>(() => {
    return forecastMonthlyAll.filter((row) => {
      const [year, month] = row.month.split("-").map(Number);
      if (!year || !month) return false;

      const d = new Date(year, month - 1, 1);
      return isInPeriod(d, filterMode, selectedYear, selectedMonth);
    });
  }, [forecastMonthlyAll, filterMode, selectedYear, selectedMonth]);

  const forecastSummary = useMemo(() => {
    if (filterMode === "yearly") {
      const total = forecastMonthly.reduce((sum, row) => sum + row.expected_amount, 0);
      return {
        expectedThis: total,
        expectedNext: 0,
        expectedNext3: 0,
      };
    }

    const currentBase = new Date(selectedYear, selectedMonth, 1);
    const currentMonthKey = monthKeyFromDate(currentBase);
    const nextMonthKey = monthKeyFromDate(addMonths(currentBase, 1));

    let expectedThis = 0;
    let expectedNext = 0;
    let expectedNext3 = 0;

    for (const row of forecastMonthlyAll) {
      if (row.month === currentMonthKey) expectedThis += row.expected_amount;
      if (row.month === nextMonthKey) expectedNext += row.expected_amount;
    }

    for (let i = 1; i <= 3; i += 1) {
      const key = monthKeyFromDate(addMonths(currentBase, i));
      const found = forecastMonthlyAll.find((x) => x.month === key);
      expectedNext3 += Number(found?.expected_amount ?? 0);
    }

    return {
      expectedThis,
      expectedNext,
      expectedNext3,
    };
  }, [forecastMonthly, forecastMonthlyAll, filterMode, selectedYear, selectedMonth]);

  const salesSummary = useMemo(() => {
    const gross = expandedMetrics.reduce((sum, row) => sum + row.effectiveGross, 0);
    const net = expandedMetrics.reduce((sum, row) => sum + row.effectiveNet, 0);
    const recorrentes = expandedMetrics.filter((row) => row.isRecurring).length;
    const avulsas = expandedMetrics.length - recorrentes;
    const feesAvg = gross > 0 ? Number((((gross - net) / gross) * 100).toFixed(2)) : 0;

    return {
      count: expandedMetrics.length,
      gross,
      net,
      recorrentes,
      avulsas,
      feesAvg,
    };
  }, [expandedMetrics]);

  const recorrenciasSummary = useMemo(() => {
    let ativas = 0;
    let pausadas = 0;
    let canceladas = 0;
    let encerradas = 0;
    let mensalPrevistoAtivo = 0;

    for (const row of recorrencias) {
      const status = normalizeRecStatus(row.status);
      const startDate = row.start_date ? new Date(row.start_date) : null;
      const inPeriodStart =
        startDate && !Number.isNaN(startDate.getTime())
          ? isInPeriod(startDate, filterMode, selectedYear, selectedMonth)
          : false;

      if (filterMode === "monthly" && !inPeriodStart) {
        const possibleDates: Date[] = [];
        const total = Number(row.installments_total ?? 0);
        for (let i = 0; i < total; i += 1) {
          if (!startDate) continue;
          possibleDates.push(addMonths(startDate, i));
        }
        const touchesPeriod = possibleDates.some((d) =>
          isInPeriod(d, filterMode, selectedYear, selectedMonth)
        );
        if (!touchesPeriod) continue;
      }

      if (filterMode === "yearly" && startDate && !isInPeriod(startDate, filterMode, selectedYear, selectedMonth)) {
        const total = Number(row.installments_total ?? 0);
        let touchesYear = false;
        for (let i = 0; i < total; i += 1) {
          const d = addMonths(startDate, i);
          if (isInPeriod(d, filterMode, selectedYear, selectedMonth)) {
            touchesYear = true;
            break;
          }
        }
        if (!touchesYear) continue;
      }

      if (status === "ativo") {
        ativas += 1;
        mensalPrevistoAtivo += Number(row.price_per_installment ?? 0);
      } else if (status === "pausada") {
        pausadas += 1;
      } else if (status === "cancelada") {
        canceladas += 1;
      } else {
        encerradas += 1;
      }
    }

    return {
      total: ativas + pausadas + canceladas + encerradas,
      ativas,
      pausadas,
      canceladas,
      encerradas,
      mensalPrevistoAtivo,
    };
  }, [recorrencias, filterMode, selectedYear, selectedMonth]);

  const bySeller = useMemo<GroupAmountRow[]>(() => {
    const map = new Map<string, GroupAmountRow>();

    for (const row of expandedMetrics) {
      const key = String(row.seller_name || "Sem vendedor").trim() || "Sem vendedor";

      if (!map.has(key)) {
        map.set(key, { label: key, count: 0, gross: 0, net: 0 });
      }

      const current = map.get(key)!;
      current.count += 1;
      current.gross += row.effectiveGross;
      current.net += row.effectiveNet;
    }

    return Array.from(map.values()).sort((a, b) => b.net - a.net);
  }, [expandedMetrics]);

  const byPayment = useMemo<GroupAmountRow[]>(() => {
    const map = new Map<string, GroupAmountRow>();

    for (const row of expandedMetrics) {
      const key = formatPaymentMethod(row.payment_method);
      if (!map.has(key)) {
        map.set(key, { label: key, count: 0, gross: 0, net: 0 });
      }

      const current = map.get(key)!;
      current.count += 1;
      current.gross += row.effectiveGross;
      current.net += row.effectiveNet;
    }

    return Array.from(map.values()).sort((a, b) => b.net - a.net);
  }, [expandedMetrics]);

  const bySource = useMemo<GroupAmountRow[]>(() => {
    const map = new Map<string, GroupAmountRow>();

    for (const row of expandedMetrics) {
      const key = String(row.source || "Não informada").trim() || "Não informada";
      if (!map.has(key)) {
        map.set(key, { label: key, count: 0, gross: 0, net: 0 });
      }

      const current = map.get(key)!;
      current.count += 1;
      current.gross += row.effectiveGross;
      current.net += row.effectiveNet;
    }

    return Array.from(map.values()).sort((a, b) => b.net - a.net);
  }, [expandedMetrics]);

  const monthlySales = useMemo<MonthlySalesRow[]>(() => {
    const map = new Map<string, MonthlySalesRow>();

    for (const row of expandedMetrics) {
      if (!row.month) continue;

      if (!map.has(row.month)) {
        map.set(row.month, {
          month: row.month,
          gross: 0,
          net: 0,
          count: 0,
          recorrentes: 0,
          avulsas: 0,
        });
      }

      const current = map.get(row.month)!;
      current.gross += row.effectiveGross;
      current.net += row.effectiveNet;
      current.count += 1;

      if (row.isRecurring) current.recorrentes += 1;
      else current.avulsas += 1;
    }

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [expandedMetrics]);

  const leadsById = useMemo(() => {
    const map = new Map<string, LeadRow>();
    for (const lead of leads) {
      map.set(lead.id, lead);
    }
    return map;
  }, [leads]);

  const uniqueLeadsInPeriod = useMemo(() => {
    const ids = new Set<string>();

    for (const row of expandedMetrics) {
      if (row.lead_id) ids.add(row.lead_id);
    }

    return Array.from(ids)
      .map((id) => leadsById.get(id))
      .filter((lead): lead is LeadRow => !!lead);
  }, [expandedMetrics, leadsById]);

  const clientsBySex = useMemo(() => {
    const order = ["Feminino", "Masculino", "Não informado"];
    const map = new Map<string, number>();

    for (const lead of uniqueLeadsInPeriod) {
      const label = normalizeSexLabel(lead.sex);
      map.set(label, (map.get(label) ?? 0) + 1);
    }

    return order
      .filter((label) => map.has(label))
      .map((label) => ({
        label,
        count: map.get(label) ?? 0,
      }));
  }, [uniqueLeadsInPeriod]);

  const clientsByAge = useMemo(() => {
    const order = ["Até 17", "18-24", "25-34", "35-44", "45-54", "55+", "Não informado"];
    const map = new Map<string, number>();

    for (const lead of uniqueLeadsInPeriod) {
      const age = calculateAge(lead.birth_date);
      const label = ageRange(age);
      map.set(label, (map.get(label) ?? 0) + 1);
    }

    return order
      .filter((label) => map.has(label))
      .map((label) => ({
        label,
        count: map.get(label) ?? 0,
      }));
  }, [uniqueLeadsInPeriod]);

  const page: React.CSSProperties = {
    padding: 16,
    color: "white",
  };

  const shell: React.CSSProperties = {
    background:
      "radial-gradient(900px 500px at 20% 15%, rgba(180,120,255,0.25), transparent 60%), linear-gradient(180deg, #09070c 0%, #050408 100%)",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    padding: 16,
  };

  const card: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 22px 70px rgba(0,0,0,0.55)",
  };

  const miniCard: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
    borderRadius: 14,
    padding: 14,
  };

  const btn: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 900,
  };

  const th: React.CSSProperties = {
    textAlign: "left",
    fontSize: 12,
    opacity: 0.85,
    fontWeight: 900,
    padding: "12px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: "12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    verticalAlign: "top",
    fontSize: 13,
  };

  if (loadingRole) {
    return <div style={{ padding: 20, color: "white" }}>Carregando permissões...</div>;
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div style={page}>
      <div style={shell}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 0.2 }}>
              Relatórios
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <FilterToggle
                value={filterMode}
                onChange={(v) => setFilterMode(v as FilterMode)}
                options={[
                  { value: "monthly", label: "Mensal" },
                  { value: "yearly", label: "Anual" },
                ]}
              />

              <FilterToggle
                value={String(selectedYear)}
                onChange={(v) => setSelectedYear(Number(v))}
                options={allYears.map((year) => ({
                  value: String(year),
                  label: String(year),
                }))}
              />

              {filterMode === "monthly" ? (
                <FilterToggle
                  value={String(selectedMonth)}
                  onChange={(v) => setSelectedMonth(Number(v))}
                  options={monthOptions.map((label, idx) => ({
                    value: String(idx),
                    label,
                  }))}
                />
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              <span
                style={{
                  ...chipStyle("muted"),
                  padding: "2px 8px",
                  fontSize: 11,
                }}
              >
                Período: {periodLabel(filterMode, selectedYear, selectedMonth)}
              </span>

              <span
                style={{
                  ...chipStyle("primary"),
                  padding: "2px 8px",
                  fontSize: 11,
                }}
              >
                Vendas líquidas: {formatBRL(salesSummary.net)}
              </span>

              <span
                style={{
                  ...chipStyle("warn"),
                  padding: "2px 8px",
                  fontSize: 11,
                }}
              >
                Recorrência ativa/mês: {formatBRL(recorrenciasSummary.mensalPrevistoAtivo)}
              </span>

              <span
                style={{
                  ...chipStyle("muted"),
                  padding: "2px 8px",
                  fontSize: 11,
                }}
              >
                Próx. 3 meses: {formatBRL(forecastSummary.expectedNext3)}
              </span>

              {!!errors.length && (
                <span
                  style={{
                    ...chipStyle("danger"),
                    padding: "2px 8px",
                    fontSize: 11,
                  }}
                >
                  {errors.length} aviso(s)
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={fetchAll} style={btn}>
              Atualizar
            </button>
            <button onClick={() => router.push("/dashboard")} style={btn}>
              Voltar
            </button>
          </div>
        </div>

        {!!errors.length && (
          <div
            style={{
              ...card,
              marginBottom: 14,
              border: "1px solid rgba(255,120,120,0.20)",
              background: "rgba(255,120,120,0.06)",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Avisos de carregamento</div>
            <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
              {errors.map((err, idx) => (
                <div key={idx}>• {err}</div>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            marginBottom: 14,
          }}
        >
          <div style={miniCard}>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Vendas brutas</div>
            <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>
              {formatBRL(salesSummary.gross)}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              {salesSummary.count} lançamento(s)
            </div>
          </div>

          <div style={miniCard}>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Vendas líquidas</div>
            <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>
              {formatBRL(salesSummary.net)}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              Taxa média: {salesSummary.feesAvg.toFixed(2)}%
            </div>
          </div>

          <div style={miniCard}>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Recorrências ativas</div>
            <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>
              {recorrenciasSummary.ativas}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              Total recorrências: {recorrenciasSummary.total}
            </div>
          </div>

          <div style={miniCard}>
            <div style={{ fontSize: 12, opacity: 0.72 }}>
              {filterMode === "monthly" ? "Forecast deste mês" : "Forecast do ano"}
            </div>
            <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>
              {formatBRL(forecastSummary.expectedThis)}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              Próximo: {formatBRL(forecastSummary.expectedNext)}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "1fr 1fr",
            marginBottom: 14,
          }}
        >
          <div style={card}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>Resumo de vendas</div>

            <div style={{ display: "grid", gap: 12 }}>
              <div style={miniCard}>
                <div style={{ fontSize: 12, opacity: 0.72 }}>Vendas avulsas</div>
                <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
                  {salesSummary.avulsas}
                </div>
              </div>

              <div style={miniCard}>
                <div style={{ fontSize: 12, opacity: 0.72 }}>Vendas recorrentes</div>
                <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
                  {salesSummary.recorrentes}
                </div>
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>Resumo de recorrências</div>

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={miniCard}>
                  <div style={{ fontSize: 12, opacity: 0.72 }}>Ativas</div>
                  <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
                    {recorrenciasSummary.ativas}
                  </div>
                </div>

                <div style={miniCard}>
                  <div style={{ fontSize: 12, opacity: 0.72 }}>Pausadas</div>
                  <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
                    {recorrenciasSummary.pausadas}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={miniCard}>
                  <div style={{ fontSize: 12, opacity: 0.72 }}>Canceladas</div>
                  <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
                    {recorrenciasSummary.canceladas}
                  </div>
                </div>

                <div style={miniCard}>
                  <div style={{ fontSize: 12, opacity: 0.72 }}>Encerradas</div>
                  <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
                    {recorrenciasSummary.encerradas}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "1fr 1fr",
            marginBottom: 14,
          }}
        >
          <div style={card}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>Vendas por vendedor</div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={th}>Vendedor</th>
                    <th style={th}>Qtd.</th>
                    <th style={th}>Bruto</th>
                    <th style={th}>Líquido</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td style={td} colSpan={4}>
                        Carregando...
                      </td>
                    </tr>
                  ) : bySeller.length === 0 ? (
                    <tr>
                      <td style={td} colSpan={4}>
                        Nenhum dado encontrado.
                      </td>
                    </tr>
                  ) : (
                    bySeller.map((row) => (
                      <tr key={row.label}>
                        <td style={td}>{row.label}</td>
                        <td style={td}>{row.count}</td>
                        <td style={td}>{formatBRL(row.gross)}</td>
                        <td style={td}>{formatBRL(row.net)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>Vendas por forma de pagamento</div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={th}>Pagamento</th>
                    <th style={th}>Qtd.</th>
                    <th style={th}>Bruto</th>
                    <th style={th}>Líquido</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td style={td} colSpan={4}>
                        Carregando...
                      </td>
                    </tr>
                  ) : byPayment.length === 0 ? (
                    <tr>
                      <td style={td} colSpan={4}>
                        Nenhum dado encontrado.
                      </td>
                    </tr>
                  ) : (
                    byPayment.map((row) => (
                      <tr key={row.label}>
                        <td style={td}>{row.label}</td>
                        <td style={td}>{row.count}</td>
                        <td style={td}>{formatBRL(row.gross)}</td>
                        <td style={td}>{formatBRL(row.net)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "1fr 1fr",
            marginBottom: 14,
          }}
        >
          <div style={card}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>Vendas por origem</div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={th}>Origem</th>
                    <th style={th}>Qtd.</th>
                    <th style={th}>Bruto</th>
                    <th style={th}>Líquido</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td style={td} colSpan={4}>
                        Carregando...
                      </td>
                    </tr>
                  ) : bySource.length === 0 ? (
                    <tr>
                      <td style={td} colSpan={4}>
                        Nenhum dado encontrado.
                      </td>
                    </tr>
                  ) : (
                    bySource.map((row) => (
                      <tr key={row.label}>
                        <td style={td}>{row.label}</td>
                        <td style={td}>{row.count}</td>
                        <td style={td}>{formatBRL(row.gross)}</td>
                        <td style={td}>{formatBRL(row.net)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>
            {filterMode === "monthly" ? "Vendas por mês" : "Vendas por mês do ano"}
            </div>

            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
              <tr>
              <th style={th}>Mês</th>
      <th style={th}>Qtd.</th>
      <th style={th}>Avulsas</th>
      <th style={th}>Recorrentes</th>
      <th style={th}>Bruto</th>
      <th style={th}>Líquido</th>
      </tr>
      </thead>

              <tbody>
              {loading ? (
                <tr>
                <td style={td} colSpan={3}>
                  Carregando...
                </td>
                </tr>
              ) : forecastMonthly.length === 0 ? (
                <tr>
                <td style={td} colSpan={3}>
                  Nenhum dado encontrado.
                </td>
                </tr>
              ) : (
                monthlySales.map((row) => (
      <tr key={row.month}>
      <td style={td}>{formatMonthLabel(row.month)}</td>
      <td style={td}>{row.count}</td>
      <td style={td}>{row.avulsas}</td>
      <td style={td}>{row.recorrentes}</td>
      <td style={td}>{formatBRL(row.gross)}</td>
      <td style={td}>{formatBRL(row.net)}</td>
      </tr>
                ))
              )}
              </tbody>
            </table>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "1fr 1fr",
            marginBottom: 14,
          }}
        >
          <div style={card}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>
              Clientes por sexo
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={th}>Sexo</th>
                    <th style={th}>Qtd.</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td style={td} colSpan={2}>
                        Carregando...
                      </td>
                    </tr>
                  ) : clientsBySex.length === 0 ? (
                    <tr>
                      <td style={td} colSpan={2}>
                        Nenhum dado encontrado.
                      </td>
                    </tr>
                  ) : (
                    clientsBySex.map((row) => (
                      <tr key={row.label}>
                        <td style={td}>{row.label}</td>
                        <td style={td}>{row.count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>
              Clientes por idade
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={th}>Faixa etária</th>
                    <th style={th}>Qtd.</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td style={td} colSpan={2}>
                        Carregando...
                      </td>
                    </tr>
                  ) : clientsByAge.length === 0 ? (
                    <tr>
                      <td style={td} colSpan={2}>
                        Nenhum dado encontrado.
                      </td>
                    </tr>
                  ) : (
                    clientsByAge.map((row) => (
                      <tr key={row.label}>
                        <td style={td}>{row.label}</td>
                        <td style={td}>{row.count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "1fr 1fr",
          }}
        >
                        
        </div>
      </div>
    </div>
  );
}