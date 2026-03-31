"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "../_hooks/useAdminAccess";
import { supabase } from "@/lib/supabaseClient";

type SaleExportRow = {
  procedure: string | null;
  closed_at: string | null;
  value_net: number | null;
};

type FinancialAccountRow = {
  id: string;
  name: string;
};

type FinancialTransactionExportRow = {
  description: string;
  due_date: string | null;
  amount: number | null;
  account_id: string | null;
  kind: "income" | "expense";
  scope: "clinic" | "personal";
};

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
  padding: 18,
  color: "white",
  textDecoration: "none",
  display: "grid",
  gap: 8,
  minHeight: 140,
  boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
};

const smallCardStyle: React.CSSProperties = {
  ...cardStyle,
  minHeight: 110,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  letterSpacing: 0.2,
};

const chipStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 9px",
  borderRadius: 999,
  border: "1px solid rgba(180,120,255,0.30)",
  background: "rgba(180,120,255,0.10)",
  color: "rgba(255,255,255,0.92)",
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  fontWeight: 800,
};

const mutedText: React.CSSProperties = {
  opacity: 0.8,
  lineHeight: 1.5,
  fontSize: 14,
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
  padding: "10px 12px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 900,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const btnPrimaryStyle: React.CSSProperties = {
  ...btnStyle,
  border: "1px solid rgba(180,120,255,0.30)",
  background:
    "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)",
};

function todayInputValue() {
  const dt = new Date();
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function firstDayOfMonthInputValue() {
  const dt = new Date();
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatDateCSV(value: string | null | undefined) {
  if (!value) return "";
  const raw = String(value).slice(0, 10);
  const parts = raw.split("-");
  if (parts.length !== 3) return raw;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatMoneyCSV(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}

export default function FinanceiroIndexPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [exporting, setExporting] = useState(false);
  const [dateFrom, setDateFrom] = useState(firstDayOfMonthInputValue());
  const [dateTo, setDateTo] = useState(todayInputValue());

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/home");
    }
  }, [loadingRole, isAdmin, router]);

  async function handleExportClinicCsv() {
    if (exporting) return;

    if (!dateFrom || !dateTo) {
      window.alert("Preencha a data inicial e a data final.");
      return;
    }

    if (dateFrom > dateTo) {
      window.alert("A data inicial não pode ser maior que a data final.");
      return;
    }

    setExporting(true);

    try {
      const [
        { data: salesData, error: salesError },
        { data: txData, error: txError },
        { data: accountData, error: accountError },
      ] = await Promise.all([
        supabase
          .from("sales")
          .select("procedure,closed_at,value_net")
          .gte("closed_at", `${dateFrom}T00:00:00`)
          .lte("closed_at", `${dateTo}T23:59:59`)
          .order("closed_at", { ascending: true }),

        supabase
          .from("financial_transactions")
          .select("description,due_date,amount,account_id,kind,scope")
          .eq("scope", "clinic")
          .eq("kind", "expense")
          .gte("due_date", dateFrom)
          .lte("due_date", dateTo)
          .order("due_date", { ascending: true }),

        supabase
          .from("financial_accounts")
          .select("id,name")
          .eq("scope", "clinic"),
      ]);

      if (salesError) throw salesError;
      if (txError) throw txError;
      if (accountError) throw accountError;

      const salesRows = (salesData ?? []) as SaleExportRow[];
      const txRows = (txData ?? []) as FinancialTransactionExportRow[];
      const accountRows = (accountData ?? []) as FinancialAccountRow[];

      const accountMap = new Map<string, string>();
      for (const acc of accountRows) {
        accountMap.set(acc.id, acc.name);
      }

      const exportRows = [
        ...salesRows.map((row) => ({
          sortDate: row.closed_at ? String(row.closed_at).slice(0, 10) : "",
          tipo: "Venda",
          origem: "CRM",
          descricao: row.procedure ?? "",
          data: formatDateCSV(row.closed_at),
          valor: formatMoneyCSV(row.value_net),
          conta: "",
          status: "Recebido",
        })),
        ...txRows.map((row) => ({
          sortDate: row.due_date ?? "",
          tipo: "Despesa",
          origem: "Financeiro",
          descricao: row.description ?? "",
          data: formatDateCSV(row.due_date),
          valor: formatMoneyCSV(row.amount),
          conta: row.account_id ? accountMap.get(row.account_id) ?? "" : "",
          status: "Pago", // pode evoluir depois
        })),
      ].sort((a, b) => a.sortDate.localeCompare(b.sortDate));

      const header = ["Tipo", "Origem", "Descrição", "Data", "Valor", "Conta", "Status"];

      const csvLines = [
        header.join(","),
        ...exportRows.map((row) =>
          [
            csvEscape(row.tipo),
            csvEscape(row.origem),
            csvEscape(row.descricao),
            csvEscape(row.data),
            csvEscape(row.valor),
            csvEscape(row.conta),
            csvEscape(row.status),
          ].join(",")
        ),
      ];

      const csvContent = "\uFEFF" + csvLines.join("\n");
      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = `financeiro-clinica-${dateFrom}-ate-${dateTo}.csv`;

      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao exportar CSV da clínica:", error);
      window.alert("Não foi possível exportar o CSV da clínica.");
    } finally {
      setExporting(false);
    }
  }

  if (loadingRole) {
    return (
      <div style={{ padding: 20, color: "white" }}>
        Carregando permissões...
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div style={pageStyle}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={sectionTitle}>Financeiro</div>
        <div style={chipStyle}>Acesso somente admin</div>
      </div>

      <div
        style={{
          ...cardStyle,
          minHeight: "unset",
          gap: 14,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900 }}>
          Exportar
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(180px, 220px) minmax(180px, 220px) auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <label style={labelStyle}>Data inicial</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Data final</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={inputStyle}
            />
          </div>

          <button
            type="button"
            onClick={handleExportClinicCsv}
            style={btnPrimaryStyle}
            disabled={exporting}
          >
            {exporting ? "Exportando..." : "Exportar CSV Clínica"}
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 16,
        }}
      >
        <Link href="/financeiro/clinica" style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            Financeiro Clínica
          </div>
          <div style={mutedText}>
            Dashboard, lançamentos, contas a pagar, contas a receber e visão
            financeira exclusiva da clínica.
          </div>
        </Link>

        <Link href="/financeiro/pessoal" style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            Financeiro Pessoal
          </div>
          <div style={mutedText}>
            Dashboard, lançamentos, contas a pagar, contas a receber e visão
            financeira exclusiva do pessoal.
          </div>
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 16,
        }}
      >
        <Link href="/financeiro/categorias" style={smallCardStyle}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>Categorias</div>
          <div style={mutedText}>
            Categorias separadas por clínica e pessoal.
          </div>
        </Link>

        <Link href="/financeiro/contas" style={smallCardStyle}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            Contas / Carteiras
          </div>
          <div style={mutedText}>
            Contas bancárias, carteiras e caixas separados por ambiente.
          </div>
        </Link>

        <Link href="/financeiro/relatorios" style={smallCardStyle}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>Relatórios</div>
          <div style={mutedText}>
            Relatórios financeiros futuros separados por scope.
          </div>
        </Link>
      </div>
    </div>
  );
}