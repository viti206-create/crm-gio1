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
  due_date: string | null;
  paid_at: string | null;
  competency_date: string | null;
  counterparty_name: string | null;
  notes: string | null;
  import_source: string | null;
};

type EditForm = {
  description: string;
  amount: string;
  due_date: string;
  status: string;
  kind: string;
};

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

export default function FinanceiroPessoalPage() {
  const router = useRouter();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [view, setView] = useState<"calendar" | "list">("list");
  const [filterSource, setFilterSource] = useState<"all" | "conta_corrente" | "cartao">("all");
  const [movingTx, setMovingTx] = useState<string | null>(null);
  const [deletingTx, setDeletingTx] = useState<string | null>(null);
  const [editTx, setEditTx] = useState<Tx | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const { data } = await supabase
      .from("financial_transactions")
      .select("id,scope,kind,status,description,amount,due_date,paid_at,competency_date,counterparty_name,notes,import_source")
      .eq("scope", "personal")
      .order("due_date", { ascending: false });
    setTransactions((data as any) ?? []);
    setLoading(false);
  }

  function openEdit(tx: Tx) {
    setEditTx(tx);
    setEditForm({
      description: tx.description ?? "",
      amount: String(tx.amount ?? ""),
      due_date: tx.due_date ?? tx.paid_at ?? "",
      status: tx.status ?? "paid",
      kind: tx.kind ?? "expense",
    });
  }

  async function saveEdit() {
    if (!editTx || !editForm) return;
    setEditSaving(true);
    const { error } = await supabase.from("financial_transactions").update({
      description: editForm.description.trim(),
      amount: parseFloat(editForm.amount.replace(",", ".")),
      due_date: editForm.due_date || null,
      paid_at: editForm.status === "paid" || editForm.status === "received" ? editForm.due_date || null : null,
      status: editForm.status,
      kind: editForm.kind,
    }).eq("id", editTx.id);
    setEditSaving(false);
    if (error) { alert("Erro: " + error.message); return; }
    setEditTx(null); setEditForm(null);
    await fetchAll();
  }

  async function deleteTx(tx: Tx) {
    const ok = window.confirm(`Excluir "${tx.description}"? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    setDeletingTx(tx.id);
    const { error } = await supabase.from("financial_transactions").delete().eq("id", tx.id);
    setDeletingTx(null);
    if (error) { alert("Erro: " + error.message); return; }
    await fetchAll();
  }

  async function moveToClinica(tx: Tx) {
    const ok = window.confirm(`Mover "${tx.description}" para o Financeiro Clínica?`);
    if (!ok) return;
    setMovingTx(tx.id);
    const { error } = await supabase
      .from("financial_transactions")
      .update({ scope: "clinic" })
      .eq("id", tx.id);
    setMovingTx(null);
    if (error) { alert("Erro: " + error.message); return; }
    await fetchAll();
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

  // Filtrar por source (cartão vs conta corrente vs todos)
  const txFiltered = useMemo(() => {
    if (filterSource === "all") return transactions;
    return transactions.filter(tx => tx.import_source === filterSource);
  }, [transactions, filterSource]);

  const txOfMonth = useMemo(() => {
    return txFiltered.filter(tx => {
      const dateStr = tx.due_date || tx.paid_at || tx.competency_date;
      if (!dateStr) return false;
      const d = new Date(dateStr + "T12:00:00");
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });
  }, [txFiltered, currentYear, currentMonth]);

  const totals = useMemo(() => {
    const receitas = txOfMonth.filter(tx => tx.kind === "income").reduce((s, tx) => s + Number(tx.amount ?? 0), 0);
    const despesas = txOfMonth.filter(tx => tx.kind === "expense").reduce((s, tx) => s + Number(tx.amount ?? 0), 0);
    const resultado = receitas - despesas;
    const previsto = txOfMonth.filter(tx => tx.status === "pending").reduce((s, tx) => {
      return s + (tx.kind === "income" ? Number(tx.amount ?? 0) : -Number(tx.amount ?? 0));
    }, 0);
    return { receitas, despesas, resultado, previsto };
  }, [txOfMonth]);

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
    if (tx.status === "received") return "rgba(80,200,120,0.85)";
    if (tx.status === "late") return "rgba(255,120,80,0.85)";
    if (tx.kind === "income" && tx.status === "paid") return "rgba(80,200,120,0.85)";
    if (tx.kind === "income") return "rgba(80,200,120,0.70)";
    if (tx.status === "paid") return "rgba(100,120,255,0.85)";
    return "rgba(100,120,255,0.70)";
  }

  function sourceLabel(src: string | null) {
    if (src === "cartao") return "🃏 Cartão";
    if (src === "conta_corrente") return "🏦 Conta";
    return null;
  }

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfWeek(currentYear, currentMonth);
  const isThisMonth = currentYear === today.getFullYear() && currentMonth === today.getMonth();

  const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 14 };
  const btn: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 };
  const btnActive: React.CSSProperties = { ...btn, border: "1px solid rgba(180,120,255,0.4)", background: "rgba(180,120,255,0.2)" };
  const btnClinica: React.CSSProperties = { ...btn, border: "1px solid rgba(255,200,80,0.3)", background: "rgba(255,200,80,0.10)", color: "#ffc850" };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8, color: "white", padding: "8px 10px", width: "100%",
    fontSize: 14, boxSizing: "border-box" as const,
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.7, marginBottom: 4, display: "block" };

  return (
    <div style={{ color: "white", display: "grid", gap: 14 }}>
      {/* Modal edição */}
      {editTx && editForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#1a1625", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18, padding: 24, width: "100%", maxWidth: 420 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 18 }}>Editar lançamento</div>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={labelStyle}>Descrição</label>
                <input style={inputStyle} value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Valor (R$)</label>
                  <input type="number" step="0.01" style={inputStyle} value={editForm.amount} onChange={e => setEditForm({...editForm, amount: e.target.value})} />
                </div>
                <div>
                  <label style={labelStyle}>Data</label>
                  <input type="date" style={inputStyle} value={editForm.due_date} onChange={e => setEditForm({...editForm, due_date: e.target.value})} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Tipo</label>
                  <select style={{ ...inputStyle, cursor: "pointer" }} value={editForm.kind} onChange={e => setEditForm({...editForm, kind: e.target.value})}>
                    <option value="expense">Despesa</option>
                    <option value="income">Receita</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select style={{ ...inputStyle, cursor: "pointer" }} value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})}>
                    <option value="paid">Pago</option>
                    <option value="received">Recebido</option>
                    <option value="pending">Pendente</option>
                    <option value="late">Atrasado</option>
                  </select>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => { setEditTx(null); setEditForm(null); }} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "white", padding: "8px 18px", borderRadius: 9, cursor: "pointer", fontWeight: 700 }}>Cancelar</button>
              <button onClick={saveEdit} disabled={editSaving} style={{ background: "rgba(180,120,255,0.2)", border: "1px solid rgba(180,120,255,0.4)", color: "white", padding: "8px 18px", borderRadius: 9, cursor: "pointer", fontWeight: 700, opacity: editSaving ? 0.6 : 1 }}>{editSaving ? "Salvando..." : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 950 }}>Financeiro Pessoal</div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2, border: "1px solid rgba(255,255,255,0.12)", padding: "2px 10px", borderRadius: 999, display: "inline-block" }}>Scope: personal</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => router.back()} style={btn}>Voltar</button>
          <button onClick={() => setView("calendar")} style={view === "calendar" ? btnActive : btn}>Calendário</button>
          <button onClick={() => setView("list")} style={view === "list" ? btnActive : btn}>Lançamentos</button>
        </div>
      </div>

      {/* Totais */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Receitas</div>
          <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4, color: "#78ffb4" }}>{formatBRL(totals.receitas)}</div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Total de {MONTH_NAMES[currentMonth].toLowerCase()} de {currentYear}</div>
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
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Pendentes de {MONTH_NAMES[currentMonth].toLowerCase()}</div>
        </div>
      </div>

      {loading && <div style={{ opacity: 0.7 }}>Carregando...</div>}

      {/* Controles */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 950 }}>{MONTH_NAMES[currentMonth]} de {currentYear}</span>
          {/* Filtro cartão vs conta corrente */}
          {(["all", "conta_corrente", "cartao"] as const).map(v => (
            <button key={v} onClick={() => setFilterSource(v)}
              style={{ ...btn, padding: "5px 10px", fontSize: 12,
                background: filterSource === v ? "rgba(180,120,255,0.2)" : "rgba(255,255,255,0.05)",
                border: filterSource === v ? "1px solid rgba(180,120,255,0.4)" : "1px solid rgba(255,255,255,0.12)" }}>
              {v === "all" ? "Todos" : v === "cartao" ? "🃏 Cartão" : "🏦 Conta"}
            </button>
          ))}
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
          { color: "rgba(100,120,255,0.70)", label: "Pagar" },
          { color: "rgba(100,120,255,0.85)", label: "Pago" },
          { color: "rgba(80,200,120,0.85)", label: "Recebido" },
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "rgba(255,255,255,0.04)" }}>
            {WEEK_DAYS.map(d => (
              <div key={d} style={{ padding: "10px 8px", textAlign: "center", fontWeight: 900, fontSize: 13, opacity: 0.8, borderRight: "1px solid rgba(255,255,255,0.06)" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`blank-${i}`} style={{ minHeight: 100, borderRight: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayTx = txByDay.get(day) ?? [];
              const isToday = isThisMonth && day === today.getDate();
              const isExpanded = expandedDay === day;
              const MAX_VISIBLE = 3;
              const visibleTx = isExpanded ? dayTx : dayTx.slice(0, MAX_VISIBLE);
              const hiddenCount = dayTx.length - MAX_VISIBLE;
              return (
                <div key={day} style={{ minHeight: 100, padding: "6px 6px 8px", borderRight: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", background: isToday ? "rgba(180,120,255,0.08)" : "transparent" }}>
                  <div style={{ fontSize: 13, fontWeight: isToday ? 950 : 700, color: isToday ? "rgba(180,120,255,0.95)" : "rgba(255,255,255,0.85)", marginBottom: 4, textAlign: "right" }}>{day}</div>
                  <div style={{ display: "grid", gap: 3 }}>
                    {visibleTx.map(tx => (
                      <div key={tx.id} style={{ background: txColor(tx), borderRadius: 6, padding: "3px 6px", fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${tx.description} — ${formatBRL(tx.amount)}`}>
                        {tx.description} <span style={{ opacity: 0.85 }}>{formatBRL(tx.amount)}</span>
                      </div>
                    ))}
                    {!isExpanded && hiddenCount > 0 && (
                      <button onClick={() => setExpandedDay(day)} style={{ background: "rgba(180,120,255,0.15)", border: "1px solid rgba(180,120,255,0.3)", borderRadius: 6, padding: "3px 6px", fontSize: 11, fontWeight: 700, color: "white", cursor: "pointer", textAlign: "left" }}>
                        +{hiddenCount} mais
                      </button>
                    )}
                    {isExpanded && dayTx.length > MAX_VISIBLE && (
                      <button onClick={() => setExpandedDay(null)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "3px 6px", fontSize: 11, fontWeight: 700, color: "white", cursor: "pointer", textAlign: "left" }}>
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

      {/* Lista */}
      {view === "list" && (
        <div style={{ display: "grid", gap: 8 }}>
          {txOfMonth.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Nenhum lançamento em {MONTH_NAMES[currentMonth]} de {currentYear}.</div>
          ) : txOfMonth.map(tx => (
            <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: "10px 14px", background: "rgba(255,255,255,0.03)", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                <div style={{ fontWeight: 900 }}>{tx.description}</div>
                <div style={{ fontSize: 12, opacity: 0.7, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span>{tx.due_date ?? tx.paid_at ?? "—"}</span>
                  {tx.counterparty_name && <span>• {tx.counterparty_name}</span>}
                  {sourceLabel(tx.import_source) && <span style={{ opacity: 0.8 }}>• {sourceLabel(tx.import_source)}</span>}
                  <span style={{ padding: "1px 6px", borderRadius: 999, background: "rgba(255,255,255,0.06)", fontSize: 11 }}>
                    {tx.status === "paid" ? "Pago" : tx.status === "received" ? "Recebido" : tx.status === "pending" ? "Pendente" : tx.status === "late" ? "Atrasado" : tx.status}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900, fontSize: 15, color: tx.kind === "income" ? "#78ffb4" : "#ff8080", whiteSpace: "nowrap" }}>
                  {tx.kind === "expense" ? "-" : ""}{formatBRL(tx.amount)}
                </div>
                <button onClick={() => openEdit(tx)} style={btn}>Editar</button>
                <button onClick={() => moveToClinica(tx)} disabled={movingTx === tx.id} style={{ ...btnClinica, opacity: movingTx === tx.id ? 0.5 : 1 }}>
                  {movingTx === tx.id ? "..." : "Transferir"}
                </button>
                <button onClick={() => setDeletingTx(tx.id)} style={{ ...btn, background: "rgba(255,80,80,0.10)", border: "1px solid rgba(255,80,80,0.25)", color: "#ff8080" }}>
                  Excluir
                </button>
              </div>
              {deletingTx === tx.id && (
                <div style={{ display: "flex", gap: 8, marginTop: 6, justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 12, opacity: 0.8, alignSelf: "center" }}>Confirmar exclusão?</span>
                  <button onClick={() => deleteTx(tx)} style={{ ...btn, background: "rgba(255,80,80,0.2)", border: "1px solid rgba(255,80,80,0.4)", color: "#ff8080" }}>Sim, excluir</button>
                  <button onClick={() => setDeletingTx(null)} style={btn}>Cancelar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
