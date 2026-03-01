"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type LeadMini = {
  id: string;
  name: string | null;
  phone_raw: string | null;
  phone_e164: string | null;
};

type RecRow = {
  id: string;
  lead_id: string;
  status: string | null;
  start_date: string; // date (YYYY-MM-DD)
  installments_total: number;
  installments_done: number;
  leads?: { name: string | null; phone_raw: string | null; phone_e164: string | null } | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateBR(d: Date) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// parse "YYYY-MM-DD" como data local (evita bug de timezone)
function parseDateLocal(ymd: string) {
  const [y, m, d] = (ymd || "").split("-").map((x) => Number(x));
  return new Date(y || 1970, (m || 1) - 1, d || 1, 12, 0, 0); // meio-dia local (mais seguro)
}

function addMonthsSafe(base: Date, monthsToAdd: number) {
  const d = new Date(base);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + monthsToAdd);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function normalizePhoneReadable(raw: string | null, e164: string | null) {
  const base = (raw && raw.trim().length > 0 ? raw : e164) || "";
  return base.trim();
}

function chipStyle(kind: "primary" | "muted" | "warn" | "danger" = "muted"): React.CSSProperties {
  const map = {
    primary: {
      border: "1px solid rgba(180,120,255,0.35)",
      background: "rgba(180,120,255,0.12)",
      color: "rgba(255,255,255,0.92)",
    },
    muted: {
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.05)",
      color: "rgba(255,255,255,0.88)",
    },
    warn: {
      border: "1px solid rgba(255,200,120,0.35)",
      background: "rgba(255,200,120,0.10)",
      color: "rgba(255,255,255,0.92)",
    },
    danger: {
      border: "1px solid rgba(255,120,160,0.35)",
      background: "rgba(255,120,160,0.10)",
      color: "rgba(255,255,255,0.92)",
    },
  }[kind];

  return {
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    lineHeight: "16px",
    whiteSpace: "nowrap",
    ...map,
  };
}

