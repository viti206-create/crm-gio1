"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAdminAccess } from "../_hooks/useAdminAccess";

export default function FinanceiroPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [exportFrom, setExportFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [exportTo, setExportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!loadingRole && !isAdmin) router.replace("/dashboard");
  }, [loadingRole, isAdmin, router]);

  async function handleExport(scope: "clinica" | "pessoal") {
    setExporting(true);
    const { data, error } = await supabase
      .from("financial_transactions")
      .select("*")
      .eq("scope", scope)
      .gte("due_date", exportFrom)
      .lte("due_date", exportTo)
      .order("due_date", { ascending: true });

    if (error || !data) {
      alert("Erro ao exportar: " + (error?.message ?? "sem dados"));
      setExporting(false);
      return;
    }

    const cols = ["id","scope","kind","status","description","amount","due_date","paid_at","competency_date","counterparty_name","notes","reference_code","created_at"];
    const header = cols.join(";");
    const csvRows = data.map((r: any) => cols.map(c => {
      const v = r[c] ?? "";
      return typeof v === "string" && v.includes(";") ? `"${v}"` : String(v);
    }).join(";"));
    const csv = [header, ...csvRows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financeiro_${scope}_${exportFrom}_${exportTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  if (loadingRole) return <div style={{ padding: 20, color: "white" }}>Carregando...</div>;
  if (!isAdmin) return null;

  const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", borderRadius: 18, padding: 16 };
  const btn: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "10px 16px", borderRadius: 12, cursor: "pointer", fontWeight: 900, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 };
  const btnPrimary: React.CSSProperties = { ...btn, border: "1px solid rgba(180,120,255,0.30)", background: "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)" };
  const btnGreen: React.CSSProperties = { ...btn, border: "1px solid rgba(120,255,180,0.30)", background: "linear-gradient(180deg, rgba(120,255,180,0.15) 0%, rgba(120,255,180,0.05) 100%)" };
  const inputStyle: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", borderRadius: 12, outline: "none" };
  const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.7, marginBottom: 4, display: "block" };
  const navCard: React.CSSProperties = { ...card, cursor: "pointer", transition: "border-color 0.15s" };

  return (
    <div style={{ color: "white", display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 950 }}>Financeiro</div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, border: "1px solid rgba(255,255,255,0.12)", padding: "2px 10px", borderRadius: 999, display: "inline-block" }}>Acesso somente admin</div>
        </div>
      </div>

      {/* Exportar + Importar */}
      <div style={card}>
        <div style={{ fontWeight: 950, fontSize: 15, marginBottom: 14 }}>Exportar / Importar</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={labelStyle}>Data inicial</label>
            <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Data final</label>
            <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)} style={inputStyle} />
          </div>
          <button onClick={() => handleExport("clinica")} disabled={exporting} style={{ ...btnPrimary, opacity: exporting ? 0.6 : 1 }}>
            📤 Exportar CSV Clínica
          </button>
          <button onClick={() => handleExport("pessoal")} disabled={exporting} style={{ ...btn, opacity: exporting ? 0.6 : 1 }}>
            📤 Exportar CSV Pessoal
          </button>
          <Link href="/financeiro/importar/extrato" style={btnGreen}>
            🏦 Importar Pessoal
          </Link>
          <Link href="/financeiro/importar/extrato?scope=clinic" style={btnGreen}>
            🏥 Importar Clínica
          </Link>
        </div>
      </div>

      {/* Cards de navegação */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Link href="/financeiro/clinica" style={{ textDecoration: "none", color: "white" }}>
          <div style={navCard}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(180,120,255,0.4)"}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.10)"}>
            <div style={{ fontWeight: 950, fontSize: 15, marginBottom: 8 }}>Financeiro Clínica</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>Dashboard, lançamentos, contas a pagar, contas a receber e visão financeira exclusiva da clínica.</div>
          </div>
        </Link>

        <Link href="/financeiro/pessoal" style={{ textDecoration: "none", color: "white" }}>
          <div style={navCard}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(180,120,255,0.4)"}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.10)"}>
            <div style={{ fontWeight: 950, fontSize: 15, marginBottom: 8 }}>Financeiro Pessoal</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>Dashboard, lançamentos, contas a pagar, contas a receber e visão financeira exclusiva do pessoal.</div>
          </div>
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <Link href="/financeiro/categorias" style={{ textDecoration: "none", color: "white" }}>
          <div style={navCard}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(180,120,255,0.4)"}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.10)"}>
            <div style={{ fontWeight: 950, fontSize: 15, marginBottom: 8 }}>Categorias</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>Categorias separadas por clínica e pessoal.</div>
          </div>
        </Link>

        <Link href="/financeiro/contas" style={{ textDecoration: "none", color: "white" }}>
          <div style={navCard}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(180,120,255,0.4)"}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.10)"}>
            <div style={{ fontWeight: 950, fontSize: 15, marginBottom: 8 }}>Contas / Carteiras</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>Contas bancárias, carteiras e caixas separados por ambiente.</div>
          </div>
        </Link>

        <Link href="/financeiro/relatorios" style={{ textDecoration: "none", color: "white" }}>
          <div style={navCard}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(180,120,255,0.4)"}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.10)"}>
            <div style={{ fontWeight: 950, fontSize: 15, marginBottom: 8 }}>Relatórios</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>Relatórios financeiros futuros separados por scope.</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
