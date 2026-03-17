"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Schedule = {
  id: string;
  description: string;
  scope: string;
  kind: "expense" | "income";
  next_due_date: string;
  default_amount: number | null;
  last_generated_date?: string | null;
  repeat_months?: number | null;
  generated_count?: number | null;
  is_active?: boolean | null;
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

export default function AgendaFinanceira() {
  const [rows, setRows] = useState<Schedule[]>([]);
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [date, setDate] = useState("");
  const [defaultAmount, setDefaultAmount] = useState("");
  const [repeatMonths, setRepeatMonths] = useState("12");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    fetchData();
  }, []);

  async function createSchedule() {
    if (!description.trim() || !date) return;

    setSaving(true);

    const parsedAmount = defaultAmount.trim() ? Number(defaultAmount) : null;
    const parsedRepeatMonths = Number(repeatMonths || 0);

    const { error } = await supabase.from("financial_schedules").insert({
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
    });

    setSaving(false);

    if (error) {
      console.error("Erro ao criar compromisso:", error);
      return;
    }

    setDescription("");
    setDate("");
    setDefaultAmount("");
    setRepeatMonths("12");
    setKind("expense");

    fetchData();
  }

  async function generateTransaction(schedule: Schedule) {
    const amount = schedule.default_amount ?? 0;

    const { error: insertError } = await supabase
      .from("financial_transactions")
      .insert({
        scope: schedule.scope,
        kind: schedule.kind,
        description: schedule.description,
        amount,
        due_date: schedule.next_due_date,
        status: "pending",
        source_type: "schedule",
        source_id: schedule.id,
      });

    if (insertError) {
      console.error("Erro ao gerar lançamento:", insertError);
      return;
    }

    const currentDueDate = new Date(`${schedule.next_due_date}T12:00:00`);
    const nextDueDate = new Date(currentDueDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);

    const nextDueDateStr = nextDueDate.toISOString().slice(0, 10);

    const currentRepeatMonths = Number(schedule.repeat_months ?? 0);
    const currentGeneratedCount = Number((schedule as any).generated_count ?? 0);

    const updatePayload: Record<string, any> = {
      last_generated_date: new Date().toISOString().slice(0, 10),
      generated_count: currentGeneratedCount + 1,
    };

    if (currentRepeatMonths > 1) {
      updatePayload.repeat_months = currentRepeatMonths - 1;
      updatePayload.next_due_date = nextDueDateStr;
    } else if (currentRepeatMonths === 1) {
      updatePayload.repeat_months = 0;
      updatePayload.is_active = false;
    } else {
      updatePayload.next_due_date = nextDueDateStr;
    }

    const { error: updateError } = await supabase
      .from("financial_schedules")
      .update(updatePayload)
      .eq("id", schedule.id);

    if (updateError) {
      console.error("Erro ao atualizar agenda após gerar lançamento:", updateError);
      return;
    }

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

    fetchData();
  }

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
          <div style={chipStyle}>Scope: clinic</div>
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
        <div
          style={{
            fontSize: 18,
            fontWeight: 900,
            marginBottom: 14,
          }}
        >
          Novo compromisso mensal
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(240px, 2fr) minmax(140px, 1fr) minmax(170px, 1fr) minmax(150px, 1fr) minmax(130px, 110px) auto",
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
            <label style={labelStyle}>Próximo vencimento</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Valor padrão</label>
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
            <label style={labelStyle}>Repetir por</label>
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

          <button
            type="button"
            onClick={createSchedule}
            style={btnPrimaryStyle}
            disabled={saving}
          >
            {saving ? "Adicionando..." : "Adicionar"}
          </button>
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
          <span>Compromissos mensais</span>
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
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Valor padrão</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Meses</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Última geração</th>
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
                      }}
                    >
                      {r.last_generated_date
                        ? formatDateBR(r.last_generated_date)
                        : "—"}
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
                          onClick={() => generateTransaction(r)}
                          style={btnPrimaryStyle}
                        >
                          Gerar lançamento
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