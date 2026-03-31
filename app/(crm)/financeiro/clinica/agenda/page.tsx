"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAdminAccess } from "../../../_hooks/useAdminAccess";

type Schedule = {
  id: string;
  description: string;
  scope: "clinic" | "personal";
  kind: "expense" | "income";
  next_due_date: string;
  default_amount: number | null;
  repeat_months?: number | null;
  is_active?: boolean | null;
  notes?: string | null;
  created_at?: string | null;
};

function formatDateBR(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(`${v}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
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

function monthKey(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  return String(dateStr).slice(0, 7);
}

function todayInputValue() {
  const dt = new Date();
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function currentMonthInputValue() {
  const dt = new Date();
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

const pageStyle: React.CSSProperties = {
  padding: 16,
  color: "white",
  display: "grid",
  gap: 16,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  boxSizing: "border-box",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  padding: "0 12px",
  borderRadius: 12,
  outline: "none",
  minWidth: 0,
  fontSize: 14,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.82,
  fontWeight: 900,
  marginBottom: 6,
  display: "block",
};

const btnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  height: 44,
  padding: "0 14px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 13,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  whiteSpace: "nowrap",
};

const btnPrimaryStyle: React.CSSProperties = {
  ...btnStyle,
  border: "1px solid rgba(180,120,255,0.30)",
  background:
    "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)",
};

const btnDangerStyle: React.CSSProperties = {
  ...btnStyle,
  border: "1px solid rgba(255,120,120,0.30)",
  background:
    "linear-gradient(180deg, rgba(255,120,120,0.16) 0%, rgba(255,120,120,0.07) 100%)",
};

const chipStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(180,120,255,0.30)",
  background: "rgba(180,120,255,0.10)",
  color: "rgba(255,255,255,0.92)",
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  fontWeight: 800,
};

function kindChip(kind: "expense" | "income"): React.CSSProperties {
  if (kind === "income") {
    return {
      fontSize: 12,
      padding: "3px 8px",
      borderRadius: 999,
      border: "1px solid rgba(120,255,160,0.22)",
      background: "rgba(70,185,120,0.12)",
      color: "white",
      display: "inline-flex",
      alignItems: "center",
      fontWeight: 900,
    };
  }

  return {
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,190,160,0.22)",
    background: "rgba(255,145,110,0.12)",
    color: "white",
    display: "inline-flex",
    alignItems: "center",
    fontWeight: 900,
  };
}

export default function AgendaFinanceiraClinicaPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [rows, setRows] = useState<Schedule[]>([]);
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [date, setDate] = useState(todayInputValue());
  const [defaultAmount, setDefaultAmount] = useState("");
  const [repeatMonths, setRepeatMonths] = useState("12");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState(currentMonthInputValue());

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/home");
    }
  }, [loadingRole, isAdmin, router]);

  async function fetchData() {
    setLoading(true);

    const { data, error } = await supabase
      .from("financial_schedules")
      .select("*")
      .eq("scope", "clinic")
      .order("next_due_date", { ascending: true });

    if (error) {
      console.error("Erro ao buscar agenda financeira:", error);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data as Schedule[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  function resetForm() {
    setEditingId(null);
    setDescription("");
    setKind("expense");
    setDate(todayInputValue());
    setDefaultAmount("");
    setRepeatMonths("12");
    setNotes("");
  }

  function handleEdit(row: Schedule) {
    setEditingId(row.id);
    setDescription(row.description ?? "");
    setKind(row.kind ?? "expense");
    setDate(row.next_due_date ?? todayInputValue());
    setDefaultAmount(
      row.default_amount != null ? String(row.default_amount) : ""
    );
    setRepeatMonths(
      row.repeat_months != null ? String(row.repeat_months) : "12"
    );
    setNotes(row.notes ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveSchedule() {
    if (!description.trim() || !date) return;

    setSaving(true);

    const parsedAmount = defaultAmount.trim() ? Number(defaultAmount) : null;
    const parsedRepeatMonths = Number(repeatMonths || 0);

    const payload = {
      scope: "clinic",
      kind,
      description: description.trim(),
      start_date: date,
      next_due_date: date,
      recurrence_type: "monthly",
      default_amount:
        parsedAmount !== null && Number.isFinite(parsedAmount)
          ? parsedAmount
          : null,
      repeat_months:
        parsedRepeatMonths > 0 && Number.isFinite(parsedRepeatMonths)
          ? parsedRepeatMonths
          : null,
      is_active: true,
      notes: notes.trim() || null,
    };

    let error = null;

    if (editingId) {
      const result = await supabase
        .from("financial_schedules")
        .update(payload)
        .eq("id", editingId);
      error = result.error;
    } else {
      const result = await supabase
        .from("financial_schedules")
        .insert(payload);
      error = result.error;
    }

    setSaving(false);

    if (error) {
      console.error("Erro ao salvar compromisso:", error);
      return;
    }

    resetForm();
    fetchData();
  }

  async function remove(id: string) {
    const ok = window.confirm("Deseja realmente excluir este compromisso?");
    if (!ok) return;

    const { error } = await supabase
      .from("financial_schedules")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erro ao excluir compromisso:", error);
      return;
    }

    if (editingId === id) resetForm();
    fetchData();
  }

  const monthRows = useMemo(() => {
    return rows.filter((r) => monthKey(r.next_due_date) === viewMonth);
  }, [rows, viewMonth]);

  const totalExpenseMonth = useMemo(() => {
    return monthRows
      .filter((r) => r.kind === "expense")
      .reduce((sum, r) => sum + Number(r.default_amount ?? 0), 0);
  }, [monthRows]);

  const totalIncomeMonth = useMemo(() => {
    return monthRows
      .filter((r) => r.kind === "income")
      .reduce((sum, r) => sum + Number(r.default_amount ?? 0), 0);
  }, [monthRows]);

  const totalBalanceMonth = totalIncomeMonth - totalExpenseMonth;

  if (loadingRole) {
    return <div style={{ padding: 20, color: "white" }}>Carregando permissões...</div>;
  }

  if (!isAdmin) return null;

  return (
    <div style={pageStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 0.2 }}>
            Agenda Financeira
          </div>
          <div style={chipStyle}>Scope: clinic • Visual בלבד</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/financeiro/clinica" style={btnStyle}>
            Voltar
          </Link>
          <Link href="/financeiro/clinica/lancamentos" style={btnPrimaryStyle}>
            Lançamentos
          </Link>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 14 }}>
          {editingId ? "Editar compromisso visual" : "Novo compromisso visual"}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(240px, 2fr) minmax(140px, 1fr) minmax(170px, 1fr) minmax(150px, 1fr) minmax(130px, 110px)",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <label style={labelStyle}>Descrição</label>
            <input
              style={inputStyle}
              placeholder="Ex.: Energia / Aluguel / Internet"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle}>Tipo</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "expense" | "income")}
              style={inputStyle}
            >
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Vencimento visual</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Valor previsto</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={defaultAmount}
              onChange={(e) => setDefaultAmount(e.target.value)}
              style={inputStyle}
              placeholder="Opcional"
            />
          </div>

          <div>
            <label style={labelStyle}>Meses</label>
            <input
              type="number"
              min="1"
              step="1"
              value={repeatMonths}
              onChange={(e) => setRepeatMonths(e.target.value)}
              style={inputStyle}
              placeholder="12"
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Observações</label>
          <input
            style={inputStyle}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional"
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button
            type="button"
            onClick={saveSchedule}
            style={btnPrimaryStyle}
            disabled={saving}
          >
            {saving
              ? editingId
                ? "Salvando..."
                : "Adicionando..."
              : editingId
              ? "Salvar alterações"
              : "Adicionar"}
          </button>

          {editingId ? (
            <button type="button" onClick={resetForm} style={btnStyle}>
              Cancelar edição
            </button>
          ) : null}
        </div>
      </div>

      <div style={cardStyle}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(180px, 240px) repeat(3, minmax(0, 1fr))",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <label style={labelStyle}>Mês da visão</label>
            <input
              type="month"
              value={viewMonth}
              onChange={(e) => setViewMonth(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Previsto a pagar</div>
            <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
              {formatBRL(totalExpenseMonth)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Previsto a receber</div>
            <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
              {formatBRL(totalIncomeMonth)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Saldo previsto</div>
            <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>
              {formatBRL(totalBalanceMonth)}
            </div>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
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
          <span>Compromissos visuais</span>
          <span style={{ opacity: 0.8, fontSize: 13 }}>
            {loading ? "Carregando..." : `${rows.length} item(ns)`}
          </span>
        </div>

        {loading ? (
          <div>Carregando...</div>
        ) : !rows.length ? (
          <div style={{ opacity: 0.75 }}>
            Nenhum compromisso cadastrado ainda.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Descrição</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Tipo</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Vencimento</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Valor previsto</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Meses</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Observações</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Ações</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                        fontWeight: 900,
                      }}
                    >
                      {r.description}
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <span style={kindChip(r.kind)}>
                        {r.kind === "expense" ? "Despesa" : "Receita"}
                      </span>
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {formatDateBR(r.next_due_date)}
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                        fontWeight: 800,
                      }}
                    >
                      {r.default_amount != null ? formatBRL(r.default_amount) : "—"}
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {r.repeat_months ?? "—"}
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                        opacity: 0.8,
                      }}
                    >
                      {r.notes ?? "—"}
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
                          onClick={() => handleEdit(r)}
                          style={btnStyle}
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => remove(r.id)}
                          style={btnDangerStyle}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}