export default function RecorrenciasPage() {
  const router = useRouter();

  const [rows, setRows] = useState<RecRow[]>([]);
  const [leads, setLeads] = useState<LeadMini[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // filtros
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // form (nova recorrência)
  const [formLeadId, setFormLeadId] = useState<string>("");
  const [formStatus, setFormStatus] = useState<string>("ativo");
  const [formStartDate, setFormStartDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  });
  const [formTotal, setFormTotal] = useState<number>(10);
  const [formDone, setFormDone] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  async function fetchRows() {
    setLoading(true);
    setErrMsg(null);

    // precisa existir FK recorrencias.lead_id -> leads.id (pra relação "leads" funcionar)
    const { data, error } = await supabase
      .from("recorrencias")
      .select(
        "id, lead_id, status, start_date, installments_total, installments_done, leads(name, phone_raw, phone_e164)"
      )
      .order("start_date", { ascending: false });

    setLoading(false);

    if (error) {
      console.error("fetch recorrencias error:", error);
      setErrMsg(error.message ?? "Erro ao carregar recorrências");
      setRows([]);
      return;
    }

    setRows((data as any) ?? []);
  }

  async function fetchLeads() {
    const { data, error } = await supabase
      .from("leads")
      .select("id,name,phone_raw,phone_e164")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetch leads error:", error);
      // não trava a tela se falhar
      return;
    }

    const list = ((data as any) ?? []) as LeadMini[];
    setLeads(list);

    // se não tem lead selecionado ainda, escolhe o primeiro
    if (!formLeadId && list.length > 0) setFormLeadId(list[0].id);
  }

  useEffect(() => {
    fetchRows();
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    if (saving) return;

    const leadId = (formLeadId || "").trim();
    const status = (formStatus || "").trim().toLowerCase();
    const start = (formStartDate || "").trim();
    const total = Number(formTotal || 0);
    const done = Number(formDone || 0);

    if (!leadId) {
      alert("Selecione um cliente (lead).");
      return;
    }
    if (!start) {
      alert("Preencha a data de início.");
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      alert("Parcelas totais precisa ser maior que 0.");
      return;
    }
    if (!Number.isFinite(done) || done < 0) {
      alert("Parcelas pagas não pode ser negativo.");
      return;
    }
    if (done > total) {
      alert("Parcelas pagas não pode ser maior que o total.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("recorrencias").insert({
      lead_id: leadId,
      status,
      start_date: start,
      installments_total: total,
      installments_done: done,
    });

    setSaving(false);

    if (error) {
      console.error("insert recorrencia error:", error);
      alert(`Não consegui salvar.\n\n${error.message}`);
      return;
    }

    // recarrega lista
    await fetchRows();

    // mantém o lead selecionado (pra criar outras), mas reseta alguns campos
    setFormStatus("ativo");
    setFormTotal(10);
    setFormDone(1);
  }

  // cálculo de datas + janela de cancelamento
  const computed = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    return rows.map((r) => {
      const start = parseDateLocal(r.start_date);

      // Fim previsto = data do último pagamento
      // total 10 => start + 9 meses
      const total = Number(r.installments_total || 0);
      const monthsToAdd = Math.max(0, total - 1);
      const end = addMonthsSafe(start, monthsToAdd);

      // janela: 1 dia após o fim até 27 dias depois
      const cancelFrom = addDays(end, 1);
      const cancelTo = addDays(end, 27);

      const inWindow = today >= cancelFrom && today <= cancelTo;

      const daysToClose = Math.ceil((cancelTo.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const lastDays = inWindow && daysToClose <= 3;

      let windowLabel: "Fora da janela" | "Pode cancelar" | "Últimos dias" = "Fora da janela";
      if (inWindow) windowLabel = lastDays ? "Últimos dias" : "Pode cancelar";

      return {
        r,
        start,
        end,
        cancelFrom,
        cancelTo,
        inWindow,
        lastDays,
        daysToClose,
        windowLabel,
      };
    });
  }, [rows]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const x of rows) if (x.status) set.add(x.status);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return computed.filter((x) => {
      if (statusFilter !== "all") {
        const st = (x.r.status ?? "").toLowerCase();
        if (st !== statusFilter.toLowerCase()) return false;
      }

      if (!query) return true;

      const name = (x.r.leads?.name ?? "").toLowerCase();
      const phone = normalizePhoneReadable(x.r.leads?.phone_raw ?? null, x.r.leads?.phone_e164 ?? null).toLowerCase();
      const status = (x.r.status ?? "").toLowerCase();

      return `${name} ${phone} ${status}`.includes(query);
    });
  }, [computed, q, statusFilter]);

  const totals = useMemo(() => {
    let ativos = 0;
    let podeCancelar = 0;
    let ultimosDias = 0;

    for (const x of computed) {
      if ((x.r.status ?? "").toLowerCase() === "ativo") ativos++;
      if (x.inWindow) podeCancelar++;
      if (x.lastDays) ultimosDias++;
    }

    return { ativos, podeCancelar, ultimosDias, total: computed.length };
  }, [computed]);

  const wrap: React.CSSProperties = {
    maxWidth: 1200,
    margin: "0 auto",
    padding: 16,
  };

  const topBar: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14,
  };

  const title: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 950,
    letterSpacing: 0.2,
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    outline: "none",
    minWidth: 240,
  };

  const selectStyle: React.CSSProperties = { ...inputStyle, minWidth: 190 };

  const btn: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 900,
  };

  const btnPrimary: React.CSSProperties = {
    ...btn,
    border: "1px solid rgba(180,120,255,0.28)",
    background:
      "linear-gradient(180deg, rgba(180,120,255,0.20) 0%, rgba(180,120,255,0.08) 100%)",
  };

  const card: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    padding: 12,
    boxShadow: "0 22px 70px rgba(0,0,0,0.40)",
  };

  const tableWrap: React.CSSProperties = {
    overflowX: "auto",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
  };

  const th: React.CSSProperties = {
    textAlign: "left",
    fontSize: 12,
    opacity: 0.85,
    fontWeight: 900,
    padding: "12px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: "12px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    verticalAlign: "top",
    fontSize: 13,
  };

  return (
    <div style={wrap}>
      <div style={topBar}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={title}>Recorrências</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={chipStyle("muted")}>Total: {totals.total}</span>
            <span style={chipStyle("primary")}>Ativos: {totals.ativos}</span>
            <span style={chipStyle("warn")}>Pode cancelar: {totals.podeCancelar}</span>
            <span style={chipStyle("danger")}>Últimos dias: {totals.ultimosDias}</span>
            {loading ? <span style={chipStyle("muted")}>Carregando…</span> : <span style={chipStyle("muted")}>Pronto</span>}
          </div>

          {errMsg ? (
            <div style={{ fontSize: 12, opacity: 0.9, color: "rgba(255,160,190,0.95)" }}>
              Erro: {errMsg}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btn} onClick={() => router.push("/dashboard")}>
            Voltar
          </button>
          <button style={btn} onClick={fetchRows}>
            Recarregar
          </button>
        </div>
      </div>

      {/* FORM: ADICIONAR RECORRÊNCIA */}
<div style={{ ...card, marginBottom: 14 }}>
  <div style={{ fontWeight: 950, marginBottom: 10 }}>Adicionar recorrência</div>

  {/* GRID 1 LINHA COM LABELS */}
  <div
    style={{
      display: "grid",
      gap: 10,
      gridTemplateColumns: "2.4fr 1.1fr 1.1fr 0.8fr 0.8fr auto",
      alignItems: "end",
    }}
  >
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 900 }}>Cliente</div>
      <select
        style={{ ...selectStyle, minWidth: 0, width: "100%" }}
        value={formLeadId}
        onChange={(e) => setFormLeadId(e.target.value)}
      >
        {leads.length === 0 ? <option value="">Sem leads</option> : null}
        {leads.map((l) => {
          const phone = normalizePhoneReadable(l.phone_raw, l.phone_e164);
          const label = `${l.name ?? "Sem nome"}${phone ? ` • ${phone}` : ""}`;
          return (
            <option key={l.id} value={l.id}>
              {label}
            </option>
          );
        })}
      </select>
    </div>

    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 900 }}>Status</div>
      <select style={{ ...selectStyle, minWidth: 0, width: "100%" }} value={formStatus} onChange={(e) => setFormStatus(e.target.value)}>
        <option value="ativo">ativo</option>
        <option value="pausado">pausado</option>
        <option value="encerrado">encerrado</option>
        <option value="cancelado">cancelado</option>
      </select>
    </div>

    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 900 }}>Início</div>
      <input
        type="date"
        style={{ ...inputStyle, minWidth: 0, width: "100%" }}
        value={formStartDate}
        onChange={(e) => setFormStartDate(e.target.value)}
      />
    </div>

    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 900 }}>Total</div>
      <input
        type="number"
        style={{ ...inputStyle, minWidth: 0, width: "100%" }}
        value={formTotal}
        onChange={(e) => setFormTotal(Number(e.target.value))}
        min={1}
      />
    </div>

    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 900 }}>Pagas</div>
      <input
        type="number"
        style={{ ...inputStyle, minWidth: 0, width: "100%" }}
        value={formDone}
        onChange={(e) => setFormDone(Number(e.target.value))}
        min={0}
      />
    </div>

    <button style={saving ? btn : btnPrimary} disabled={saving} onClick={handleCreate}>
      {saving ? "Salvando..." : "Salvar"}
    </button>
  </div>

  <div style={{ fontSize: 12, opacity: 0.72, marginTop: 10 }}>
    Regra: cancelar somente do <b>Fim+1</b> até <b>Fim+27</b>.
  </div>
