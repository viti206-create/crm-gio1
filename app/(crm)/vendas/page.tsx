"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "../_hooks/useAdminAccess";

type LeadRow = {
  id: string;
  name: string;
  phone_raw: string | null;
};

type SaleRow = {
  id: string;
  lead_id: string;
  value: number | null;
  value_gross: number | null;
  value_net: number | null;
  payment_method: string | null;
  procedure: string | null;
  closed_at: string | null;
  leads?: LeadRow | null;
};

function formatDateBR(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
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

export default function VendasPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SaleRow[]>([]);

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [loadingRole, isAdmin, router]);

  async function fetchSales() {
    setLoading(true);

    const { data } = await supabase
      .from("sales")
      .select(
        "id,lead_id,value,value_gross,value_net,payment_method,procedure,closed_at,leads(id,name,phone_raw)"
      )
      .order("closed_at", { ascending: false });

    setRows((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) {
      fetchSales();
    }
  }, [isAdmin]);

  const total = useMemo(() => {
    return rows.reduce((sum, r) => {
      return sum + Number(r.value ?? 0);
    }, 0);
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
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 900,
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Vendas</span>
          <span>{formatBRL(total)}</span>
        </div>

        {loading ? (
          <div>Carregando...</div>
        ) : (
          <table style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Cliente</th>
                <th style={{ textAlign: "left" }}>Procedimento</th>
                <th style={{ textAlign: "left" }}>Pagamento</th>
                <th style={{ textAlign: "left" }}>Valor</th>
                <th style={{ textAlign: "left" }}>Data</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const leadName = r.leads?.name ?? "—";
                const phone = r.leads?.phone_raw ?? "";

                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 900 }}>{leadName}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{phone}</div>
                    </td>

                    <td>{r.procedure ?? "—"}</td>

                    <td>{r.payment_method ?? "—"}</td>

                    <td>{formatBRL(r.value)}</td>

                    <td>{formatDateBR(r.closed_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}