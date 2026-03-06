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

function addMonths(dt: Date, months: number) {
  const x = new Date(dt.getTime());
  x.setUTCMonth(x.getUTCMonth() + months);
  return x;
}

function normalizePhoneReadable(raw: string | null, e164: string | null) {
  return (raw && raw.trim()) || (e164 && e164.trim()) || "";
}

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

    const { data } = await supabase
      .from("recorrencias")
      .select(
        "id,lead_id,status,start_date,installments_total,installments_done,price_per_installment,leads(id,name,phone_raw,phone_e164)"
      )
      .order("start_date", { ascending: false });

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

      await supabase.from("sales").insert({
        lead_id: rec.lead_id,
        sale_type: "recorrencia",
        procedure: "Mensalidade recorrente",
        value: price,
        value_gross: price,
        value_net: price,
        fee_percent: 0,
        payment_method: "pix",
        installments_label: "à vista",
        closed_at: new Date().toISOString(),
      });

      const nextDone = Number(rec.installments_done ?? 0) + 1;

      let nextStatus = rec.status ?? "ativo";

      if (nextDone >= Number(rec.installments_total ?? 0)) {
        nextStatus = "encerrado";
      }

      await supabase
        .from("recorrencias")
        .update({
          installments_done: nextDone,
          status: nextStatus,
        })
        .eq("id", rec.id);

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
      const end = addMonths(start, Number(r.installments_total || 0) - 1);

      const nextPayment = addMonths(start, Number(r.installments_done || 0));

      const daysToNext = Math.ceil(
        (nextPayment.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      let paymentStatus = "em dia";
      if (daysToNext < 0) paymentStatus = "atrasado";
      else if (daysToNext <= 3) paymentStatus = "vence em breve";

      return {
        r,
        start,
        end,
        nextPayment,
        daysToNext,
        paymentStatus,
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

        <table style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Parcelas</th>
              <th>Mensal</th>
              <th>Próx pagamento</th>
              <th>Fim previsto</th>
              <th>Ação</th>
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
                  <td>
                    <div style={{ fontWeight: 900 }}>{leadName}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{phone}</div>
                  </td>

                  <td>
                    {x.r.installments_done} / {x.r.installments_total}
                  </td>

                  <td>{formatBRL(x.r.price_per_installment)}</td>

                  <td>
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
                  </td>

                  <td>{formatDateBR(x.end)}</td>

                  <td>
                    {x.r.status === "ativo" && (
                      <button
                        style={{
                          background: "rgba(180,120,255,0.15)",
                          border: "1px solid rgba(180,120,255,0.35)",
                          color: "white",
                          padding: "6px 8px",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                        onClick={() => registerPayment(x.r)}
                      >
                        Registrar pagamento
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}