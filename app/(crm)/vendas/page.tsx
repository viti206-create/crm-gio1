"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SelectDark from "../_components/SelectDark";

type LeadRow = {
  id: string;
  name: string;
  phone_raw: string | null;
  phone_e164: string | null;
};

type SaleRow = {
  id: string;
  lead_id: string;
  value: number | null;
  value_gross: number | null;
  value_net: number | null;
  fee_percent: number | null;
  payment_method: string | null;
  installments_label: string | null;
  sale_type: string | null;
  seller_name: string | null;
  source: string | null;
  procedure: string | null;
  notes: string | null;
  closed_at: string | null;
  responsible_id: string | null;
  leads?: LeadRow | null;
};

type ChipKind = "primary" | "muted" | "warn" | "danger";

function chipStyle(kind: ChipKind = "muted"): React.CSSProperties {
  let border = "1px solid rgba(255,255,255,0.10)";
  let bg = "rgba(255,255,255,0.04)";
  let color = "rgba(255,255,255,0.90)";

  if (kind === "primary") {
    border = "1px solid rgba(180,120,255,0.35)";
    bg = "rgba(180,120,255,0.12)";
  }
  if (kind === "warn") {
    border = "1px solid rgba(255,200,120,0.35)";
    bg = "rgba(255,200,120,0.10)";
  }
  if (kind === "danger") {
    border = "1px solid rgba(255,120,160,0.35)";
    bg = "rgba(255,120,160,0.12)";
  }

  return {
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 999,
    border,
    background: bg,
    color,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    lineHeight: "16px",
    whiteSpace: "nowrap",
    fontWeight: 900,
  };
}

