"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAdminAccess } from "../_hooks/useAdminAccess";

type ForecastSummaryRow = Record<string, any>;

type ForecastMonthlyRawRow = {
  month: string | null;
  expected_revenue: number | null;
};

type ForecastMonthlyGroupedRow = {
  month: string;
  expected_amount: number;
  active_count: number;
};

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
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}/${yyyy}`;
  }

  return text;
}

function chipStyle(kind: "primary" | "muted" | "warn" = "muted"): React.CSSProperties {
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

export default function RelatoriosPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [loading, setLoading] = useState(true);
  const [forecastSummary, setForecastSummary] = useState<ForecastSummaryRow | null>(null);
  const [forecastMonthlyRaw, setForecastMonthlyRaw] = useState<ForecastMonthlyRawRow[]>([]);

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [loadingRole, isAdmin, router]);

  async function fetchAll() {
    setLoading(true);

    const [{ data: summaryData, error: summaryErr }, { data: monthlyData, error: monthlyErr }] =
      await Promise.all([
        supabase
          .from("v_recorrencias_forecast_summary")
          .select("*")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("v_recorrencias_forecast_monthly")
          .select("month,expected_revenue")
          .order("month", { ascending: true }),
      ]);

    if (summaryErr) console.error("forecast summary error:", JSON.stringify(summaryErr, null, 2));
    if (monthlyErr) console.error("forecast monthly error:", JSON.stringify(monthlyErr, null, 2));

    setForecastSummary((summaryData as any) ?? null);
    setForecastMonthlyRaw((monthlyData as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) {
      fetchAll();
    }
  }, [isAdmin]);

  const forecastMonthly = useMemo<ForecastMonthlyGroupedRow[]>(() => {
    const map = new Map<string, ForecastMonthlyGroupedRow>();

    for (const row of forecastMonthlyRaw) {
      const month = String(row.month ?? "").trim();
      if (!month) continue;

      const expected = Number(row.expected_revenue ?? 0);

      if (!map.has(month)) {
        map.set(month, {
          month,
          expected_amount: 0,
          active_count: 0,
        });
      }

      const current = map.get(month)!;
      current.expected_amount += expected;
      current.active_count += 1;
    }

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [forecastMonthlyRaw]);

  const summaryCards = useMemo(() => {
    const expectedThis = Number(forecastSummary?.expected_this ?? 0);
    const expectedNext = Number(forecastSummary?.expected_next ?? 0);
    const expectedNext3 = Number(
      forecastSummary?.expected_next_3 ??
        forecastSummary?.expected_next_three ??
        forecastSummary?.expected_3_months ??
        0
    );

    return {
      expectedThis,
      expectedNext,
      expectedNext3,
    };
  }, [forecastSummary]);

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
              <span style={chipStyle("primary")}>
                Este mês: {formatBRL(summaryCards.expectedThis)}
              </span>
              <span style={chipStyle("warn")}>
                Próximo mês: {formatBRL(summaryCards.expectedNext)}
              </span>
              <span style={chipStyle("muted")}>
                Próx. 3 meses: {formatBRL(summaryCards.expectedNext3)}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => router.push("/dashboard")} style={btn}>
              Voltar
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          <div style={card}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>
              Forecast mensal
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={th}>Mês</th>
                    <th style={th}>Previsto</th>
                    <th style={th}>Qtd. lançamentos</th>
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
                    forecastMonthly.map((row) => (
                      <tr key={row.month}>
                        <td style={td}>{formatMonthLabel(row.month)}</td>
                        <td style={td}>{formatBRL(row.expected_amount)}</td>
                        <td style={td}>{row.active_count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>
              Resumo do forecast
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.72 }}>Este mês</div>
                <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>
                  {formatBRL(summaryCards.expectedThis)}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.72 }}>Próximo mês</div>
                <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>
                  {formatBRL(summaryCards.expectedNext)}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.72 }}>Próximos 3 meses</div>
                <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>
                  {formatBRL(summaryCards.expectedNext3)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}