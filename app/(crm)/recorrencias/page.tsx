"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "../_hooks/useAdminAccess";

type LeadRow = {
  id: string;
  name: string;
  phone_raw: string | null;
  phone_e164: string | null;
};

type RecRow = {
  id: string;
  lead_id: string;
  status: string | null;
  start_date: string;
  installments_total: number;
  installments_done: number;
  price_per_installment: number | null;
  leads?: LeadRow | null;
};

function formatDateBR(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatBRL(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseYMD(ymd: string) {
  const [y, m, d] = (ymd || "").split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
}

function addDays(dt: Date, days: number) {
  const x = new Date(dt.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function addMonths(dt: Date, months: number) {
  const x = new Date(dt.getTime());
  x.setUTCMonth(x.getUTCMonth() + months);
  return x;
}

function normalizePhoneReadable(raw: string | null, e164: string | null) {
  return (raw && raw.trim()) || (e164 && e164.trim()) || "";
}

function normalizeRecStatus(status: string | null | undefined) {
  const s = (status || "").trim().toLowerCase();

  if (["ativa", "ativo"].includes(s)) return "ativa";
  if (["concluida", "concluída", "encerrado", "encerrada"].includes(s)) {
    return "concluida";
  }
  if (s === "pausada") return "pausada";
  if (s === "cancelada") return "cancelada";

  return s || "ativa";
}

const thCenter: React.CSSProperties = {
  textAlign: "center",
  paddingBottom: 10,
};

const tdCenter: React.CSSProperties = {
  padding: "10px 0",
  borderTop: "1px solid rgba(255,255,255,0.06)",
  textAlign: "center",
  verticalAlign: "top",
};

export default function RecorrenciasPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RecRow[]>([]);

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [loadingRole, isAdmin, router]);

  async function fetchAll() {
    setLoading(true);

    const { data, error } = await supabase
      .from("recorrencias")
      .select(
        "id,lead_id,status,start_date,installments_total,installments_done,price_per_installment,leads(id,name,phone_raw,phone_e164)"
      )
      .order("start_date", { ascending: false });

    if (error) {
      console.error(error);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) {
      fetchAll();
    }
  }, [isAdmin]);

  async function registerPayment(rec: RecRow) {
    const ok = window.confirm("Registrar pagamento desta mensalidade?");
    if (!ok) return;

    try {
      const price = Number(rec.price_per_installment ?? 0);
      const nextDone = Number(rec.installments_done ?? 0) + 1;
      const total = Number(rec.installments_total ?? 0);

      let nextStatus = normalizeRecStatus(rec.status);

      if (nextDone >= total) {
        nextStatus = "concluida";
      }

      const { error: saleError } = await supabase.from("sales").insert({
        lead_id: rec.lead_id,
        recorrencia_id: rec.id,
        sale_type: "recorrencia",
        procedure: "Mensalidade recorrente",
        value: price,
        value_gross: price,
        value_net: price,
        fee_percent: 0,
        payment_method: "cartao_recorrente",
        installments_label: "À vista",
        closed_at: new Date().toISOString(),
      });

      if (saleError) {
        throw saleError;
      }

      const { error: recError } = await supabase
        .from("recorrencias")
        .update({
          installments_done: nextDone,
          status: nextStatus,
        })
        .eq("id", rec.id);

      if (recError) {
        throw recError;
      }

      await fetchAll();
    } catch (e) {
      console.error(e);
      alert("Erro ao registrar pagamento.");
    }
  }

  const computed = useMemo(() => {
    const now = new Date();

    return rows.map((r) => {
      const start = parseYMD(r.start_date);
      const total = Number(r.installments_total || 0);
      const done = Number(r.installments_done || 0);

      const nextPayment = addMonths(start, done);
      const finalPayment = addMonths(start, Math.max(total - 1, 0));

      const cancelFrom = addDays(finalPayment, 1);
      const cancelUntil = addDays(addMonths(finalPayment, 1), -2);

      const daysToNext = Math.ceil(
        (nextPayment.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      let paymentStatus = "em dia";
      if (daysToNext < 0) paymentStatus = "atrasado";
      else if (daysToNext <= 3) paymentStatus = "vence em breve";

      return {
        r,
        nextPayment,
        finalPayment,
        cancelFrom,
        cancelUntil,
        daysToNext,
        paymentStatus,
        normalizedStatus: normalizeRecStatus(r.status),
        isCompleted: done >= total && total > 0,
      };
    });
  }, [rows]);

  if (loadingRole) {
    return (
      <div style={{ padding: 20, color: "white" }}>
        Carregando permissões...
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div style={{ padding: 16, color: "white" }}>
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)",
          borderRadius: 18,
          padding: 14,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>
          Recorrências
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", paddingBottom: 10 }}>Cliente</th>
              <th style={thCenter}>Parcelas</th>
              <th style={thCenter}>Mensal</th>
              <th style={thCenter}>Próx pagamento</th>
              <th style={thCenter}>Último pagamento</th>
              <th style={thCenter}>Cancelar recorrência</th>
              <th style={thCenter}>Ação</th>
            </tr>
          </thead>

          <tbody>
            {computed.map((x) => {
              const leadName = x.r.leads?.name ?? "—";
              const phone = normalizePhoneReadable(
                x.r.leads?.phone_raw ?? null,
                x.r.leads?.phone_e164 ?? null
              );

              return (
                <tr key={x.r.id}>
                  <td
                    style={{
                      padding: "10px 0",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      textAlign: "left",
                      verticalAlign: "top",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{leadName}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{phone}</div>
                  </td>

                  <td style={tdCenter}>
                    {x.r.installments_done} / {x.r.installments_total}
                  </td>

                  <td style={tdCenter}>{formatBRL(x.r.price_per_installment)}</td>

                  <td style={tdCenter}>
                    {x.isCompleted ? (
                      <div style={{ opacity: 0.7 }}>Concluído</div>
                    ) : (
                      <>
                        <div style={{ fontWeight: 900 }}>
                          {formatDateBR(x.nextPayment)}
                        </div>

                        {x.paymentStatus === "atrasado" && (
                          <div style={{ color: "#ff7aa0", fontSize: 12 }}>
                            ⚠️ Atrasado {Math.abs(x.daysToNext)} dia(s)
                          </div>
                        )}

                        {x.paymentStatus === "vence em breve" && (
                          <div style={{ color: "#ffc878", fontSize: 12 }}>
                            ⏳ Vence em {x.daysToNext} dia(s)
                          </div>
                        )}
                      </>
                    )}
                  </td>

                  <td style={tdCenter}>
                    <div style={{ fontWeight: 900 }}>
                      {formatDateBR(x.finalPayment)}
                    </div>
                  </td>

                  <td style={tdCenter}>
                    <div style={{ fontWeight: 900 }}>
                      {formatDateBR(x.cancelFrom)}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.72 }}>
                      até {formatDateBR(x.cancelUntil)}
                    </div>
                  </td>

                  <td style={tdCenter}>
                    {x.normalizedStatus === "ativa" && !x.isCompleted && (
                      <button
                        style={{
                          background: "rgba(180,120,255,0.15)",
                          border: "1px solid rgba(180,120,255,0.35)",
                          color: "white",
                          padding: "4px 7px",
                          borderRadius: 7,
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 700,
                          lineHeight: 1.1,
                        }}
                        onClick={() => registerPayment(x.r)}
                      >
                        Registrar pagamento
                      </button>
                    )}

                    {(x.normalizedStatus !== "ativa" || x.isCompleted) && (
                      <span style={{ fontSize: 12, opacity: 0.7 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {!computed.length && (
              <tr>
                <td colSpan={7} style={{ paddingTop: 12, opacity: 0.7 }}>
                  Nenhuma recorrência encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}