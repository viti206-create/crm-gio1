"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";

type AnyRow = Record<string, any>;

function n(row: AnyRow, keys: string[], fallback = 0) {
  for (const k of keys) {
    const v = row?.[k];
    if (v === 0) return 0;
    if (v !== undefined && v !== null && v !== "") return Number(v);
  }
  return fallback;
}

function s(row: AnyRow, keys: string[], fallback = "") {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).length > 0) return String(v);
  }
  return fallback;
}

function formatBRL(value: number) {
  try {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${Number(value || 0).toFixed(2)}`;
  }
}

function formatDateShort(iso: string) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
  } catch {
    return iso;
  }
}

function formatMonthLabel(iso: string) {
  try {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}/${yyyy}`;
  } catch {
    return iso;
  }
}

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
    fontWeight: 900,
  };
}

export default function RelatoriosPremium() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [dash, setDash] = useState<AnyRow | null>(null);
  const [daily, setDaily] = useState<AnyRow[]>([]);
  const [funnelPeriod, setFunnelPeriod] = useState<AnyRow[]>([]);

  const [forecastSummary, setForecastSummary] = useState<any | null>(null);
  const [forecastMonthly, setForecastMonthly] = useState<any[]>([]);

  const [sourceFilter, setSourceFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchAll() {
    setLoading(true);
    setErr(null);

    const dashRes = await supabase.from("v_funnel_dashboard").select("*").limit(1);

    const dailyRes = await supabase
      .from("v_daily_leads_sales")
      .select("*")
      .order("day", { ascending: true })
      .limit(90);

    const periodRes = await supabase
      .from("v_funnel_by_period")
      .select("*")
      .order("month", { ascending: false })
      .limit(2000);

    const forecastSummaryRes = await supabase
      .from("v_recorrencias_forecast_summary")
      .select("*")
      .limit(1);

    // Se você criou a view agregada por mês, troque aqui por:
    // .from("v_recorrencias_forecast_by_month")
    const forecastMonthlyRes = await supabase
      .from("v_recorrencias_forecast_monthly")
      .select("*")
      .order("month", { ascending: true })
      .limit(24);

    if (dashRes.error) console.error(dashRes.error);
    if (dailyRes.error) console.error(dailyRes.error);
    if (periodRes.error) console.error(periodRes.error);
    if (forecastSummaryRes.error) console.error(forecastSummaryRes.error);
    if (forecastMonthlyRes.error) console.error(forecastMonthlyRes.error);

    const anyError =
      dashRes.error ||
      dailyRes.error ||
      periodRes.error ||
      forecastSummaryRes.error ||
      forecastMonthlyRes.error;

    if (anyError) {
      setErr(anyError.message || "Erro ao carregar relatórios");
    }

    setDash((dashRes.data?.[0] as AnyRow) ?? null);
    setDaily((dailyRes.data as AnyRow[]) ?? []);
    setFunnelPeriod((periodRes.data as AnyRow[]) ?? []);
    setForecastSummary((forecastSummaryRes.data?.[0] as AnyRow) ?? null);
    setForecastMonthly((forecastMonthlyRes.data as AnyRow[]) ?? []);

    setLoading(false);
  }

  const dailyChart = useMemo(() => {
    return (daily ?? []).map((r) => {
      const dayIso = s(r, ["day", "date", "dt", "created_day"], "");
      const leads = n(r, ["leads", "leads_received", "leads_total", "qty_leads", "received"], 0);
      const sales = n(r, ["sales", "sales_count", "qty_sales", "closed_sales"], 0);
      const revenue = n(r, ["revenue", "revenue_sum", "closed_value", "sales_value", "total_value"], 0);

      return { day: dayIso ? formatDateShort(dayIso) : "", leads, sales, revenue };
    });
  }, [daily]);

  const forecastMonthlyChart = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const r of forecastMonthly ?? []) {
      const month = s(r, ["month"], "");
      const value = n(r, ["expected_revenue"], 0);
      if (!month) continue;
      grouped.set(month, (grouped.get(month) ?? 0) + value);
    }

    return Array.from(grouped.entries()).map(([month, expected_revenue]) => ({
      month,
      label: formatMonthLabel(month),
      expected_revenue,
    }));
  }, [forecastMonthly]);

  const kpis = useMemo(() => {
    if (dash) {
      const leadsTotal = n(dash, ["leads_total", "total_leads", "total"], 0);
      const inProgress = n(dash, ["in_progress", "leads_em_progresso", "progress"], 0);
      const closed = n(dash, ["closed_total", "fechados_total", "closed"], 0);
      const lost = n(dash, ["lost_total", "perdidos_total", "lost"], 0);
      const revenue = n(dash, ["revenue_total", "receita_total", "revenue"], 0);

      const convAgendou = n(dash, ["conv_agendou", "tx_agendou"], NaN);
      const convCompareceu = n(dash, ["conv_compareceu", "tx_compareceu"], NaN);
      const convFechou = n(dash, ["conv_fechou", "tx_fechou"], NaN);

      return {
        leadsTotal,
        inProgress,
        closed,
        lost,
        revenue,
        convAgendou: Number.isFinite(convAgendou) ? convAgendou : null,
        convCompareceu: Number.isFinite(convCompareceu) ? convCompareceu : null,
        convFechou: Number.isFinite(convFechou) ? convFechou : null,
      };
    }

    const months = Array.from(new Set((funnelPeriod ?? []).map((r) => s(r, ["month"], "")))).filter(Boolean);
    const lastMonth = months.sort().reverse()[0];

    const subset = (funnelPeriod ?? []).filter((r) => s(r, ["month"], "") === lastMonth);
    const sumAll = subset.reduce((acc, r) => acc + n(r, ["qty", "count", "total"], 0), 0);

    return {
      leadsTotal: sumAll,
      inProgress: 0,
      closed: 0,
      lost: 0,
      revenue: 0,
      convAgendou: null,
      convCompareceu: null,
      convFechou: null,
    };
  }, [dash, funnelPeriod]);

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of funnelPeriod) {
      const src = s(r, ["source"], "");
      if (src) set.add(src);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [funnelPeriod]);

  const campaignOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of funnelPeriod) {
      const camp = s(r, ["campaign"], "");
      if (camp) set.add(camp);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [funnelPeriod]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of funnelPeriod) {
      const m = s(r, ["month"], "");
      if (m) set.add(m);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [funnelPeriod]);

  const filteredPeriod = useMemo(() => {
    return (funnelPeriod ?? []).filter((r) => {
      const src = s(r, ["source"], "");
      const camp = s(r, ["campaign"], "");
      const month = s(r, ["month"], "");

      if (sourceFilter !== "all" && src !== sourceFilter) return false;
      if (campaignFilter !== "all" && camp !== campaignFilter) return false;
      if (monthFilter !== "all" && month !== monthFilter) return false;

      return true;
    });
  }, [funnelPeriod, sourceFilter, campaignFilter, monthFilter]);

  const funnelAgg = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filteredPeriod) {
      const st = s(r, ["status"], "—");
      const qty = n(r, ["qty", "count", "total"], 0);
      m.set(st, (m.get(st) ?? 0) + qty);
    }
    const arr = Array.from(m.entries()).map(([status, qty]) => ({ status, qty }));
    arr.sort((a, b) => b.qty - a.qty);
    return arr;
  }, [filteredPeriod]);

  const page: React.CSSProperties = { padding: 16, color: "white" };

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
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
  };

  const title: React.CSSProperties = { fontSize: 18, fontWeight: 950, letterSpacing: 0.2 };
  const soft: React.CSSProperties = { fontSize: 12, opacity: 0.7 };

  const gridTop: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 12,
    marginTop: 12,
  };

  const kpiTitle: React.CSSProperties = { fontSize: 12, opacity: 0.8, fontWeight: 900 };
  const kpiValue: React.CSSProperties = { fontSize: 28, fontWeight: 950, marginTop: 6, lineHeight: "32px" };

  const gridMain: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
    gap: 12,
    marginTop: 12,
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    outline: "none",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    minWidth: 210,
    cursor: "pointer",
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
      <div style={shell}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={title}>Relatórios</div>
            <div style={soft}>Visão de funil, conversões, performance diária e previsão recorrente</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {loading ? (
              <span style={chipStyle("primary")}>Carregando…</span>
            ) : (
              <span style={chipStyle("muted")}>OK</span>
            )}
            <button
              onClick={fetchAll}
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.12)",
                padding: "10px 12px",
                borderRadius: 12,
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              Atualizar
            </button>
          </div>
        </div>

        {err ? <div style={{ ...soft, color: "#ff6b6b", marginTop: 10 }}>{err}</div> : null}

        {/* KPIs */}
        <div style={gridTop}>
          <div style={card}>
            <div style={kpiTitle}>Leads (total)</div>
            <div style={kpiValue}>{kpis.leadsTotal}</div>
            <div style={soft}>Base geral</div>
          </div>

          <div style={card}>
            <div style={kpiTitle}>Em progresso</div>
            <div style={kpiValue}>{kpis.inProgress}</div>
            <div style={soft}>Se disponível no dashboard</div>
          </div>

          <div style={card}>
            <div style={kpiTitle}>Fechados</div>
            <div style={kpiValue}>{kpis.closed}</div>
            <div style={soft}>Total de vendas</div>
          </div>

          <div style={card}>
            <div style={kpiTitle}>Perdidos</div>
            <div style={kpiValue}>{kpis.lost}</div>
            <div style={soft}>Total perdidos</div>
          </div>

          <div style={card}>
            <div style={kpiTitle}>Receita</div>
            <div style={kpiValue}>{formatBRL(kpis.revenue)}</div>
            <div style={soft}>Se a view retornar receita</div>
          </div>
        </div>

        {/* Previsão recorrências */}
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            marginTop: 12,
          }}
        >
          <div style={card}>
            <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>
              Previsão este mês
            </div>
            <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6, lineHeight: "32px" }}>
              {formatBRL(Number(forecastSummary?.expected_this_month ?? 0))}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Recorrências ativas previstas no mês atual
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>
              Previsão próximo mês
            </div>
            <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6, lineHeight: "32px" }}>
              {formatBRL(Number(forecastSummary?.expected_next_month ?? 0))}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Recorrências previstas para o mês seguinte
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>
              Previsão próximos 90 dias
            </div>
            <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6, lineHeight: "32px" }}>
              {formatBRL(Number(forecastSummary?.expected_next_90_days ?? 0))}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Soma projetada das recorrências futuras
            </div>
          </div>
        </div>

        {/* Charts */}
        <div style={gridMain}>
          {/* Série diária */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 16 }}>Leads e vendas (diário)</div>
              <div style={soft}>últimos {dailyChart.length} dias</div>
            </div>

            <div style={{ height: 280, marginTop: 10 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyChart}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(10,8,14,0.95)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      color: "white",
                    }}
                  />
                  <Line type="monotone" dataKey="leads" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sales" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <span style={chipStyle("muted")}>Linha 1: leads</span>
              <span style={chipStyle("muted")}>Linha 2: vendas</span>
            </div>
          </div>

          {/* Funil (agregado) */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 16 }}>Funil (status atual)</div>
              <div style={soft}>filtrado por mês/origem/campanha</div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <select style={selectStyle} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
                <option value="all">Todos os meses</option>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <select style={selectStyle} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="all">Todas as origens</option>
                {sourceOptions.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>

              <select style={selectStyle} value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}>
                <option value="all">Todas as campanhas</option>
                {campaignOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  setMonthFilter("all");
                  setSourceFilter("all");
                  setCampaignFilter("all");
                }}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.12)",
                  padding: "10px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Limpar
              </button>
            </div>

            <div style={{ height: 280, marginTop: 10 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelAgg}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="status" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(10,8,14,0.95)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      color: "white",
                    }}
                  />
                  <Bar dataKey="qty" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <span style={chipStyle("muted")}>Cada barra = quantidade no status</span>
            </div>
          </div>
        </div>

        {/* Previsão mensal recorrências */}
        <div style={{ ...card, marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <div style={{ fontWeight: 950, fontSize: 16 }}>Previsão mensal das recorrências</div>
            <div style={soft}>próximos {forecastMonthlyChart.length} meses</div>
          </div>

          <div style={{ height: 280, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={forecastMonthlyChart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }} />
                <Tooltip
                  formatter={(value: any) => formatBRL(Number(value ?? 0))}
                  contentStyle={{
                    background: "rgba(10,8,14,0.95)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    color: "white",
                  }}
                />
                <Bar dataKey="expected_revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabela detalhada */}
        <div style={{ ...card, marginTop: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <div style={{ fontWeight: 950, fontSize: 16 }}>Detalhe (mês • origem • campanha • status)</div>
            <div style={soft}>linhas: {filteredPeriod.length}</div>
          </div>

          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={th}>Mês</th>
                  <th style={th}>Origem</th>
                  <th style={th}>Campanha</th>
                  <th style={th}>Status</th>
                  <th style={th}>Qtd</th>
                </tr>
              </thead>
              <tbody>
                {filteredPeriod.length === 0 ? (
                  <tr>
                    <td style={td} colSpan={5}>
                      <div style={{ opacity: 0.75 }}>{loading ? "Carregando..." : "Sem dados para esses filtros."}</div>
                    </td>
                  </tr>
                ) : (
                  filteredPeriod.slice(0, 300).map((r, idx) => {
                    const month = s(r, ["month"], "—");
                    const source = s(r, ["source"], "—");
                    const campaign = s(r, ["campaign"], "—");
                    const status = s(r, ["status"], "—");
                    const qty = n(r, ["qty", "count", "total"], 0);

                    return (
                      <tr key={`${month}-${source}-${campaign}-${status}-${idx}`}>
                        <td style={td}>{month}</td>
                        <td style={td}>
                          <span style={chipStyle("muted")}>{source}</span>
                        </td>
                        <td style={td}>{campaign || "—"}</td>
                        <td style={td}>
                          <span style={chipStyle("primary")}>{status}</span>
                        </td>
                        <td style={td} title="Quantidade">
                          <b>{qty}</b>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filteredPeriod.length > 300 ? (
            <div style={{ marginTop: 10, ...soft }}>Mostrando 300 de {filteredPeriod.length} (por performance).</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}