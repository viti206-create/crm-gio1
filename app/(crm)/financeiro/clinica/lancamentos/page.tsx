"use client";



import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";

import SelectDark from "../../../_components/SelectDark";



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

  installment_number: number | null;

  installment_total: number | null;

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

  kind: "income" | "expense";

  description: string;

  amount: string;

  due_date: string;

  status: "pending" | "paid" | "received" | "late";

  category_name: string;

  account_id: string;

  counterparty_name: string;

  notes: string;

};



type NewForm = {

  kind: "income" | "expense";

  description: string;

  amount: string;

  due_date: string;

  status: "pending" | "paid" | "received" | "late";

  category_name: string;

  account_id: string;

  counterparty_name: string;

  notes: string;

  is_installment: boolean;

  installments: number;

};



function formatBRL(v: number | null | undefined) {

  const n = Number(v ?? 0);



  if (!Number.isFinite(n)) return "R$ 0,00";



  return n.toLocaleString("pt-BR", {

    style: "currency",

    currency: "BRL",

  });

}



function parseMoneyInput(value: string) {

  let normalized = value

    .trim()

    .replace(/\s/g, "")

    .replace(/R\$/gi, "");



  if (!normalized) return NaN;



  if (normalized.includes(",")) {

    normalized = normalized.replace(/\./g, "").replace(",", ".");

  } else {

    const dotCount = (normalized.match(/\./g) ?? []).length;

    if (dotCount > 1) {

      const parts = normalized.split(".");

      const decimal = parts.pop() ?? "";

      normalized = `${parts.join("")}.${decimal}`;

    }

  }



  return Number(normalized);

}



function formatMoneyInput(value: number | null | undefined) {

  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) return "";

  return amount.toLocaleString("pt-BR", {

    minimumFractionDigits: 2,

    maximumFractionDigits: 2,

  });

}



function todayYMD() {

  const now = new Date();



  const y = now.getFullYear();

  const m = String(now.getMonth() + 1).padStart(2, "0");

  const d = String(now.getDate()).padStart(2, "0");



  return `${y}-${m}-${d}`;

}



function addMonthsToYMD(value: string, monthsToAdd: number) {

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) return value;

  const targetMonthIndex = month - 1 + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex =
    ((targetMonthIndex % 12) + 12) % 12;

  const lastDay = new Date(
    targetYear,
    normalizedMonthIndex + 1,
    0
  ).getDate();

  const safeDay = Math.min(day, lastDay);

  return `${targetYear}-${String(normalizedMonthIndex + 1).padStart(
    2,
    "0"
  )}-${String(safeDay).padStart(2, "0")}`;

}



function formatInstallmentLabel(
  current: number | null | undefined,
  total: number | null | undefined
) {

  const currentNumber = Number(current ?? 0);
  const totalNumber = Number(total ?? 0);

  if (currentNumber <= 0 || totalNumber <= 0) return null;

  const width = Math.max(2, String(totalNumber).length);

  return `${String(currentNumber).padStart(width, "0")}/${String(
    totalNumber
  ).padStart(width, "0")}`;

}



