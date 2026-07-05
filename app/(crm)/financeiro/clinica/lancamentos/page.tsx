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
  category_id: string | null;
  account_id: string | null;
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

export default function LancamentosClinicaPage() {
  const router = useRouter();
  const today = new Date();
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterKind, setFilterKind] = useState<"all" | "income" | "expense">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "paid" | "pending" | "received" | "late">("all");
  const [editTx, setEditTx] = useState<Tx | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deletingTx, setDeletingTx] = useState<string | null>(null);
  const [movingTx, setMovingTx] = useState<string | null>(null);

  // Mês/ano
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const { data } = await supabase
      .from("financial_transactions")
      .select("*")
      .eq("scope", "clinic")
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
      paid_at: ["paid","received"].includes(editForm.status) ? editForm.due_date || null : null,
      status: editForm.status,
      kind: editForm.kind,
    }).eq("id", editTx.id);
    setEditSaving(false);
    if (error) { alert("Erro: " + error.message); return; }
    setEditTx(null); setEditForm(null);
    await fetchAll();
  }

  async function deleteTx(tx: Tx) {
    setDeletingTx(null);
    const { error } = await supabase.from("financial_transactions").delete().eq("id", tx.id);
    if (error) { alert("Erro: " + error.message); return; }
    await fetchAll();
  }

  async function moveToPessoal(tx: Tx) {
    const ok = window.confirm(`Transferir "${tx.description}" para o Financeiro Pessoal?`);
    if (!ok) return;
    setMovingTx(tx.id);
    const { error } = await supabase.from("financial_transactions").update({ scope: "personal" }).eq("id", tx.id);
    setMovingTx(null);
    if (error) { alert("Erro: " + error.message); return; }
    await fetchAll();
  }

  function prevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  }

  function nextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  }

  const txOfMonth = useMemo(() => {
    return transactions.filter(tx => {
      const dateStr = tx.due_date || tx.paid_at || tx.competency_date;
      if (!dateStr) return false;
      const d = new Date(dateStr + "T12:00:00");
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });
  }, [transactions, currentYear, currentMonth]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return txOfMonth.filter(tx => {
      if (filterKind !== "all" && tx.kind !== filterKind) return false;
      if (filterStatus !== "all" && tx.status !== filterStatus) return false;
      if (!query) return true;
      return [tx.description, tx.counterparty_name ?? "", tx.notes ?? ""].join(" ").toLowerCase().includes(query);
    });
  }, [txOfMonth, q, filterKind, filterStatus]);

  const totals = useMemo(() => ({
    receitas: txOfMonth.filter(t => t.kind === "income").reduce((s, t) => s + Number(t.amount ?? 0), 0),
    despesas: txOfMonth.filter(t => t.kind === "expense").reduce((s, t) => s + Number(t.amount ?? 0), 0),
  }), [txOfMonth]);

  const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 14 };
  const btn: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 };
  const btnActive: React.CSSProperties = { ...btn, border: "1px solid rgba(180,120,255,0.4)", background: "rgba(180,120,255,0.2)" };
  const btnPessoal: React.CSSProperties = { ...btn, border: "1px solid rgba(255,200,80,0.3)", background: "rgba(255,200,80,0.10)", color: "#ffc850", padding: "8px 14px" };
  const inputStyle: React.CSSProperties = { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "white", padding: "8px 10px", width: "100%", fontSize: 14, boxSizing: "border-box" as const };
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
              <button onClick={() => { setEditTx(null); setEditForm(null); }} style={{ ...btn }}>Cancelar</button>
              <button onClick={saveEdit} disabled={editSaving} style={{ background: "rgba(180,120,255,0.2)", border: "1px solid rgba(180,120,255,0.4)", color: "white", padding: "8px 18px", borderRadius: 9, cursor: "pointer", fontWeight: 700, opacity: editSaving ? 0.6 : 1 }}>{editSaving ? "Salvando..." : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 950 }}>Lançamentos — Clínica</div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{MONTH_NAMES[currentMonth]} de {currentYear}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={prevMonth} style={btn}>Anterior</button>
          <button onClick={() => { setCurrentYear(today.getFullYear()); setCurrentMonth(today.getMonth()); }} style={btn}>Hoje</button>
          <button onClick={nextMonth} style={btn}>Próximo</button>
          <button onClick={() => router.back()} style={btn}>Voltar</button>
        </div>
      </div>

      {/* Totais */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Receitas</div>
          <div style={{ fontSize: 20, fontWeight: 950, color: "#78ffb4", marginTop: 4 }}>{formatBRL(totals.receitas)}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Despesas</div>
          <div style={{ fontSize: 20, fontWeight: 950, color: "#ff8080", marginTop: 4 }}>{formatBRL(totals.despesas)}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Resultado</div>
          <div style={{ fontSize: 20, fontWeight: 950, color: totals.receitas - totals.despesas >= 0 ? "#78ffb4" : "#ff8080", marginTop: 4 }}>{formatBRL(totals.receitas - totals.despesas)}</div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input style={{ background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "8px 12px", borderRadius: 10, outline: "none", minWidth: 220 }}
          placeholder="Buscar descrição..." value={q} onChange={e => setQ(e.target.value)} />
        {(["all","income","expense"] as const).map(v => (
          <button key={v} onClick={() => setFilterKind(v)} style={filterKind === v ? btnActive : btn}>
            {v === "all" ? "Todos tipos" : v === "income" ? "Receitas" : "Despesas"}
          </button>
        ))}
        {(["all","paid","received","pending","late"] as const).map(v => (
          <button key={v} onClick={() => setFilterStatus(v)} style={filterStatus === v ? btnActive : btn}>
            {v === "all" ? "Todos status" : v === "paid" ? "Pago" : v === "received" ? "Recebido" : v === "pending" ? "Pendente" : "Atrasado"}
          </button>
        ))}
        <button onClick={() => { setQ(""); setFilterKind("all"); setFilterStatus("all"); }} style={btn}>Limpar</button>
      </div>

      {loading && <div style={{ opacity: 0.7 }}>Carregando...</div>}

      {/* Lista */}
      <div style={{ display: "grid", gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Nenhum lançamento encontrado.</div>
        ) : filtered.map(tx => (
          <div key={tx.id} style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: "12px 14px", background: "rgba(255,255,255,0.03)", display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                <div style={{ fontWeight: 900 }}>{tx.description}</div>
                <div style={{ fontSize: 12, opacity: 0.7, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span>{tx.due_date ?? tx.paid_at ?? "—"}</span>
                  {tx.counterparty_name && <span>• {tx.counterparty_name}</span>}
                  <span style={{ padding: "1px 6px", borderRadius: 999, background: "rgba(255,255,255,0.06)", fontSize: 11 }}>
                    {tx.status === "paid" ? "Pago" : tx.status === "received" ? "Recebido" : tx.status === "pending" ? "Pendente" : tx.status === "late" ? "Atrasado" : tx.status}
                  </span>
                  <span style={{ padding: "1px 6px", borderRadius: 999, background: tx.kind === "income" ? "rgba(120,255,180,0.1)" : "rgba(255,120,120,0.1)", fontSize: 11, color: tx.kind === "income" ? "#78ffb4" : "#ff8080" }}>
                    {tx.kind === "income" ? "Receita" : "Despesa"}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900, fontSize: 15, color: tx.kind === "income" ? "#78ffb4" : "#ff8080", whiteSpace: "nowrap" }}>
                  {tx.kind === "expense" ? "-" : ""}{formatBRL(tx.amount)}
                </div>
                <button onClick={() => openEdit(tx)} style={btn}>Editar</button>
                <button onClick={() => moveToPessoal(tx)} disabled={movingTx === tx.id} style={{ ...btnPessoal, opacity: movingTx === tx.id ? 0.5 : 1 }}>
                  {movingTx === tx.id ? "..." : "Transferir"}
                </button>
                <button onClick={() => setDeletingTx(tx.id)} style={{ ...btn, background: "rgba(255,80,80,0.10)", border: "1px solid rgba(255,80,80,0.25)", color: "#ff8080" }}>
                  Excluir
                </button>
              </div>
            </div>
            {deletingTx === tx.id && (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                <span style={{ fontSize: 12, opacity: 0.8 }}>Confirmar exclusão?</span>
                <button onClick={() => deleteTx(tx)} style={{ ...btn, background: "rgba(255,80,80,0.2)", border: "1px solid rgba(255,80,80,0.4)", color: "#ff8080" }}>Sim, excluir</button>
                <button onClick={() => setDeletingTx(null)} style={btn}>Cancelar</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
