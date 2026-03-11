"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAdminAccess } from "../../_hooks/useAdminAccess";
import SelectDark from "../../_components/SelectDark";

type FinancialAccount = {
  id: string;
  scope: "clinic" | "personal";
  name: string;
  type: string;
  bank_name: string | null;
  color: string | null;
  is_active: boolean;
  initial_balance: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function formatBRL(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function scopeLabel(scope: string) {
  if (scope === "clinic") return "Clínica";
  if (scope === "personal") return "Pessoal";
  return scope;
}

function typeLabel(type: string) {
  if (type === "checking") return "Conta corrente";
  if (type === "savings") return "Poupança";
  if (type === "cash") return "Caixa";
  if (type === "wallet") return "Carteira";
  if (type === "pix") return "Pix";
  if (type === "card_settlement") return "Recebimento cartão";
  if (type === "other") return "Outro";
  return type;
}

function chipStyle(kind: "primary" | "muted" | "warn" = "muted"): React.CSSProperties {
  let border = "1px solid rgba(255,255,255,0.10)";
  let bg = "rgba(255,255,255,0.04)";

  if (kind === "primary") {
    border = "1px solid rgba(180,120,255,0.35)";
    bg = "rgba(180,120,255,0.12)";
  }

  if (kind === "warn") {
    border = "1px solid rgba(255,200,120,0.35)";
    bg = "rgba(255,200,120,0.10)";
  }

  return {
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 999,
    border,
    background: bg,
    color: "rgba(255,255,255,0.92)",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    lineHeight: "16px",
    whiteSpace: "nowrap",
    fontWeight: 900,
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  padding: "10px 12px",
  borderRadius: 12,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.82,
  fontWeight: 900,
  marginBottom: 6,
  display: "block",
};

const btn: React.CSSProperties = {
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

const btnPrimary: React.CSSProperties = {
  ...btn,
  border: "1px solid rgba(180,120,255,0.30)",
  background:
    "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)",
};

const btnDanger: React.CSSProperties = {
  ...btn,
  border: "1px solid rgba(255,120,120,0.30)",
  background:
    "linear-gradient(180deg, rgba(255,120,120,0.16) 0%, rgba(255,120,120,0.07) 100%)",
};

export default function FinanceiroContasPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<FinancialAccount[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);

  const [scope, setScope] = useState<"clinic" | "personal">("clinic");
  const [name, setName] = useState("");
  const [type, setType] = useState("checking");
  const [bankName, setBankName] = useState("");
  const [color, setColor] = useState("");
  const [initialBalance, setInitialBalance] = useState("0");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [filterScope, setFilterScope] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/home");
    }
  }, [loadingRole, isAdmin, router]);

  async function fetchAll() {
    setLoading(true);

    const { data, error } = await supabase
      .from("financial_accounts")
      .select("*")
      .order("scope", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data as FinancialAccount[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) {
      fetchAll();
    }
  }, [isAdmin]);

  function resetForm() {
    setEditingId(null);
    setScope("clinic");
    setName("");
    setType("checking");
    setBankName("");
    setColor("");
    setInitialBalance("0");
    setNotes("");
    setIsActive(true);
    setErrorMsg("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (!name.trim()) {
      setErrorMsg("Informe o nome da conta.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        scope,
        name: name.trim(),
        type,
        bank_name: bankName.trim() || null,
        color: color.trim() || null,
        initial_balance: Number(initialBalance || 0),
        notes: notes.trim() || null,
        is_active: isActive,
      };

      if (editingId) {
        const { error } = await supabase
          .from("financial_accounts")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("financial_accounts")
          .insert(payload);

        if (error) throw error;
      }

      resetForm();
      await fetchAll();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Erro ao salvar conta.");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(row: FinancialAccount) {
    setEditingId(row.id);
    setScope(row.scope);
    setName(row.name ?? "");
    setType(row.type ?? "checking");
    setBankName(row.bank_name ?? "");
    setColor(row.color ?? "");
    setInitialBalance(String(row.initial_balance ?? 0));
    setNotes(row.notes ?? "");
    setIsActive(!!row.is_active);
    setErrorMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: string) {
    const ok = window.confirm("Deseja realmente excluir esta conta?");
    if (!ok) return;

    try {
      const { error } = await supabase
        .from("financial_accounts")
        .delete()
        .eq("id", id);

      if (error) throw error;

      if (editingId === id) resetForm();
      await fetchAll();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Erro ao excluir conta.");
    }
  }

  async function handleToggleActive(row: FinancialAccount) {
    try {
      const { error } = await supabase
        .from("financial_accounts")
        .update({ is_active: !row.is_active })
        .eq("id", row.id);

      if (error) throw error;
      await fetchAll();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Erro ao alterar status.");
    }
  }

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();

    return rows.filter((row) => {
      if (filterScope !== "all" && row.scope !== filterScope) return false;
      if (filterType !== "all" && row.type !== filterType) return false;
      if (
        filterStatus !== "all" &&
        String(row.is_active) !== (filterStatus === "active" ? "true" : "false")
      ) {
        return false;
      }

      if (!q) return true;

      const hay = [
        row.name ?? "",
        row.bank_name ?? "",
        row.notes ?? "",
        row.color ?? "",
        typeLabel(row.type),
        scopeLabel(row.scope),
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, filterScope, filterType, filterStatus, filterText]);

  if (loadingRole) {
    return <div style={{ padding: 20, color: "white" }}>Carregando permissões...</div>;
  }

  if (!isAdmin) return null;

  return (
    <div style={{ padding: 16, color: "white", display: "grid", gap: 16 }}>
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
            Contas / Carteiras
          </div>
          <div style={chipStyle("primary")}>Separadas por clínica e pessoal</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/financeiro" style={btn}>
            Voltar
          </Link>
        </div>
      </div>

      <form
        onSubmit={handleSave}
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)",
          borderRadius: 18,
          padding: 16,
          boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            {editingId ? "Editar conta" : "Nova conta"}
          </div>

          {editingId ? (
            <button type="button" style={btn} onClick={resetForm}>
              Cancelar edição
            </button>
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <label style={labelStyle}>Ambiente</label>
            <SelectDark
              value={scope}
              onChange={(v) => setScope(v as "clinic" | "personal")}
              searchable={false}
              options={[
                { value: "clinic", label: "Clínica" },
                { value: "personal", label: "Pessoal" },
              ]}
            />
          </div>

          <div>
            <label style={labelStyle}>Tipo</label>
            <SelectDark
              value={type}
              onChange={setType}
              searchable={false}
              options={[
                { value: "checking", label: "Conta corrente" },
                { value: "savings", label: "Poupança" },
                { value: "cash", label: "Caixa" },
                { value: "wallet", label: "Carteira" },
                { value: "pix", label: "Pix" },
                { value: "card_settlement", label: "Recebimento cartão" },
                { value: "other", label: "Outro" },
              ]}
            />
          </div>

          <div>
            <label style={labelStyle}>Saldo inicial</label>
            <input
              type="number"
              step="0.01"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              style={inputStyle}
              placeholder="0,00"
            />
          </div>

          <div>
            <label style={labelStyle}>Ativa</label>
            <SelectDark
              value={isActive ? "true" : "false"}
              onChange={(v) => setIsActive(v === "true")}
              searchable={false}
              options={[
                { value: "true", label: "Sim" },
                { value: "false", label: "Não" },
              ]}
            />
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              placeholder="Ex.: Caixa principal / Nubank / Carteira"
            />
          </div>

          <div>
            <label style={labelStyle}>Banco</label>
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              style={inputStyle}
              placeholder="Opcional"
            />
          </div>

          <div>
            <label style={labelStyle}>Cor</label>
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={inputStyle}
              placeholder="Ex.: #7c3aed"
            />
          </div>

          <div style={{ gridColumn: "span 4" }}>
            <label style={labelStyle}>Observações</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={inputStyle}
              placeholder="Opcional"
            />
          </div>
        </div>

        {errorMsg ? (
          <div
            style={{
              marginTop: 12,
              color: "#ff9b9b",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {errorMsg}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button type="submit" disabled={saving} style={btnPrimary}>
            {saving
              ? "Salvando..."
              : editingId
              ? "Salvar alterações"
              : "Salvar conta"}
          </button>
        </div>
      </form>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)",
          borderRadius: 18,
          padding: 16,
          boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
          display: "grid",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr 1fr 1fr auto",
            gap: 10,
          }}
        >
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={inputStyle}
            placeholder="Buscar conta..."
          />

          <SelectDark
            value={filterScope}
            onChange={setFilterScope}
            searchable={false}
            options={[
              { value: "all", label: "Todos ambientes" },
              { value: "clinic", label: "Clínica" },
              { value: "personal", label: "Pessoal" },
            ]}
          />

          <SelectDark
            value={filterType}
            onChange={setFilterType}
            searchable={false}
            options={[
              { value: "all", label: "Todos tipos" },
              { value: "checking", label: "Conta corrente" },
              { value: "savings", label: "Poupança" },
              { value: "cash", label: "Caixa" },
              { value: "wallet", label: "Carteira" },
              { value: "pix", label: "Pix" },
              { value: "card_settlement", label: "Recebimento cartão" },
              { value: "other", label: "Outro" },
            ]}
          />

          <SelectDark
            value={filterStatus}
            onChange={setFilterStatus}
            searchable={false}
            options={[
              { value: "all", label: "Todos status" },
              { value: "active", label: "Ativas" },
              { value: "inactive", label: "Inativas" },
            ]}
          />

          <button
            type="button"
            onClick={() => {
              setFilterText("");
              setFilterScope("all");
              setFilterType("all");
              setFilterStatus("all");
            }}
            style={btn}
          >
            Limpar
          </button>
        </div>

        <div style={{ fontSize: 18, fontWeight: 900 }}>Contas</div>

        {loading ? (
          <div>Carregando...</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Nome</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Ambiente</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Tipo</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Banco</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Saldo inicial</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Status</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Ações</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{row.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {row.notes || row.color || "—"}
                      </div>
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {scopeLabel(row.scope)}
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {typeLabel(row.type)}
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {row.bank_name || "—"}
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                        fontWeight: 900,
                      }}
                    >
                      {formatBRL(row.initial_balance)}
                    </td>

                    <td
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <span style={chipStyle(row.is_active ? "primary" : "warn")}>
                        {row.is_active ? "Ativa" : "Inativa"}
                      </span>
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
                          style={btn}
                          onClick={() => handleEdit(row)}
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          style={btnPrimary}
                          onClick={() => handleToggleActive(row)}
                        >
                          {row.is_active ? "Desativar" : "Ativar"}
                        </button>

                        <button
                          type="button"
                          style={btnDanger}
                          onClick={() => handleDelete(row.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!filteredRows.length ? (
                  <tr>
                    <td colSpan={7} style={{ paddingTop: 12, opacity: 0.7 }}>
                      Nenhuma conta encontrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}