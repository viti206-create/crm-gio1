"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Tx = {
  id: string;
  scope: string;
  kind: string;
  status: string;
  description: string;
  amount: number;
  gross_amount: number | null;
  net_amount: number | null;
  due_date: string | null;
  paid_at: string | null;
  competency_date: string | null;
  counterparty_name: string | null;
  notes: string | null;
  is_future: boolean;
  category_id: string | null;
  account_id: string | null;
};

type Category = { id: string; name: string; color: string | null; };
type Account = { id: string; name: string; };

function formatBRL(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WEEK_DAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

export default function FinanceiroClinicaPage() {
  const router = useRouter();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [view, setView] = useState<"calendar" | "list">("calendar");

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [txRes, catRes, accRes] = await Promise.all([
      supabase.from("financial_transactions").select("*").eq("scope", "clinic").order("due_date", { ascending: true }),
      supabase.from("financial_categories").select("id,name,color").eq("scope", "clinic"),
      supabase.from("financial_accounts").select("id,name").eq("scope", "clinic"),
    ]);
    setTransactions((txRes.data as any) ?? []);
    setCategories((catRes.data as any) ?? []);
    setAccounts((accRes.data as any) ?? []);
    setLoading(false);
  }

  function prevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
    setExpandedDay(null);
  }

  function nextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
    setExpandedDay(null);
  }

  function goToday() {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setExpandedDay(null);
  }

  // Filtrar transações do mês atual do calendário
  const txOfMonth = useMemo(() => {
    return transactions.filter(tx => {
      const dateStr = tx.due_date || tx.paid_at || tx.competency_date;
      if (!dateStr) return false;
      const d = new Date(dateStr + "T12:00:00");
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });
  }, [transactions, currentYear, currentMonth]);

  // Totais do mês visível no calendário (não do mês atual)
  const totals = useMemo(() => {
    const receitas = txOfMonth.filter(tx => tx.kind === "income").reduce((s, tx) => s + Number(tx.amount ?? 0), 0);
    const despesas = txOfMonth.filter(tx => tx.kind === "expense").reduce((s, tx) => s + Number(tx.amount ?? 0), 0);
    const resultado = receitas - despesas;

    // Previsto: pendentes do mês
    const previsto = txOfMonth.filter(tx => tx.status === "pending").reduce((s, tx) => {
      return s + (tx.kind === "income" ? Number(tx.amount ?? 0) : -Number(tx.amount ?? 0));
    }, 0);

    return { receitas, despesas, resultado, previsto };
  }, [txOfMonth]);

  // Agrupar por dia do mês
  const txByDay = useMemo(() => {
    const map = new Map<number, Tx[]>();
    for (const tx of txOfMonth) {
      const dateStr = tx.due_date || tx.paid_at || tx.competency_date;
      if (!dateStr) continue;
      const d = new Date(dateStr + "T12:00:00");
      const day = d.getDate();
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(tx);
    }
    return map;
  }, [txOfMonth]);

  function txColor(tx: Tx) {
    if (tx.status === "late") return "rgba(255,120,80,0.85)";
    if (tx.kind === "income" && tx.status === "paid") return "rgba(80,200,120,0.85)";
    if (tx.kind === "income") return "rgba(80,180,255,0.85)";
    if (tx.status === "paid") return "rgba(100,120,255,0.85)";
    return "rgba(100,120,255,0.70)";
  }

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfWeek(currentYear, currentMonth);
  const isThisMonth = currentYear === today.getFullYear() && currentMonth === today.getMonth();

  const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 14 };
  const btn: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 };
  const btnActive: React.CSSProperties = { ...btn, border: "1px solid rgba(180,120,255,0.4)", background: "rgba(180,120,255,0.2)" };

  return (
    <div style={{ color: "white", display: "grid", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 950 }}>Financeiro Clínica</div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2, border: "1px solid rgba(255,255,255,0.12)", padding: "2px 10px", borderRadius: 999, display: "inline-block" }}>Scope: clinic</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => router.back()} style={btn}>Voltar</button>
          <button onClick={() => setView("calendar")} style={view === "calendar" ? btnActive : btn}>Calendário</button>
          <button onClick={() => router.push("/financeiro/clinica/lancamentos")} style={btn}>Lançamentos</button>
        </div>
      </div>

      {/* Totais — sempre do mês visível no calendário */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Receitas</div>
          <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4, color: "#78ffb4" }}>{formatBRL(totals.receitas)}</div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Total líquido de {MONTH_NAMES[currentMonth].toLowerCase()} de {currentYear}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Despesas</div>
          <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4, color: "#ff8080" }}>{formatBRL(totals.despesas)}</div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Despesas de {MONTH_NAMES[currentMonth].toLowerCase()}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Resultado</div>
          <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4, color: totals.resultado >= 0 ? "#78ffb4" : "#ff8080" }}>{formatBRL(totals.resultado)}</div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Receitas menos despesas</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Previsto</div>
          <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4 }}>{formatBRL(totals.previsto)}</div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Compromissos pendentes de {MONTH_NAMES[currentMonth].toLowerCase()}</div>
        </div>
      </div>

      {loading && <div style={{ opacity: 0.7 }}>Carregando...</div>}

      {/* Controles do calendário */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 950 }}>
          {MONTH_NAMES[currentMonth]} de {currentYear}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={prevMonth} style={btn}>Anterior</button>
          <button onClick={goToday} style={isThisMonth ? btnActive : btn}>Hoje</button>
          <button onClick={nextMonth} style={btn}>Próximo</button>
        </div>
      </div>

      {/* Legenda */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { color: "rgba(80,200,120,0.85)", label: "Receber" },
          { color: "rgba(255,120,80,0.85)", label: "Pagar" },
          { color: "rgba(100,120,255,0.85)", label: "Pago" },
          { color: "rgba(255,120,80,0.85)", label: "Atrasado" },
        ].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: l.color, display: "inline-block" }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Calendário */}
      {view === "calendar" && (
        <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
          {/* Cabeçalho dos dias da semana */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "rgba(255,255,255,0.04)" }}>
            {WEEK_DAYS.map(d => (
              <div key={d} style={{ padding: "10px 8px", textAlign: "center", fontWeight: 900, fontSize: 13, opacity: 0.8, borderRight: "1px solid rgba(255,255,255,0.06)" }}>{d}</div>
            ))}
          </div>

          {/* Grid dos dias */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {/* Dias em branco antes do início do mês */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`blank-${i}`} style={{ minHeight: 100, borderRight: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }} />
            ))}

            {/* Dias do mês */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayTx = txByDay.get(day) ?? [];
              const isToday = isThisMonth && day === today.getDate();
              const isExpanded = expandedDay === day;
              const MAX_VISIBLE = 3;
              const visibleTx = isExpanded ? dayTx : dayTx.slice(0, MAX_VISIBLE);
              const hiddenCount = dayTx.length - MAX_VISIBLE;

              return (
                <div key={day} style={{
                  minHeight: 100, padding: "6px 6px 8px",
                  borderRight: "1px solid rgba(255,255,255,0.06)",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  background: isToday ? "rgba(180,120,255,0.08)" : "transparent",
                  verticalAlign: "top",
                }}>
                  <div style={{
                    fontSize: 13, fontWeight: isToday ? 950 : 700,
                    color: isToday ? "rgba(180,120,255,0.95)" : "rgba(255,255,255,0.85)",
                    marginBottom: 4, textAlign: "right",
                  }}>{day}</div>

                  <div style={{ display: "grid", gap: 3 }}>
                    {visibleTx.map(tx => (
                      <div key={tx.id} style={{
                        background: txColor(tx),
                        borderRadius: 6, padding: "3px 6px",
                        fontSize: 11, fontWeight: 700,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }} title={`${tx.description} — ${formatBRL(tx.amount)}`}>
                        {tx.description}
                        <span style={{ opacity: 0.85, marginLeft: 4 }}>{formatBRL(tx.amount)}</span>
                      </div>
                    ))}

                    {/* Botão +N clicável para expandir */}
                    {!isExpanded && hiddenCount > 0 && (
                      <button
                        onClick={() => setExpandedDay(day)}
                        style={{
                          background: "rgba(180,120,255,0.15)",
                          border: "1px solid rgba(180,120,255,0.3)",
                          borderRadius: 6, padding: "3px 6px",
                          fontSize: 11, fontWeight: 700, color: "white",
                          cursor: "pointer", textAlign: "left",
                        }}
                      >
                        +{hiddenCount} mais
                      </button>
                    )}

                    {/* Botão para recolher */}
                    {isExpanded && dayTx.length > MAX_VISIBLE && (
                      <button
                        onClick={() => setExpandedDay(null)}
                        style={{
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 6, padding: "3px 6px",
                          fontSize: 11, fontWeight: 700, color: "white",
                          cursor: "pointer", textAlign: "left",
                        }}
                      >
                        ▲ recolher
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lista de lançamentos */}
      {view === "list" && (
        <div style={{ display: "grid", gap: 8 }}>
          {txOfMonth.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Nenhum lançamento em {MONTH_NAMES[currentMonth]} de {currentYear}.</div>
          ) : txOfMonth.map(tx => (
            <div key={tx.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: "10px 14px",
              background: "rgba(255,255,255,0.03)", gap: 12, flexWrap: "wrap",
            }}>
              <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                <div style={{ fontWeight: 900 }}>{tx.description}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {tx.due_date ?? tx.paid_at ?? "—"} • {tx.counterparty_name ?? "—"} • {tx.status}
                </div>
              </div>
              <div style={{ fontWeight: 900, fontSize: 15, color: tx.kind === "income" ? "#78ffb4" : "#ff8080", whiteSpace: "nowrap" }}>
                {tx.kind === "expense" ? "-" : ""}{formatBRL(tx.amount)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