</div>

      {/* FILTROS */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            style={inputStyle}
            placeholder="Buscar (nome/telefone/status...)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select style={selectStyle} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Todos os status</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button
            style={btn}
            onClick={() => {
              setQ("");
              setStatusFilter("all");
            }}
          >
            Limpar
          </button>
        </div>
      </div>

      {/* TABELA */}
      <div style={tableWrap}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Cliente</th>
              <th style={th}>Status</th>
              <th style={th}>Início</th>
              <th style={th}>Parcelas</th>
              <th style={th}>Fim previsto</th>
              <th style={th}>Janela p/ cancelar</th>
              <th style={th}>Situação</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td style={td} colSpan={7}>
                  <div style={{ opacity: 0.75 }}>
                    {loading ? "Carregando..." : "Nenhuma recorrência encontrada com esses filtros."}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((x) => {
                const leadName = x.r.leads?.name ?? "—";
                const phone = normalizePhoneReadable(x.r.leads?.phone_raw ?? null, x.r.leads?.phone_e164 ?? null);

                const status = (x.r.status ?? "—").toString();
                const stLower = status.toLowerCase();

                let windowChipKind: "muted" | "warn" | "danger" = "muted";
                if (x.inWindow) windowChipKind = x.lastDays ? "danger" : "warn";

                return (
                  <tr key={x.r.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 900 }}>{leadName}</div>
                      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{phone || "—"}</div>
                    </td>

                    <td style={td}>
                      <span style={chipStyle(stLower === "ativo" ? "primary" : "muted")}>{status}</span>
                    </td>

                    <td style={td}>{formatDateBR(x.start)}</td>

                    <td style={td}>
                      <div style={{ fontWeight: 900 }}>
                        {Number(x.r.installments_done || 0)} / {Number(x.r.installments_total || 0)}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Pagas / Total</div>
                    </td>

                    <td style={td}>
                      <div style={{ fontWeight: 900 }}>{formatDateBR(x.end)}</div>
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Último pagamento</div>
                    </td>

                    <td style={td}>
                      <div style={{ fontWeight: 900 }}>
                        {formatDateBR(x.cancelFrom)} → {formatDateBR(x.cancelTo)}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Janela permitida</div>
                    </td>

                    <td style={td}>
                      <span style={chipStyle(windowChipKind)}>{x.windowLabel}</span>
                      {x.inWindow ? (
                        <div style={{ fontSize: 12, opacity: 0.78, marginTop: 6 }}>
                          {x.lastDays ? `⚠️ Faltam ${x.daysToClose} dia(s)` : `Faltam ${x.daysToClose} dia(s) p/ fechar`}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, opacity: 0.78, marginTop: 6 }}>Ainda não é a hora de cancelar</div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 12 }}>
        Se ao salvar aparecer erro, geralmente é: <b>RLS/policy</b> na tabela <b>recorrencias</b> ou <b>lead_id</b> inválido.
      </div>
    </div>
  );
}