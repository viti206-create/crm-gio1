"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAdminAccess } from "../../_hooks/useAdminAccess";
import SelectDark from "../../_components/SelectDark";

type FinancialCategory = {
  id: string;
  scope: "clinic" | "personal";
  name: string;
  type: "income" | "expense" | "both";
  parent_id: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

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

function scopeLabel(scope: string) {
  if (scope === "clinic") return "Clínica";
  if (scope === "personal") return "Pessoal";
  return scope;
}

function typeLabel(type: string) {
  if (type === "income") return "Receita";
  if (type === "expense") return "Despesa";
  if (type === "both") return "Ambos";
  return type;
}

export default function FinanceiroCategoriasPage() {
  const router = useRouter();
  const { isAdmin, loadingRole } = useAdminAccess();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<FinancialCategory[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);

  const [scope, setScope] = useState<"clinic" | "personal">("clinic");
  const [name, setName] = useState("");
  const [type, setType] = useState<"income" | "expense" | "both">("expense");
  const [parentId, setParentId] = useState("");
  const [color, setColor] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  const [filterScope, setFilterScope] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    if (!loadingRole && !isAdmin) {
      router.replace("/home");
    }
  }, [loadingRole, isAdmin, router]);

  async function fetchAll() {
    setLoading(true);

    const { data, error } = await supabase
      .from("financial_categories")
      .select("*")
      .order("scope", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data as FinancialCategory[]) ?? []);
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
    setType("expense");
    setParentId("");
    setColor("");
    setSortOrder("0");
    setIsActive(true);
    setErrorMsg("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (!name.trim()) {
      setErrorMsg("Informe o nome da categoria.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        scope,
        name: name.trim(),
        type,
        parent_id: parentId || null,
        color: color.trim() || null,
        sort_order: Number(sortOrder || 0),
        is_active: isActive,
      };

      if (editingId) {
        const { error } = await supabase
          .from("financial_categories")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("financial_categories")
          .insert(payload);

        if (error) throw error;
      }

      resetForm();
      await fetchAll();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(
        e?.message?.includes("uq_financial_categories_scope_lower_name")
          ? "Já existe uma categoria com esse nome nesse ambiente."
          : e?.message ?? "Erro ao salvar categoria."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(row: FinancialCategory) {
    setEditingId(row.id);
    setScope(row.scope);
    setName(row.name ?? "");
    setType(row.type);
    setParentId(row.parent_id ?? "");
    setColor(row.color ?? "");
    setSortOrder(String(row.sort_order ?? 0));
    setIsActive(!!row.is_active);
    setErrorMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: string) {
    const ok = window.confirm("Deseja realmente excluir esta categoria?");
    if (!ok) return;

    try {
      const { error } = await supabase
        .from("financial_categories")
        .delete()
        .eq("id", id);

      if (error) throw error;

      if (editingId === id) resetForm();
      await fetchAll();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Erro ao excluir categoria.");
    }
  }

  async function handleToggleActive(row: FinancialCategory) {
    try {
      const { error } = await supabase
        .from("financial_categories")
        .update({ is_active: !row.is_active })
        .eq("id", row.id);

      if (error) throw error;
      await fetchAll();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Erro ao alterar status.");
    }
  }

  const parentOptions = useMemo(() => {
    return rows
      .filter((r) => r.scope === scope && r.id !== editingId)
      .map((r) => ({
        value: r.id,
        label: r.name,
      }));
  }, [rows, scope, editingId]);

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();

    return rows.filter((row) => {
      if (filterScope !== "all" && row.scope !== filterScope) return false;
      if (filterType !== "all" && row.type !== filterType) return false;

      if (!q) return true;

      const parentName = rows.find((x) => x.id === row.parent_id)?.name ?? "";

      const hay = [row.name ?? "", parentName, row.color ?? ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filterScope, filterType, filterText]);

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
            Categorias Financeiras
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
            {editingId ? "Editar categoria" : "Nova categoria"}
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
              onChange={(v) => setType(v as "income" | "expense" | "both")}
              searchable={false}
              options={[
                { value: "income", label: "Receita" },
                { value: "expense", label: "Despesa" },
                { value: "both", label: "Ambos" },
              ]}
            />
          </div>

          <div>
            <label style={labelStyle}>Ordem</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              style={inputStyle}
              placeholder="0"
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
              placeholder="Ex.: Marketing / Procedimentos / Moradia"
            />
          </div>

          <div>
            <label style={labelStyle}>Categoria pai</label>
            <SelectDark
              value={parentId}
              onChange={setParentId}
              searchable
              options={[
                { value: "", label: "Nenhuma" },
                ...parentOptions,
              ]}
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
              : "Salvar categoria"}
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
            gridTemplateColumns: "1.5fr 1fr 1fr auto",
            gap: 10,
          }}
        >
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={inputStyle}
            placeholder="Buscar categoria..."
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
              { value: "income", label: "Receita" },
              { value: "expense", label: "Despesa" },
              { value: "both", label: "Ambos" },
            ]}
          />

          <button
            type="button"
            onClick={() => {
              setFilterText("");
              setFilterScope("all");
              setFilterType("all");
            }}
            style={btn}
          >
            Limpar
          </button>
        </div>

        <div style={{ fontSize: 18, fontWeight: 900 }}>Categorias</div>

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
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Pai</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Ordem</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Status</th>
                  <th style={{ textAlign: "left", paddingBottom: 10 }}>Ações</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((row) => {
                  const parentName = rows.find((x) => x.id === row.parent_id)?.name ?? "—";

                  return (
                    <tr key={row.id}>
                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>{row.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {row.color || "Sem cor"}
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
                        {parentName}
                      </td>

                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {row.sort_order}
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
                  );
                })}

                {!filteredRows.length ? (
                  <tr>
                    <td colSpan={7} style={{ paddingTop: 12, opacity: 0.7 }}>
                      Nenhuma categoria encontrada.
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