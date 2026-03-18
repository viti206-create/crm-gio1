"use client";

import React, { useMemo, useState } from "react";

export type FinancialCalendarRow = {
  id: string;
  kind: "income" | "expense";
  status: "pending" | "paid" | "received" | "late";
  description: string;
  amount: number;
  due_date: string | null;
  paid_at?: string | null;
  counterparty_name?: string | null;
  notes?: string | null;
};

function formatBRL(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateBR(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(`${v}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function startOfMonthGrid(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const weekday = first.getDay();
  const start = new Date(first);
  start.setDate(first.getDate() - weekday);
  return start;
}

function statusLabel(status: FinancialCalendarRow["status"]) {
  if (status === "pending") return "Pendente";
  if (status === "paid") return "Pago";
  if (status === "received") return "Recebido";
  if (status === "late") return "Atrasado";
  return status;
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function eventStyle(row: FinancialCalendarRow): React.CSSProperties {
  let bg = "rgba(255,140,90,0.82)";
  let border = "1px solid rgba(255,170,120,0.22)";

  if (row.kind === "income") {
    bg = "rgba(70,185,120,0.82)";
    border = "1px solid rgba(120,255,160,0.22)";
  }

  if (row.status === "paid" || row.status === "received") {
    bg = "rgba(70,150,255,0.82)";
    border = "1px solid rgba(120,190,255,0.28)";
  }

  if (row.status === "late") {
    bg = "rgba(255,95,95,0.92)";
    border = "1px solid rgba(255,140,140,0.28)";
  }

  return {
    background: bg,
    border,
    borderRadius: 8,
    color: "white",
    fontWeight: 800,
    padding: "6px 8px",
    boxShadow: "0 6px 14px rgba(0,0,0,0.18)",
    display: "grid",
    gap: 2,
  };
}

const btn: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  padding: "8px 10px",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 12,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  lineHeight: 1,
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  border: "1px solid rgba(180,120,255,0.30)",
  background:
    "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)",
};

export default function FinancialCalendar({
  transactions,
  onOpen,
  onQuickFinish,
  finishLabel,
  currentMonth,
  onMonthChange,
}: {
  transactions: FinancialCalendarRow[];
  onOpen?: (row: FinancialCalendarRow) => void;
  onQuickFinish?: (row: FinancialCalendarRow) => void;
  finishLabel?: string;
  currentMonth?: Date;
  onMonthChange?: (date: Date) => void;
}) {
  const [internalMonth, setInternalMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const resolvedMonth = currentMonth ?? internalMonth;

  function changeMonth(date: Date) {
    if (onMonthChange) {
      onMonthChange(date);
      return;
    }
    setInternalMonth(date);
  }

  const [mode, setMode] = useState<"month" | "agenda">("month");

  const parsedTransactions = useMemo(() => {
    return transactions
      .map((t) => ({
        ...t,
        _date: parseDate(t.due_date),
      }))
      .filter((t) => !!t._date) as Array<FinancialCalendarRow & { _date: Date }>;
  }, [transactions]);

  const days = useMemo(() => {
    const start = startOfMonthGrid(resolvedMonth);
    return Array.from({ length: 42 }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      return day;
    });
  }, [resolvedMonth]);

  const byDay = useMemo(() => {
    const map = new Map<string, Array<FinancialCalendarRow & { _date: Date }>>();

    for (const row of parsedTransactions) {
      const key = dateKey(row._date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }

    for (const arr of map.values()) {
      arr.sort((a, b) => Number(b.amount) - Number(a.amount));
    }

    return map;
  }, [parsedTransactions]);

  const agendaRows = useMemo(() => {
    return [...parsedTransactions]
      .filter((row) => isSameMonth(row._date, resolvedMonth))
      .sort((a, b) => a._date.getTime() - b._date.getTime());
  }, [parsedTransactions, resolvedMonth]);

  const today = new Date();

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 16,
        padding: 10,
        boxShadow: "0 14px 40px rgba(0,0,0,0.30)",
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900, textTransform: "capitalize" }}>
          {monthLabel(resolvedMonth)}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            style={btn}
            onClick={() => changeMonth(addMonths(resolvedMonth, -1))}
          >
            Anterior
          </button>

          <button
            type="button"
            style={btn}
            onClick={() => {
              const now = new Date();
              changeMonth(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
          >
            Hoje
          </button>

          <button
            type="button"
            style={btn}
            onClick={() => changeMonth(addMonths(resolvedMonth, 1))}
          >
            Próximo
          </button>

          <button
            type="button"
            style={mode === "month" ? btnPrimary : btn}
            onClick={() => setMode("month")}
          >
            Mês
          </button>

          <button
            type="button"
            style={mode === "agenda" ? btnPrimary : btn}
            onClick={() => setMode("agenda")}
          >
            Agenda
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          fontSize: 11,
          opacity: 0.9,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 9px",
            borderRadius: 999,
            background: "rgba(70,185,120,0.18)",
            border: "1px solid rgba(140,255,190,0.18)",
            fontWeight: 800,
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: "rgba(70,185,120,0.92)",
              display: "inline-block",
            }}
          />
          Receber
        </span>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 9px",
            borderRadius: 999,
            background: "rgba(255,145,110,0.16)",
            border: "1px solid rgba(255,190,160,0.18)",
            fontWeight: 800,
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: "rgba(255,145,110,0.92)",
              display: "inline-block",
            }}
          />
          Pagar
        </span>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 9px",
            borderRadius: 999,
            background: "rgba(70,150,255,0.16)",
            border: "1px solid rgba(120,190,255,0.22)",
            fontWeight: 800,
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: "rgba(70,150,255,0.92)",
              display: "inline-block",
            }}
          />
          Pago
        </span>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 9px",
            borderRadius: 999,
            background: "rgba(220,82,82,0.14)",
            border: "1px solid rgba(255,170,170,0.16)",
            fontWeight: 800,
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: "rgba(220,82,82,0.94)",
              display: "inline-block",
            }}
          />
          Atrasado
        </span>
      </div>

      {mode === "month" ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: 6,
            }}
          >
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label) => (
              <div
                key={label}
                style={{
                  padding: "7px 6px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 900,
                  textAlign: "center",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {label}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: 6,
            }}
          >
            {days.map((day) => {
              const key = dateKey(day);
              const items = byDay.get(key) ?? [];
              const current = isSameMonth(day, resolvedMonth);
              const isToday = sameDay(day, today);

              return (
                <div
                  key={key}
                  style={{
                    minHeight: 112,
                    borderRadius: 12,
                    padding: 6,
                    border: isToday
                      ? "1px solid rgba(180,120,255,0.35)"
                      : "1px solid rgba(255,255,255,0.08)",
                    background: current
                      ? isToday
                        ? "rgba(180,120,255,0.08)"
                        : "rgba(255,255,255,0.03)"
                      : "rgba(255,255,255,0.015)",
                    display: "grid",
                    alignContent: "start",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      textAlign: "right",
                      fontWeight: 900,
                      fontSize: 11,
                      opacity: current ? 1 : 0.38,
                    }}
                  >
                    {day.getDate()}
                  </div>

                  {items.slice(0, 2).map((row) => {
                    const canFinish = row.status === "pending" || row.status === "late";

                    return (
                      <div
                        key={row.id}
                        style={{
                          ...eventStyle(row),
                          cursor: onOpen ? "pointer" : "default",
                        }}
                        onClick={() => onOpen?.(row)}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            lineHeight: 1.15,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={`${row.description} • ${formatBRL(row.amount)}`}
                        >
                          {row.status === "paid" || row.status === "received"
                            ? "🔵"
                            : row.kind === "income"
                            ? "💚"
                            : "💸"}{" "}
                          {row.description}
                        </div>

                        <div style={{ fontSize: 9 }}>{formatBRL(row.amount)}</div>

                        {(onOpen || (onQuickFinish && canFinish)) ? (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {onOpen ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpen(row);
                                }}
                                style={{
                                  border: "1px solid rgba(255,255,255,0.14)",
                                  background: "rgba(0,0,0,0.18)",
                                  color: "white",
                                  borderRadius: 6,
                                  padding: "2px 5px",
                                  fontSize: 9,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                Abrir
                              </button>
                            ) : null}

                            {onQuickFinish && canFinish ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onQuickFinish(row);
                                }}
                                style={{
                                  border: "1px solid rgba(255,255,255,0.14)",
                                  background: "rgba(255,255,255,0.14)",
                                  color: "white",
                                  borderRadius: 6,
                                  padding: "2px 5px",
                                  fontSize: 9,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                {finishLabel || "Finalizar"}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  {items.length > 2 ? (
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        opacity: 0.78,
                        paddingLeft: 2,
                      }}
                    >
                      +{items.length - 2}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 8,
          }}
        >
          {agendaRows.length === 0 ? (
            <div style={{ opacity: 0.72 }}>Nenhum lançamento encontrado.</div>
          ) : (
            agendaRows.map((row) => {
              const canFinish = row.status === "pending" || row.status === "late";
              const isPaid = row.status === "paid" || row.status === "received";

              return (
                <div
                  key={row.id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 12,
                    padding: 10,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                    cursor: onOpen ? "pointer" : "default",
                  }}
                  onClick={() => onOpen?.(row)}
                >
                  <div style={{ display: "grid", gap: 5, minWidth: 240 }}>
                    <div style={{ fontWeight: 900, fontSize: 13 }}>
                      {formatDateBR(row.due_date)} • {row.description}
                    </div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {isPaid ? (
                        <span
                          style={{
                            fontSize: 11,
                            padding: "3px 7px",
                            borderRadius: 999,
                            border: "1px solid rgba(120,190,255,0.22)",
                            background: "rgba(70,150,255,0.14)",
                            color: "#9fd3ff",
                            fontWeight: 900,
                          }}
                        >
                          {statusLabel(row.status)}
                        </span>
                      ) : row.status === "late" ? (
                        <span
                          style={{
                            fontSize: 11,
                            padding: "3px 7px",
                            borderRadius: 999,
                            border: "1px solid rgba(255,170,170,0.16)",
                            background: "rgba(220,82,82,0.14)",
                            color: "#ff9f9f",
                            fontWeight: 900,
                          }}
                        >
                          {statusLabel(row.status)}
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            padding: "3px 7px",
                            borderRadius: 999,
                            border:
                              row.kind === "income"
                                ? "1px solid rgba(140,255,190,0.18)"
                                : "1px solid rgba(255,190,160,0.18)",
                            background:
                              row.kind === "income"
                                ? "rgba(70,185,120,0.12)"
                                : "rgba(255,145,110,0.10)",
                            fontWeight: 900,
                          }}
                        >
                          {row.kind === "income" ? "Receber" : "Pagar"}
                        </span>
                      )}

                      {row.counterparty_name ? (
                        <span
                          style={{
                            fontSize: 11,
                            opacity: 0.8,
                          }}
                        >
                          {row.counterparty_name}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ fontWeight: 900, minWidth: 110, textAlign: "right", fontSize: 13 }}>
                      {formatBRL(row.amount)}
                    </div>

                    {onOpen ? (
                      <button
                        type="button"
                        style={btn}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(row);
                        }}
                      >
                        Abrir
                      </button>
                    ) : null}

                    {onQuickFinish && canFinish ? (
                      <button
                        type="button"
                        style={btnPrimary}
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuickFinish(row);
                        }}
                      >
                        {finishLabel || "Finalizar"}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}