function formatBRL(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

function formatDateTimeBR(iso: string | null | undefined) {
  try {
    if (!iso) return "—";
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  } catch {
    return "—";
  }
}

function toDatetimeLocalValue(iso?: string | null) {
  try {
    if (!iso) return "";
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  } catch {
    return "";
  }
}

function datetimeLocalToISO(v: string) {
  try {
    if (!v) return null;
    return new Date(v).toISOString();
  } catch {
    return null;
  }
}

function normalizePhoneReadable(raw: string | null, e164: string | null) {
  const base = (raw && raw.trim().length > 0 ? raw : e164) || "";
  return base.trim();
}

export default function VendasPage() {
  const router = useRouter();
  const topRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [rows, setRows] = useState<SaleRow[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);

  // form
  const [formLeadId, setFormLeadId] = useState("");
  const [formSaleType, setFormSaleType] = useState("procedimento");
  const [formProcedure, setFormProcedure] = useState("");
  const [formGross, setFormGross] = useState<number>(0);
  const [formNet, setFormNet] = useState<number>(0);
  const [formFeePercent, setFormFeePercent] = useState<number>(0);
  const [formPaymentMethod, setFormPaymentMethod] = useState("pix");
  const [formInstallmentsLabel, setFormInstallmentsLabel] = useState("à vista");
  const [formSellerName, setFormSellerName] = useState("");
  const [formSource, setFormSource] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formClosedAt, setFormClosedAt] = useState("");

  // filtros
  const [q, setQ] = useState("");
  const [saleTypeFilter, setSaleTypeFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sellerFilter, setSellerFilter] = useState("all");

  async function fetchAll() {
    setLoading(true);

    const { data: leadsData, error: leadsErr } = await supabase
      .from("leads")
      .select("id,name,phone_raw,phone_e164")
      .order("name", { ascending: true });

    const { data: salesData, error: salesErr } = await supabase
      .from("sales")
      .select(`
        id,
        lead_id,
        value,
        value_gross,
        value_net,
        fee_percent,
        payment_method,
        installments_label,
        sale_type,
        seller_name,
        source,
        procedure,
        notes,
        closed_at,
        responsible_id,
        leads(id,name,phone_raw,phone_e164)
      `)
      .order("closed_at", { ascending: false });

    if (leadsErr) console.error("leads error:", leadsErr);
    if (salesErr) console.error("sales error:", salesErr);

    setLeads((leadsData as any) ?? []);
    setRows((salesData as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  function resetFormToCreate() {
    setEditingId(null);
    setFormLeadId("");
    setFormSaleType("procedimento");
    setFormProcedure("");
    setFormGross(0);
    setFormNet(0);
    setFormFeePercent(0);
    setFormPaymentMethod("pix");
    setFormInstallmentsLabel("à vista");
    setFormSellerName("");
    setFormSource("");
    setFormNotes("");
    setFormClosedAt("");
  }

  function startEdit(x: SaleRow) {
    setEditingId(x.id);
    setFormLeadId(x.lead_id);
    setFormSaleType((x.sale_type ?? "procedimento").toString());
    setFormProcedure((x.procedure ?? "").toString());
    setFormGross(Number(x.value_gross ?? x.value ?? 0));
    setFormNet(Number(x.value_net ?? x.value ?? 0));
    setFormFeePercent(Number(x.fee_percent ?? 0));
    setFormPaymentMethod((x.payment_method ?? "pix").toString());
    setFormInstallmentsLabel((x.installments_label ?? "à vista").toString());
    setFormSellerName((x.seller_name ?? "").toString());
    setFormSource((x.source ?? "").toString());
    setFormNotes((x.notes ?? "").toString());
    setFormClosedAt(toDatetimeLocalValue(x.closed_at));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const canSave = useMemo(() => {
    if (saving) return false;
    if (!formLeadId) return false;
    if (!formSaleType.trim()) return false;
    if (!formProcedure.trim()) return false;
    if (!formPaymentMethod.trim()) return false;

    const gross = Number(formGross);
    const net = Number(formNet);
    const fee = Number(formFeePercent);

    if (!Number.isFinite(gross) || gross < 0) return false;
    if (!Number.isFinite(net) || net < 0) return false;
    if (!Number.isFinite(fee) || fee < 0 || fee > 100) return false;

    return true;
  }, [saving, formLeadId, formSaleType, formProcedure, formPaymentMethod, formGross, formNet, formFeePercent]);

  async function handleSave() {
    if (!canSave) return;

    setSaving(true);

    const payload = {
      lead_id: formLeadId,
      sale_type: formSaleType.trim(),
      procedure: formProcedure.trim(),
      value: Number(formGross), // compatibilidade com relatórios antigos
      value_gross: Number(formGross),
      value_net: Number(formNet),
      fee_percent: Number(formFeePercent),
      payment_method: formPaymentMethod.trim(),
      installments_label: formInstallmentsLabel.trim() || null,
      seller_name: formSellerName.trim() || null,
      source: formSource.trim() || null,
      notes: formNotes.trim() || null,
      closed_at: datetimeLocalToISO(formClosedAt) ?? new Date().toISOString(),
    };

    let err: any = null;

    if (editingId) {
      const { error } = await supabase.from("sales").update(payload).eq("id", editingId);
      err = error;
    } else {
      const { error } = await supabase.from("sales").insert(payload);
      err = error;
    }

    setSaving(false);

    if (err) {
      console.error("save sale error:", err);
      alert(err.message ?? "Erro ao salvar venda.");
      return;
    }

    await fetchAll();
    resetFormToCreate();
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleDelete(id: string) {
    const ok = window.confirm("Tem certeza que deseja excluir essa venda?");
    if (!ok) return;

    setDeletingId(id);
    const previous = rows;
    setRows((prev) => prev.filter((r) => r.id !== id));

    const { data, error } = await supabase.from("sales").delete().eq("id", id).select("id");

    setDeletingId(null);

    if (error) {
      console.error("delete sale error:", error);
      alert(error.message ?? "Não consegui excluir a venda.");
      setRows(previous);
      return;
    }

    if (!data || data.length === 0) {
      alert("Não consegui excluir a venda (provável RLS/policy).");
      setRows(previous);
      await fetchAll();
      return;
    }

    await fetchAll();
  }

  const saleTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.sale_type) set.add(r.sale_type);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const paymentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.payment_method) set.add(r.payment_method);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const sellerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.seller_name) set.add(r.seller_name);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return rows.filter((r) => {
      if (saleTypeFilter !== "all" && (r.sale_type ?? "") !== saleTypeFilter) return false;
      if (paymentFilter !== "all" && (r.payment_method ?? "") !== paymentFilter) return false;
      if (sellerFilter !== "all" && (r.seller_name ?? "") !== sellerFilter) return false;

      if (!query) return true;

      const hay = [
        r.leads?.name ?? "",
        r.leads?.phone_raw ?? "",
        r.leads?.phone_e164 ?? "",
        r.procedure ?? "",
        r.sale_type ?? "",
        r.seller_name ?? "",
        r.source ?? "",
        r.payment_method ?? "",
        r.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(query);
    });
  }, [rows, q, saleTypeFilter, paymentFilter, sellerFilter]);

  const totals = useMemo(() => {
    const gross = filtered.reduce((acc, r) => acc + Number(r.value_gross ?? r.value ?? 0), 0);
    const net = filtered.reduce((acc, r) => acc + Number(r.value_net ?? r.value ?? 0), 0);
    return { gross, net };
  }, [filtered]);

  const page: React.CSSProperties = {
    padding: 16,
    color: "white",
  };

  const shell: React.CSSProperties = {
    background:
      "radial-gradient(900px 500px at 20% 15%, rgba(180,120,255,0.25), transparent 60%), linear-gradient(180deg, #09070c 0%, #050408 100%)",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    padding: 16,
  };

  const card: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 22px 70px rgba(0,0,0,0.55)",
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    outline: "none",
    width: "100%",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    minWidth: 190,
    cursor: "pointer",
  };

  const btn: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 900,
    whiteSpace: "nowrap",
  };

  const btnPrimary: React.CSSProperties = {
    ...btn,
    border: "1px solid rgba(180,120,255,0.28)",
    background:
      "linear-gradient(180deg, rgba(180,120,255,0.20) 0%, rgba(180,120,255,0.08) 100%)",
  };

  const btnDanger: React.CSSProperties = {
    ...btn,
    border: "1px solid rgba(255,120,160,0.35)",
    background: "rgba(255,120,160,0.10)",
  };

  const label: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.85,
    fontWeight: 900,
    letterSpacing: 0.2,
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
    <div style={page}>
      <div style={shell}>
        <div ref={topRef} />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 0.2 }}>Vendas</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={chipStyle("muted")}>Total: {filtered.length}</span>
              <span style={chipStyle("primary")}>Bruto: {formatBRL(totals.gross)}</span>
              <span style={chipStyle("warn")}>Líquido: {formatBRL(totals.net)}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => router.push("/leads/new")} style={btnPrimary}>
              + Novo lead
            </button>
          </div>
        </div>

        {editingId ? (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button type="button" style={btnDanger} onClick={resetFormToCreate}>
              Cancelar edição
            </button>
          </div>
        ) : null}

        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontWeight: 950, marginBottom: 10 }}>
            {editingId ? "Editar venda" : "Adicionar venda"}
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "1.2fr 0.8fr 1fr 0.7fr 0.7fr 0.6fr",
              alignItems: "end",
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Cliente *</div>
              <SelectDark
                value={formLeadId}
                onChange={setFormLeadId}
                placeholder="Selecione..."
                options={leads.map((l) => ({
                  value: l.id,
                  label: l.name,
                  meta: l.phone_raw ?? l.phone_e164 ?? "",
                }))}
                searchable
                searchPlaceholder="Buscar cliente..."
                minWidth={300}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Tipo *</div>
              <SelectDark
                value={formSaleType}
                onChange={setFormSaleType}
                options={[
                  { value: "procedimento", label: "Procedimento" },
                  { value: "pacote", label: "Pacote" },
                  { value: "recorrencia", label: "Recorrência" },
                ]}
                searchable={false}
                minWidth={180}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Procedimento / pacote *</div>
              <input
                style={inputStyle}
                value={formProcedure}
                onChange={(e) => setFormProcedure(e.target.value)}
                placeholder="Ex: Botox, Depilação, Mensalidade drenagem"
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Bruto *</div>
              <input
                type="number"
                min={0}
                step="0.01"
                value={formGross}
                onChange={(e) => setFormGross(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Líquido *</div>
              <input
                type="number"
                min={0}
                step="0.01"
                value={formNet}
                onChange={(e) => setFormNet(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Taxa %</div>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={formFeePercent}
                onChange={(e) => setFormFeePercent(Number(e.target.value))}
                style={inputStyle}
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "0.8fr 0.8fr 0.8fr 0.8fr 1fr 1fr",
              alignItems: "end",
              marginTop: 12,
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Forma</div>
              <SelectDark
                value={formPaymentMethod}
                onChange={setFormPaymentMethod}
                options={[
                  { value: "pix", label: "Pix" },
                  { value: "maquininha", label: "Maquininha" },
                  { value: "link", label: "Link" },
                  { value: "boletos", label: "Boletos" },
                  { value: "dinheiro", label: "Dinheiro" },
                  { value: "transferencia", label: "Transferência" },
                ]}
                searchable={false}
                minWidth={180}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Parcelas</div>
              <input
                style={inputStyle}
                value={formInstallmentsLabel}
                onChange={(e) => setFormInstallmentsLabel(e.target.value)}
                placeholder="Ex: 12x / à vista / crédito"
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Vendedor / profissional</div>
              <input
                style={inputStyle}
                value={formSellerName}
                onChange={(e) => setFormSellerName(e.target.value)}
                placeholder="Ex: Tainá"
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Origem</div>
              <input
                style={inputStyle}
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                placeholder="Ex: Instagram, Google, Indicação"
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Data</div>
              <input
                type="datetime-local"
                value={formClosedAt}
                onChange={(e) => setFormClosedAt(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={label}>Observações</div>
              <input
                style={inputStyle}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Ex: observações da venda"
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, gap: 10 }}>
            <button type="button" style={btnPrimary} onClick={handleSave} disabled={!canSave}>
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar"}
            </button>
          </div>
        </div>

        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              style={{ ...inputStyle, minWidth: 260 }}
              placeholder="Buscar (cliente, procedimento, origem, vendedor...)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <select value={saleTypeFilter} onChange={(e) => setSaleTypeFilter(e.target.value)} style={selectStyle}>
              <option value="all">Todos os tipos</option>
              {saleTypeOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} style={selectStyle}>
              <option value="all">Todas as formas</option>
              {paymentOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)} style={selectStyle}>
              <option value="all">Todos os vendedores</option>
              {sellerOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <button
              type="button"
              style={btn}
              onClick={() => {
                setQ("");
                setSaleTypeFilter("all");
                setPaymentFilter("all");
                setSellerFilter("all");
              }}
            >
              Limpar
            </button>
          </div>
        </div>

        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={th}>Cliente</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Procedimento</th>
                  <th style={th}>Bruto</th>
                  <th style={th}>Líquido</th>
                  <th style={th}>Forma</th>
                  <th style={th}>Parcelas</th>
                  <th style={th}>Vendedor</th>
                  <th style={th}>Origem</th>
                  <th style={th}>Data</th>
                  <th style={th}>Ações</th>
                </tr>
              </thead>

              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td style={td} colSpan={11}>
                      <div style={{ opacity: 0.75 }}>
                        {loading ? "Carregando..." : "Nenhuma venda encontrada com esses filtros."}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((x) => {
                    const leadName = x.leads?.name ?? "—";
                    const phone = normalizePhoneReadable(
                      x.leads?.phone_raw ?? null,
                      x.leads?.phone_e164 ?? null
                    );

                    return (
                      <tr key={x.id}>
                        <td style={td}>
                          <div style={{ fontWeight: 900 }}>{leadName}</div>
                          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{phone || "—"}</div>
                        </td>

                        <td style={td}>
                          <span style={chipStyle("primary")}>{x.sale_type ?? "—"}</span>
                        </td>

                        <td style={td}>
                          <div style={{ fontWeight: 900 }}>{x.procedure ?? "—"}</div>
                          {x.notes ? (
                            <div style={{ fontSize: 12, opacity: 0.78, marginTop: 4 }}>{x.notes}</div>
                          ) : null}
                        </td>

                        <td style={td}>{formatBRL(x.value_gross ?? x.value)}</td>
                        <td style={td}>{formatBRL(x.value_net ?? x.value)}</td>
                        <td style={td}>{x.payment_method ?? "—"}</td>
                        <td style={td}>{x.installments_label ?? "—"}</td>
                        <td style={td}>{x.seller_name ?? "—"}</td>
                        <td style={td}>{x.source ?? "—"}</td>
                        <td style={td}>{formatDateTimeBR(x.closed_at)}</td>

                        <td style={td}>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <button style={btn} onClick={() => startEdit(x)} disabled={saving || !!deletingId}>
                              Editar
                            </button>

                            <button
                              style={btnDanger}
                              onClick={() => handleDelete(x.id)}
                              disabled={deletingId === x.id || saving}
                            >
                              {deletingId === x.id ? "Excluindo..." : "Excluir"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}