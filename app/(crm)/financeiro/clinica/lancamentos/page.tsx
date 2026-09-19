"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Tx = {
  id: string;
  scope: string;
  kind: string;
  status: string;
  description: string;
  amount: number;
  due_date: string | null;
  paid_at: string | null;
  competency_date: string | null;
  counterparty_name: string | null;
  notes: string | null;
  import_source: string | null;
  category_id: string | null;
  account_id: string | null;
};

type FinancialAccount = {
  id: string;
  scope: string;
  name: string;
  type: string;
  bank_name: string | null;
  color: string | null;
  is_active: boolean;
};

type FinancialCategory = {
  id: string;
  scope: string;
  name: string;
  type: string;
  parent_id: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
};

type EditForm = {
  description: string;
  amount: string;
  due_date: string;
  status: string;
  kind: string;
};

type NewForm = {
  kind: "income" | "expense";
  description: string;
  amount: string;
  due_date: string;
  status: "pending" | "paid" | "received" | "late";
  category_id: string;
  account_id: string;
  counterparty_name: string;
  notes: string;
};

function formatBRL(v: number | null | undefined) {
  const n = Number(v ?? 0);

  if (!Number.isFinite(n)) return "R$ 0,00";

  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function todayYMD() {
  const now = new Date();

  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function emptyNewForm(): NewForm {
  return {
    kind: "expense",
    description: "",
    amount: "",
    due_date: todayYMD(),
    status: "paid",
    category_id: "",
    account_id: "",
    counterparty_name: "",
    notes: "",
  };
}

export default function LancamentosClinicaPage() {
  const router = useRouter();

  const today = new Date();

  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);

  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");

  const [filterKind, setFilterKind] =
    useState<"all" | "income" | "expense">("all");

  const [filterStatus, setFilterStatus] =
    useState<"all" | "paid" | "pending" | "received" | "late">("all");

  const [editTx, setEditTx] = useState<Tx | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<NewForm>(emptyNewForm());
  const [newSaving, setNewSaving] = useState(false);

  const [deletingTx, setDeletingTx] = useState<string | null>(null);
  const [movingTx, setMovingTx] = useState<string | null>(null);

  // Mês/ano

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  const MONTH_NAMES = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);

    const [
      transactionsResult,
      accountsResult,
      categoriesResult,
    ] = await Promise.all([
      supabase
        .from("financial_transactions")
        .select("*")
        .eq("scope", "clinic")
        .order("due_date", { ascending: false }),

      supabase
        .from("financial_accounts")
        .select("id, scope, name, type, bank_name, color, is_active")
        .eq("scope", "clinic")
        .eq("is_active", true)
        .order("name", { ascending: true }),

      supabase
        .from("financial_categories")
        .select(
          "id, scope, name, type, parent_id, color, sort_order, is_active"
        )
        .eq("scope", "clinic")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (transactionsResult.error) {
      alert(
        "Erro ao carregar lançamentos: " +
          transactionsResult.error.message
      );
    }

    if (accountsResult.error) {
      console.error(
        "Erro ao carregar contas:",
        accountsResult.error.message
      );
    }

    if (categoriesResult.error) {
      console.error(
        "Erro ao carregar categorias:",
        categoriesResult.error.message
      );
    }

    setTransactions(
      (transactionsResult.data as Tx[] | null) ?? []
    );

    setAccounts(
      (accountsResult.data as FinancialAccount[] | null) ?? []
    );

    setCategories(
      (categoriesResult.data as FinancialCategory[] | null) ?? []
    );

    setLoading(false);
  }

  function openNew() {
    setNewForm(emptyNewForm());
    setShowNew(true);
  }

  function closeNew() {
    if (newSaving) return;

    setShowNew(false);
    setNewForm(emptyNewForm());
  }

  function changeNewKind(kind: "income" | "expense") {
    setNewForm((current) => {
      let nextStatus = current.status;

      if (kind === "income" && current.status === "paid") {
        nextStatus = "received";
      }

      if (kind === "expense" && current.status === "received") {
        nextStatus = "paid";
      }

      return {
        ...current,
        kind,
        status: nextStatus,
        category_id: "",
      };
    });
  }

  async function saveNew() {
    const description = newForm.description.trim();

    if (!description) {
      alert("Informe a descrição do lançamento.");
      return;
    }

    const normalizedAmount = newForm.amount
      .trim()
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");

    const amount = Number(normalizedAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Informe um valor válido maior que zero.");
      return;
    }

    if (!newForm.due_date) {
      alert("Informe a data do lançamento.");
      return;
    }

    if (
      newForm.kind === "income" &&
      newForm.status === "paid"
    ) {
      alert(
        'Para uma receita concluída, utilize o status "Recebido".'
      );
      return;
    }

    if (
      newForm.kind === "expense" &&
      newForm.status === "received"
    ) {
      alert(
        'Para uma despesa concluída, utilize o status "Pago".'
      );
      return;
    }

    setNewSaving(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setNewSaving(false);

      alert(
        "Não foi possível identificar o usuário autenticado."
      );

      return;
    }

    const isCompleted =
      newForm.status === "paid" ||
      newForm.status === "received";

    const { error } = await supabase
      .from("financial_transactions")
      .insert({
        scope: "clinic",
        kind: newForm.kind,
        status: newForm.status,
        description,
        amount,
        gross_amount: null,
        net_amount: null,
        fee_amount: null,
        fee_percent: null,
        due_date: newForm.due_date,
        paid_at: isCompleted ? newForm.due_date : null,
        competency_date: newForm.due_date,
        account_id: newForm.account_id || null,
        category_id: newForm.category_id || null,
        card_id: null,
        counterparty_name:
          newForm.counterparty_name.trim() || null,
        reference_code: null,
        source_type: "manual",
        source_id: null,
        installment_number: null,
        installment_total: null,
        is_future: false,
        created_by: user.id,
        import_source: null,
        import_file_name: null,
        import_batch_id: null,
        external_import_key: null,
        import_note: null,
        notes: newForm.notes.trim() || null,
      });

    setNewSaving(false);

    if (error) {
      alert("Erro ao criar lançamento: " + error.message);
      return;
    }

    const selectedDate = new Date(
      newForm.due_date + "T12:00:00"
    );

    setCurrentYear(selectedDate.getFullYear());
    setCurrentMonth(selectedDate.getMonth());

    setShowNew(false);
    setNewForm(emptyNewForm());

    await fetchAll();
  }

  function openEdit(tx: Tx) {
    setEditTx(tx);

    setEditForm({
      description: tx.description ?? "",
      amount: String(tx.amount ?? ""),
      due_date: tx.due_date ?? tx.paid_at ?? "",
      status: tx.status ?? "paid",
      kind: tx.kind ?? "expense",
    });
  }

  async function saveEdit() {
    if (!editTx || !editForm) return;

    const description = editForm.description.trim();

    if (!description) {
      alert("Informe a descrição.");
      return;
    }

    const amount = parseFloat(
      editForm.amount.replace(",", ".")
    );

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Informe um valor válido maior que zero.");
      return;
    }

    if (
      editForm.kind === "income" &&
      editForm.status === "paid"
    ) {
      alert(
        'Para uma receita concluída, utilize o status "Recebido".'
      );
      return;
    }

    if (
      editForm.kind === "expense" &&
      editForm.status === "received"
    ) {
      alert(
        'Para uma despesa concluída, utilize o status "Pago".'
      );
      return;
    }

    setEditSaving(true);

    const { error } = await supabase
      .from("financial_transactions")
      .update({
        description,
        amount,
        due_date: editForm.due_date || null,
        paid_at: ["paid", "received"].includes(editForm.status)
          ? editForm.due_date || null
          : null,
        status: editForm.status,
        kind: editForm.kind,
      })
      .eq("id", editTx.id);

    setEditSaving(false);

    if (error) {
      alert("Erro: " + error.message);
      return;
    }

    setEditTx(null);
    setEditForm(null);

    await fetchAll();
  }

  async function deleteTx(tx: Tx) {
    setDeletingTx(null);

    const { error } = await supabase
      .from("financial_transactions")
      .delete()
      .eq("id", tx.id);

    if (error) {
      alert("Erro: " + error.message);
      return;
    }

    await fetchAll();
  }

  async function moveToPessoal(tx: Tx) {
    const ok = window.confirm(
      `Transferir "${tx.description}" para o Financeiro Pessoal?`
    );

    if (!ok) return;

    setMovingTx(tx.id);

    const { error } = await supabase
      .from("financial_transactions")
      .update({ scope: "personal" })
      .eq("id", tx.id);

    setMovingTx(null);

    if (error) {
      alert("Erro: " + error.message);
      return;
    }

    await fetchAll();
  }

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  const txOfMonth = useMemo(() => {
    return transactions.filter((tx) => {
      const dateStr =
        tx.due_date ||
        tx.paid_at ||
        tx.competency_date;

      if (!dateStr) return false;

      const d = new Date(dateStr + "T12:00:00");

      return (
        d.getFullYear() === currentYear &&
        d.getMonth() === currentMonth
      );
    });
  }, [transactions, currentYear, currentMonth]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return txOfMonth.filter((tx) => {
      if (
        filterKind !== "all" &&
        tx.kind !== filterKind
      ) {
        return false;
      }

      if (
        filterStatus !== "all" &&
        tx.status !== filterStatus
      ) {
        return false;
      }

      if (!query) return true;

      return [
        tx.description,
        tx.counterparty_name ?? "",
        tx.notes ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    txOfMonth,
    q,
    filterKind,
    filterStatus,
  ]);

  const totals = useMemo(
    () => ({
      receitas: txOfMonth
        .filter((t) => t.kind === "income")
        .reduce(
          (s, t) => s + Number(t.amount ?? 0),
          0
        ),

      despesas: txOfMonth
        .filter((t) => t.kind === "expense")
        .reduce(
          (s, t) => s + Number(t.amount ?? 0),
          0
        ),
    }),
    [txOfMonth]
  );

  const availableCategories = useMemo(() => {
    return categories.filter((category) => {
      const type = String(category.type || "")
        .trim()
        .toLowerCase();

      if (newForm.kind === "income") {
        return (
          type === "income" ||
          type === "receita" ||
          type === "both" ||
          type === "all"
        );
      }

      return (
        type === "expense" ||
        type === "despesa" ||
        type === "both" ||
        type === "all"
      );
    });
  }, [categories, newForm.kind]);

  const card: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 14,
  };

  const btn: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "8px 14px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  };

  const btnActive: React.CSSProperties = {
    ...btn,
    border: "1px solid rgba(180,120,255,0.4)",
    background: "rgba(180,120,255,0.2)",
  };

  const btnPessoal: React.CSSProperties = {
    ...btn,
    border: "1px solid rgba(255,200,80,0.3)",
    background: "rgba(255,200,80,0.10)",
    color: "#ffc850",
    padding: "8px 14px",
  };

  const btnPrimary: React.CSSProperties = {
    background: "rgba(180,120,255,0.24)",
    color: "white",
    border: "1px solid rgba(180,120,255,0.48)",
    padding: "9px 16px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    color: "white",
    padding: "8px 10px",
    width: "100%",
    fontSize: 14,
    boxSizing: "border-box" as const,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 4,
    display: "block",
  };

  const modalBackdrop: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 999,
    background: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    overflowY: "auto",
  };

  const modalBox: React.CSSProperties = {
    background: "#1a1625",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 18,
    padding: 24,
    width: "100%",
    maxWidth: 560,
    maxHeight: "calc(100vh - 32px)",
    overflowY: "auto",
  };

  return (
    <div
      style={{
        color: "white",
        display: "grid",
        gap: 14,
      }}
    >
      {/* Modal novo lançamento */}

      {showNew && (
        <div style={modalBackdrop}>
          <div style={modalBox}>
            <div
              style={{
                fontWeight: 900,
                fontSize: 17,
                marginBottom: 4,
              }}
            >
              Novo lançamento
            </div>

            <div
              style={{
                fontSize: 12,
                opacity: 0.6,
                marginBottom: 20,
              }}
            >
              Financeiro da Clínica
            </div>

            <div
              style={{
                display: "grid",
                gap: 14,
              }}
            >
              <div>
                <label style={labelStyle}>
                  Tipo
                </label>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      changeNewKind("expense")
                    }
                    style={
                      newForm.kind === "expense"
                        ? {
                            ...btnActive,
                            color: "#ff9b9b",
                          }
                        : btn
                    }
                  >
                    Despesa
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      changeNewKind("income")
                    }
                    style={
                      newForm.kind === "income"
                        ? {
                            ...btnActive,
                            color: "#78ffb4",
                          }
                        : btn
                    }
                  >
                    Receita
                  </button>
                </div>
              </div>

              <div>
                <label style={labelStyle}>
                  Descrição *
                </label>

                <input
                  style={inputStyle}
                  placeholder={
                    newForm.kind === "expense"
                      ? "Ex.: Conta de energia"
                      : "Ex.: Venda de procedimento"
                  }
                  value={newForm.description}
                  onChange={(e) =>
                    setNewForm({
                      ...newForm,
                      description: e.target.value,
                    })
                  }
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 1fr) minmax(0, 1fr)",
                  gap: 10,
                }}
              >
                <div>
                  <label style={labelStyle}>
                    Valor (R$) *
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    style={inputStyle}
                    placeholder="0,00"
                    value={newForm.amount}
                    onChange={(e) =>
                      setNewForm({
                        ...newForm,
                        amount: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <label style={labelStyle}>
                    Data *
                  </label>

                  <input
                    type="date"
                    style={inputStyle}
                    value={newForm.due_date}
                    onChange={(e) =>
                      setNewForm({
                        ...newForm,
                        due_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>
                  Status *
                </label>

                <select
                  style={{
                    ...inputStyle,
                    cursor: "pointer",
                  }}
                  value={newForm.status}
                  onChange={(e) =>
                    setNewForm({
                      ...newForm,
                      status: e.target
                        .value as NewForm["status"],
                    })
                  }
                >
                  {newForm.kind === "expense" ? (
                    <>
                      <option value="paid">
                        Pago
                      </option>
                      <option value="pending">
                        Pendente
                      </option>
                      <option value="late">
                        Atrasado
                      </option>
                    </>
                  ) : (
                    <>
                      <option value="received">
                        Recebido
                      </option>
                      <option value="pending">
                        Pendente
                      </option>
                      <option value="late">
                        Atrasado
                      </option>
                    </>
                  )}
                </select>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 1fr) minmax(0, 1fr)",
                  gap: 10,
                }}
              >
                <div>
                  <label style={labelStyle}>
                    Categoria
                  </label>

                  <select
                    style={{
                      ...inputStyle,
                      cursor: "pointer",
                    }}
                    value={newForm.category_id}
                    onChange={(e) =>
                      setNewForm({
                        ...newForm,
                        category_id: e.target.value,
                      })
                    }
                  >
                    <option value="">
                      Sem categoria
                    </option>

                    {availableCategories.map(
                      (category) => (
                        <option
                          key={category.id}
                          value={category.id}
                        >
                          {category.name}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>
                    Conta
                  </label>

                  <select
                    style={{
                      ...inputStyle,
                      cursor: "pointer",
                    }}
                    value={newForm.account_id}
                    onChange={(e) =>
                      setNewForm({
                        ...newForm,
                        account_id: e.target.value,
                      })
                    }
                  >
                    <option value="">
                      Sem conta
                    </option>

                    {accounts.map((account) => (
                      <option
                        key={account.id}
                        value={account.id}
                      >
                        {account.name}
                        {account.bank_name
                          ? ` — ${account.bank_name}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>
                  Cliente / fornecedor
                </label>

                <input
                  style={inputStyle}
                  placeholder="Opcional"
                  value={newForm.counterparty_name}
                  onChange={(e) =>
                    setNewForm({
                      ...newForm,
                      counterparty_name:
                        e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Observações
                </label>

                <textarea
                  style={{
                    ...inputStyle,
                    minHeight: 90,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                  placeholder="Opcional"
                  value={newForm.notes}
                  onChange={(e) =>
                    setNewForm({
                      ...newForm,
                      notes: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                marginTop: 22,
              }}
            >
              <button
                onClick={closeNew}
                disabled={newSaving}
                style={{
                  ...btn,
                  opacity: newSaving ? 0.5 : 1,
                }}
              >
                Cancelar
              </button>

              <button
                onClick={saveNew}
                disabled={newSaving}
                style={{
                  ...btnPrimary,
                  opacity: newSaving ? 0.6 : 1,
                }}
              >
                {newSaving
                  ? "Salvando..."
                  : "Salvar lançamento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal edição */}

      {editTx && editForm && (
        <div style={modalBackdrop}>
          <div
            style={{
              ...modalBox,
              maxWidth: 420,
            }}
          >
            <div
              style={{
                fontWeight: 900,
                fontSize: 16,
                marginBottom: 18,
              }}
            >
              Editar lançamento
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle}>
                  Descrição
                </label>

                <input
                  style={inputStyle}
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      description: e.target.value,
                    })
                  }
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div>
                  <label style={labelStyle}>
                    Valor (R$)
                  </label>

                  <input
                    type="number"
                    step="0.01"
                    style={inputStyle}
                    value={editForm.amount}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        amount: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <label style={labelStyle}>
                    Data
                  </label>

                  <input
                    type="date"
                    style={inputStyle}
                    value={editForm.due_date}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        due_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div>
                  <label style={labelStyle}>
                    Tipo
                  </label>

                  <select
                    style={{
                      ...inputStyle,
                      cursor: "pointer",
                    }}
                    value={editForm.kind}
                    onChange={(e) => {
                      const kind = e.target.value;

                      let status = editForm.status;

                      if (
                        kind === "income" &&
                        status === "paid"
                      ) {
                        status = "received";
                      }

                      if (
                        kind === "expense" &&
                        status === "received"
                      ) {
                        status = "paid";
                      }

                      setEditForm({
                        ...editForm,
                        kind,
                        status,
                      });
                    }}
                  >
                    <option value="expense">
                      Despesa
                    </option>

                    <option value="income">
                      Receita
                    </option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>
                    Status
                  </label>

                  <select
                    style={{
                      ...inputStyle,
                      cursor: "pointer",
                    }}
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        status: e.target.value,
                      })
                    }
                  >
                    {editForm.kind === "expense" ? (
                      <>
                        <option value="paid">
                          Pago
                        </option>
                        <option value="pending">
                          Pendente
                        </option>
                        <option value="late">
                          Atrasado
                        </option>
                      </>
                    ) : (
                      <>
                        <option value="received">
                          Recebido
                        </option>
                        <option value="pending">
                          Pendente
                        </option>
                        <option value="late">
                          Atrasado
                        </option>
                      </>
                    )}
                  </select>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                marginTop: 20,
              }}
            >
              <button
                onClick={() => {
                  setEditTx(null);
                  setEditForm(null);
                }}
                style={btn}
              >
                Cancelar
              </button>

              <button
                onClick={saveEdit}
                disabled={editSaving}
                style={{
                  ...btnPrimary,
                  opacity: editSaving ? 0.6 : 1,
                }}
              >
                {editSaving
                  ? "Salvando..."
                  : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 950,
            }}
          >
            Lançamentos — Clínica
          </div>

          <div
            style={{
              fontSize: 12,
              opacity: 0.6,
              marginTop: 2,
            }}
          >
            {MONTH_NAMES[currentMonth]} de{" "}
            {currentYear}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={openNew}
            style={btnPrimary}
          >
            + Novo lançamento
          </button>

          <button
            onClick={prevMonth}
            style={btn}
          >
            Anterior
          </button>

          <button
            onClick={() => {
              setCurrentYear(today.getFullYear());
              setCurrentMonth(today.getMonth());
            }}
            style={btn}
          >
            Hoje
          </button>

          <button
            onClick={nextMonth}
            style={btn}
          >
            Próximo
          </button>

          <button
            onClick={() => router.back()}
            style={btn}
          >
            Voltar
          </button>
        </div>
      </div>

      {/* Totais */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
        }}
      >
        <div style={card}>
          <div
            style={{
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            Receitas
          </div>

          <div
            style={{
              fontSize: 20,
              fontWeight: 950,
              color: "#78ffb4",
              marginTop: 4,
            }}
          >
            {formatBRL(totals.receitas)}
          </div>
        </div>

        <div style={card}>
          <div
            style={{
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            Despesas
          </div>

          <div
            style={{
              fontSize: 20,
              fontWeight: 950,
              color: "#ff8080",
              marginTop: 4,
            }}
          >
            {formatBRL(totals.despesas)}
          </div>
        </div>

        <div style={card}>
          <div
            style={{
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            Resultado
          </div>

          <div
            style={{
              fontSize: 20,
              fontWeight: 950,
              color:
                totals.receitas -
                  totals.despesas >=
                0
                  ? "#78ffb4"
                  : "#ff8080",
              marginTop: 4,
            }}
          >
            {formatBRL(
              totals.receitas - totals.despesas
            )}
          </div>
        </div>
      </div>

      {/* Filtros */}

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <input
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "white",
            border:
              "1px solid rgba(255,255,255,0.12)",
            padding: "8px 12px",
            borderRadius: 10,
            outline: "none",
            minWidth: 220,
          }}
          placeholder="Buscar descrição..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {(
          [
            "all",
            "income",
            "expense",
          ] as const
        ).map((v) => (
          <button
            key={v}
            onClick={() => setFilterKind(v)}
            style={
              filterKind === v
                ? btnActive
                : btn
            }
          >
            {v === "all"
              ? "Todos tipos"
              : v === "income"
              ? "Receitas"
              : "Despesas"}
          </button>
        ))}

        {(
          [
            "all",
            "paid",
            "received",
            "pending",
            "late",
          ] as const
        ).map((v) => (
          <button
            key={v}
            onClick={() => setFilterStatus(v)}
            style={
              filterStatus === v
                ? btnActive
                : btn
            }
          >
            {v === "all"
              ? "Todos status"
              : v === "paid"
              ? "Pago"
              : v === "received"
              ? "Recebido"
              : v === "pending"
              ? "Pendente"
              : "Atrasado"}
          </button>
        ))}

        <button
          onClick={() => {
            setQ("");
            setFilterKind("all");
            setFilterStatus("all");
          }}
          style={btn}
        >
          Limpar
        </button>
      </div>

      {loading && (
        <div style={{ opacity: 0.7 }}>
          Carregando...
        </div>
      )}

      {/* Lista */}

      <div
        style={{
          display: "grid",
          gap: 8,
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ opacity: 0.7 }}>
            Nenhum lançamento encontrado.
          </div>
        ) : (
          filtered.map((tx) => (
            <div
              key={tx.id}
              style={{
                border:
                  "1px solid rgba(255,255,255,0.10)",
                borderRadius: 12,
                padding: "12px 14px",
                background:
                  "rgba(255,255,255,0.03)",
                display: "grid",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gap: 3,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 900,
                    }}
                  >
                    {tx.description}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.7,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      {tx.due_date ??
                        tx.paid_at ??
                        "—"}
                    </span>

                    {tx.counterparty_name && (
                      <span>
                        • {tx.counterparty_name}
                      </span>
                    )}

                    <span
                      style={{
                        padding: "1px 6px",
                        borderRadius: 999,
                        background:
                          "rgba(255,255,255,0.06)",
                        fontSize: 11,
                      }}
                    >
                      {tx.status === "paid"
                        ? "Pago"
                        : tx.status ===
                          "received"
                        ? "Recebido"
                        : tx.status ===
                          "pending"
                        ? "Pendente"
                        : tx.status ===
                          "late"
                        ? "Atrasado"
                        : tx.status}
                    </span>

                    <span
                      style={{
                        padding: "1px 6px",
                        borderRadius: 999,
                        background:
                          tx.kind === "income"
                            ? "rgba(120,255,180,0.1)"
                            : "rgba(255,120,120,0.1)",
                        fontSize: 11,
                        color:
                          tx.kind === "income"
                            ? "#78ffb4"
                            : "#ff8080",
                      }}
                    >
                      {tx.kind === "income"
                        ? "Receita"
                        : "Despesa"}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 15,
                      color:
                        tx.kind === "income"
                          ? "#78ffb4"
                          : "#ff8080",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tx.kind === "expense"
                      ? "-"
                      : ""}
                    {formatBRL(tx.amount)}
                  </div>

                  <button
                    onClick={() => openEdit(tx)}
                    style={btn}
                  >
                    Editar
                  </button>

                  <button
                    onClick={() =>
                      moveToPessoal(tx)
                    }
                    disabled={
                      movingTx === tx.id
                    }
                    style={{
                      ...btnPessoal,
                      opacity:
                        movingTx === tx.id
                          ? 0.5
                          : 1,
                    }}
                  >
                    {movingTx === tx.id
                      ? "..."
                      : "Transferir"}
                  </button>

                  <button
                    onClick={() =>
                      setDeletingTx(tx.id)
                    }
                    style={{
                      ...btn,
                      background:
                        "rgba(255,80,80,0.10)",
                      border:
                        "1px solid rgba(255,80,80,0.25)",
                      color: "#ff8080",
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </div>

              {deletingTx === tx.id && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      opacity: 0.8,
                    }}
                  >
                    Confirmar exclusão?
                  </span>

                  <button
                    onClick={() => deleteTx(tx)}
                    style={{
                      ...btn,
                      background:
                        "rgba(255,80,80,0.2)",
                      border:
                        "1px solid rgba(255,80,80,0.4)",
                      color: "#ff8080",
                    }}
                  >
                    Sim, excluir
                  </button>

                  <button
                    onClick={() =>
                      setDeletingTx(null)
                    }
                    style={btn}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}