"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAdminAccess } from "../_hooks/useAdminAccess";

type ForecastSummaryRow = {
  month_ref: string | null;
  active_count: number | null;
  expected_amount: number | null;
  overdue_amount: number | null;
};

type ForecastMonthlyRow = {
  month_ref: string | null;
  expected_amount: number | null;
  active_count: number | null;
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
  const [forecastSummary, setForecastSummary] = useState<ForecastSummaryRow[]>([]);
  const [forecastMonthly, setForecastMonthly] = useState<ForecastMonthlyRow[]>([]);

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
          .select("month_ref,active_count,expected_amount,overdue_amount")
          .order("month_ref", { ascending: true }),
        supabase
          .from("v_recorrencias_forecast_monthly")
          .select("month_ref,expected_amount,active_count")
          .order("month_ref", { ascending: true }),
      ]);

    if (summaryErr) console.error("forecast summary error:", summaryErr);
    if (monthlyErr) console.error("forecast monthly error:", monthlyErr);

    setForecastSummary((summaryData as any) ?? []);
    setForecastMonthly((monthlyData as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) {
      fetchAll();
    }
  }, [isAdmin]);

  const totals = useMemo(() => {
    const expected = forecastMonthly.reduce(
      (acc, row) => acc + Number(row.expected_amount ?? 0),
      0
    );

    const active = forecastMonthly.reduce(
      (acc, row) => acc + Number(row.active_count ?? 0),
      0
    );

    const overdue = forecastSummary.reduce(
      (acc, row) => acc + Number(row.overdue_amount ?? 0),
      0
    );

    return { expected, active, overdue };
  }, [forecastMonthly, forecastSummary]);

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
                Previsto: {formatBRL(totals.expected)}
              </span>
              <span style={chipStyle("warn")}>
                Em atraso: {formatBRL(totals.overdue)}
              </span>
              <span style={chipStyle("muted")}>
                Ativos: {totals.active}
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
                    <th style={th}>Ativos</th>
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
                    forecastMonthly.map((row, idx) => (
                      <tr key={`${row.month_ref}-${idx}`}>
                        <td style={td}>{formatMonthLabel(row.month_ref)}</td>
                        <td style={td}>{formatBRL(row.expected_amount)}</td>
                        <td style={td}>{Number(row.active_count ?? 0)}</td>
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

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={th}>Mês</th>
                    <th style={th}>Ativos</th>
                    <th style={th}>Previsto</th>
                    <th style={th}>Atrasado</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td style={td} colSpan={4}>
                        Carregando...
                      </td>
                    </tr>
                  ) : forecastSummary.length === 0 ? (
                    <tr>
                      <td style={td} colSpan={4}>
                        Nenhum dado encontrado.
                      </td>
                    </tr>
                  ) : (
                    forecastSummary.map((row, idx) => (
                      <tr key={`${row.month_ref}-${idx}`}>
                        <td style={td}>{formatMonthLabel(row.month_ref)}</td>
                        <td style={td}>{Number(row.active_count ?? 0)}</td>
                        <td style={td}>{formatBRL(row.expected_amount)}</td>
                        <td style={td}>{formatBRL(row.overdue_amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}