function emptyNewForm(): NewForm {

  return {

    kind: "expense",

    description: "",

    amount: "",

    due_date: todayYMD(),

    status: "pending",

    category_name: "",

    account_id: "",

    counterparty_name: "",

    notes: "",

    is_installment: false,

    installments: 2,

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

        category_name: "",

      };

    });

  }



  async function resolveCategoryIdByName(
    rawName: string,
    currentKind: "income" | "expense"
  ) {

    const name = rawName.trim();

    if (!name) return null;

    const normalized = name.toLocaleLowerCase("pt-BR");

    const existing = categories.find(
      (category) =>
        category.name.trim().toLocaleLowerCase("pt-BR") === normalized
    );

    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("financial_categories")
      .insert({
        scope: "clinic",
        name,
        type: currentKind,
        is_active: true,
        sort_order: 0,
      })
      .select(
        "id, scope, name, type, parent_id, color, sort_order, is_active"
      )
      .single();

    if (error) {
      throw new Error(
        "Não foi possível criar a categoria: " + error.message
      );
    }

    const created = data as FinancialCategory;

    setCategories((current) =>
      [...current, created].sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR")
      )
    );

    return created.id;

  }



  async function saveNew() {

    const description = newForm.description.trim();

    if (!description) {
      alert("Informe a descrição do lançamento.");
      return;
    }

    const amount = parseMoneyInput(newForm.amount);

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

    const installmentTotal = newForm.is_installment
      ? Math.floor(Number(newForm.installments))
      : 1;

    if (
      newForm.is_installment &&
      (!Number.isFinite(installmentTotal) ||
        installmentTotal < 2 ||
        installmentTotal > 120)
    ) {
      alert("Informe entre 2 e 120 boletos/parcelas.");
      return;
    }

    setNewSaving(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(
          "Não foi possível identificar o usuário autenticado."
        );
      }

      const categoryId = await resolveCategoryIdByName(
        newForm.category_name,
        newForm.kind
      );

      const rows = Array.from(
        { length: installmentTotal },
        (_, index) => {
          const dueDate = addMonthsToYMD(
            newForm.due_date,
            index
          );

          const isFirst = index === 0;

          const rowStatus =
            isFirst || !newForm.is_installment
              ? newForm.status
              : "pending";

          const isCompleted =
            rowStatus === "paid" ||
            rowStatus === "received";

          return {
            scope: "clinic",
            kind: newForm.kind,
            status: rowStatus,
            description,
            amount,
            gross_amount: null,
            net_amount: null,
            fee_amount: null,
            fee_percent: null,
            due_date: dueDate,
            paid_at: isCompleted ? dueDate : null,
            competency_date: dueDate,
            account_id: newForm.account_id || null,
            category_id: categoryId,
            card_id: null,
            counterparty_name:
              newForm.counterparty_name.trim() || null,
            reference_code: null,
            source_type: "manual",
            source_id: null,
            installment_number: newForm.is_installment
              ? index + 1
              : null,
            installment_total: newForm.is_installment
              ? installmentTotal
              : null,
            is_future: newForm.is_installment
              ? index > 0
              : false,
            created_by: user.id,
            import_source: null,
            import_file_name: null,
            import_batch_id: null,
            external_import_key: null,
            import_note: null,
            notes: newForm.notes.trim() || null,
          };
        }
      );

      const { error } = await supabase
        .from("financial_transactions")
        .insert(rows);

      if (error) {
        throw new Error(
          "Erro ao criar lançamento: " + error.message
        );
      }

      const selectedDate = new Date(
        newForm.due_date + "T12:00:00"
      );

      setCurrentYear(selectedDate.getFullYear());
      setCurrentMonth(selectedDate.getMonth());

      setShowNew(false);
      setNewForm(emptyNewForm());

      await fetchAll();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao criar lançamento.";

      alert(message);
    } finally {
      setNewSaving(false);
    }

  }



  function openEdit(tx: Tx) {

    setEditTx(tx);



    setEditForm({

      kind: tx.kind === "income" ? "income" : "expense",

      description: tx.description ?? "",

      amount: formatMoneyInput(tx.amount),

      due_date: tx.due_date ?? tx.paid_at ?? "",

      status:

        tx.status === "paid" ||

        tx.status === "received" ||

        tx.status === "late" ||

        tx.status === "pending"

          ? tx.status

          : "pending",

      category_name:
        categories.find(
          (category) => category.id === tx.category_id
        )?.name ?? "",

      account_id: tx.account_id ?? "",

      counterparty_name: tx.counterparty_name ?? "",

      notes: tx.notes ?? "",

    });

  }



  async function saveEdit() {

    if (!editTx || !editForm) return;



    const description = editForm.description.trim();



    if (!description) {

      alert("Informe a descrição.");

      return;

    }



    const amount = parseMoneyInput(editForm.amount);



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



    let categoryId: string | null = null;

    try {

      categoryId = await resolveCategoryIdByName(
        editForm.category_name,
        editForm.kind
      );

    } catch (error) {

      setEditSaving(false);

      alert(
        error instanceof Error
          ? error.message
          : "Erro ao salvar categoria."
      );

      return;

    }



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

        category_id: categoryId,

        account_id: editForm.account_id || null,

        counterparty_name: editForm.counterparty_name.trim() || null,

        notes: editForm.notes.trim() || null,

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



  const availableEditCategories = useMemo(() => {

    if (!editForm) return [];



    return categories.filter((category) => {

      const type = String(category.type || "")

        .trim()

        .toLowerCase();



      if (editForm.kind === "income") {

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

  }, [categories, editForm]);



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



  const selectStyle: React.CSSProperties = {

    ...inputStyle,

    cursor: "pointer",

    background: "#292532",

    color: "white",

    colorScheme: "dark",

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

                    {newForm.is_installment
                      ? "Valor de cada boleto (R$) *"
                      : "Valor (R$) *"}

                  </label>



                  <input

                    type="text"

                    inputMode="decimal"

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

                  style={selectStyle}

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

                      <option value="pending">

                        Em aberto

                      </option>

                      <option value="paid">

                        Pago

                      </option>

                      <option value="late">

                        Atrasado

                      </option>

                    </>

                  ) : (

                    <>

                      <option value="pending">

                        Em aberto

                      </option>

                      <option value="received">

                        Recebido

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
                  border: "1px solid rgba(180,120,255,0.22)",
                  background: "rgba(180,120,255,0.07)",
                  borderRadius: 12,
                  padding: 12,
                  display: "grid",
                  gap: 10,
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newForm.is_installment}
                    onChange={(e) =>
                      setNewForm({
                        ...newForm,
                        is_installment: e.target.checked,
                      })
                    }
                  />
                  Gerar boletos / parcelas mensais
                </label>

                {newForm.is_installment && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(0, 180px) minmax(0, 1fr)",
                      gap: 10,
                      alignItems: "end",
                    }}
                  >
                    <div>
                      <label style={labelStyle}>
                        Número de boletos
                      </label>
                      <input
                        type="number"
                        min={2}
                        max={120}
                        step={1}
                        style={inputStyle}
                        value={newForm.installments}
                        onChange={(e) =>
                          setNewForm({
                            ...newForm,
                            installments: Math.max(
                              2,
                              Number(e.target.value || 2)
                            ),
                          })
                        }
                      />
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.78,
                        lineHeight: 1.5,
                      }}
                    >
                      O valor informado será o valor de cada boleto.
                      A data escolhida será o vencimento do primeiro;
                      os demais serão gerados mês a mês.
                    </div>
                  </div>
                )}
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

                  <input
                    type="text"
                    list="clinic-new-categories"
                    style={inputStyle}
                    placeholder="Digite ou escolha uma categoria"
                    value={newForm.category_name}
                    onChange={(e) =>
                      setNewForm({
                        ...newForm,
                        category_name: e.target.value,
                      })
                    }
                  />

                  <datalist id="clinic-new-categories">
                    {availableCategories.map((category) => (
                      <option
                        key={category.id}
                        value={category.name}
                      />
                    ))}
                  </datalist>

                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.6,
                      marginTop: 5,
                    }}
                  >
                    Se a categoria não existir, ela será criada ao salvar.
                  </div>

                </div>



                <div>

                  <label style={labelStyle}>

                    Conta

                  </label>



                  <SelectDark

                    value={newForm.account_id}

                    onChange={(value) =>

                      setNewForm({

                        ...newForm,

                        account_id: value,

                      })

                    }

                    searchable

                    options={[

                      { value: "", label: "Sem conta" },

                      ...accounts.map((account) => ({

                        value: account.id,

                        label: account.bank_name

                          ? `${account.name} — ${account.bank_name}`

                          : account.name,

                      })),

                    ]}

                  />

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
          <div style={modalBox}>
            <div
              style={{
                fontWeight: 900,
                fontSize: 17,
                marginBottom: 4,
              }}
            >
              Editar lançamento
            </div>

            <div
              style={{
                fontSize: 12,
                opacity: 0.6,
                marginBottom: 20,
              }}
            >
              Consulte e altere todos os dados do lançamento
              {formatInstallmentLabel(
                editTx.installment_number,
                editTx.installment_total
              ) && (
                <span
                  style={{
                    marginLeft: 8,
                    color: "#d7b7ff",
                    fontWeight: 900,
                  }}
                >
                  • Boleto{" "}
                  {formatInstallmentLabel(
                    editTx.installment_number,
                    editTx.installment_total
                  )}
                </span>
              )}
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={labelStyle}>Tipo</label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const kind = "expense" as const;
                      let status = editForm.status;
                      if (status === "received") status = "paid";
                      setEditForm({
                        ...editForm,
                        kind,
                        status,
                        category_name: "",
                      });
                    }}
                    style={
                      editForm.kind === "expense"
                        ? { ...btnActive, color: "#ff9b9b" }
                        : btn
                    }
                  >
                    Despesa
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const kind = "income" as const;
                      let status = editForm.status;
                      if (status === "paid") status = "received";
                      setEditForm({
                        ...editForm,
                        kind,
                        status,
                        category_name: "",
                      });
                    }}
                    style={
                      editForm.kind === "income"
                        ? { ...btnActive, color: "#78ffb4" }
                        : btn
                    }
                  >
                    Receita
                  </button>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Descrição *</label>
                <input
                  style={inputStyle}
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                  gap: 10,
                }}
              >
                <div>
                  <label style={labelStyle}>Valor (R$) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    style={inputStyle}
                    placeholder="0,00"
                    value={editForm.amount}
                    onChange={(e) =>
                      setEditForm({ ...editForm, amount: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label style={labelStyle}>Data *</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={editForm.due_date}
                    onChange={(e) =>
                      setEditForm({ ...editForm, due_date: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Status *</label>
                <select
                  style={selectStyle}
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      status: e.target.value as EditForm["status"],
                    })
                  }
                >
                  {editForm.kind === "expense" ? (
                    <>
                      <option value="pending">Em aberto</option>
                      <option value="paid">Pago</option>
                      <option value="late">Atrasado</option>
                    </>
                  ) : (
                    <>
                      <option value="pending">Em aberto</option>
                      <option value="received">Recebido</option>
                      <option value="late">Atrasado</option>
                    </>
                  )}
                </select>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                  gap: 10,
                }}
              >
                <div>
                  <label style={labelStyle}>Categoria</label>
                  <input
                    type="text"
                    list="clinic-edit-categories"
                    style={inputStyle}
                    placeholder="Digite ou escolha uma categoria"
                    value={editForm.category_name}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        category_name: e.target.value,
                      })
                    }
                  />
                  <datalist id="clinic-edit-categories">
                    {availableEditCategories.map((category) => (
                      <option
                        key={category.id}
                        value={category.name}
                      />
                    ))}
                  </datalist>
                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.6,
                      marginTop: 5,
                    }}
                  >
                    Se a categoria não existir, ela será criada ao salvar.
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Conta</label>
                  <SelectDark
                    value={editForm.account_id}
                    onChange={(value) =>
                      setEditForm({ ...editForm, account_id: value })
                    }
                    searchable
                    options={[
                      { value: "", label: "Sem conta" },
                      ...accounts.map((account) => ({
                        value: account.id,
                        label: account.bank_name
                          ? `${account.name} — ${account.bank_name}`
                          : account.name,
                      })),
                    ]}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Cliente / fornecedor</label>
                <input
                  style={inputStyle}
                  placeholder="Opcional"
                  value={editForm.counterparty_name}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      counterparty_name: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label style={labelStyle}>Observações</label>
                <textarea
                  style={{
                    ...inputStyle,
                    minHeight: 90,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                  placeholder="Opcional"
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm({ ...editForm, notes: e.target.value })
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
                onClick={() => {
                  if (editSaving) return;
                  setEditTx(null);
                  setEditForm(null);
                }}
                disabled={editSaving}
                style={{ ...btn, opacity: editSaving ? 0.5 : 1 }}
              >
                Cancelar
              </button>

              <button
                onClick={saveEdit}
                disabled={editSaving}
                style={{ ...btnPrimary, opacity: editSaving ? 0.6 : 1 }}
              >
                {editSaving ? "Salvando..." : "Salvar alterações"}
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

              ? "Em aberto"

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



                    {formatInstallmentLabel(
                      tx.installment_number,
                      tx.installment_total
                    ) && (
                      <span
                        style={{
                          padding: "1px 7px",
                          borderRadius: 999,
                          background: "rgba(180,120,255,0.14)",
                          border: "1px solid rgba(180,120,255,0.28)",
                          color: "#d7b7ff",
                          fontSize: 11,
                          fontWeight: 900,
                        }}
                      >
                        Boleto{" "}
                        {formatInstallmentLabel(
                          tx.installment_number,
                          tx.installment_total
                        )}
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

                        ? "Em aberto"

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