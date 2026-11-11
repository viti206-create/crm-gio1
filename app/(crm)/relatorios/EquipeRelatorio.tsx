"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type PeriodMode = "today" | "monthly" | "yearly" | "custom";

type ProfileRow = {
  id: string;
  name: string | null;
  role: string | null;
};

type TeamActivityRow = {
  activity_id: string;
  event_at: string;
  user_id: string | null;
  user_name: string;
  lead_id: string | null;
  lead_name: string;
  activity_type: string;
  from_stage_name: string | null;
  to_stage_name: string | null;
  next_action_type: string | null;
  next_action_at: string | null;
};

type UserSummary = {
  userId: string;
  userName: string;
  activities: number;
  created: number;
  negotiation: number;
  scheduled: number;
  attended: number;
  closed: number;
  lost: number;
  nextActions: number;
};

function dateInputValue(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isStage(row: TeamActivityRow, names: string[]) {
  if (row.activity_type !== "stage_changed") return false;
  const target = normalize(row.to_stage_name);
  return names.some((name) => target === normalize(name));
}

function actionDescription(row: TeamActivityRow) {
  if (row.activity_type === "created") {
    return "Criou o contato";
  }

  if (row.activity_type === "stage_changed") {
    return `${row.from_stage_name || "Etapa anterior"} → ${
      row.to_stage_name || "Nova etapa"
    }`;
  }

  if (row.activity_type === "next_action_set") {
    const action = row.next_action_type || "Próxima ação";
    const when = row.next_action_at ? ` • ${formatDateTime(row.next_action_at)}` : "";
    return `${action}${when}`;
  }

  const labels: Record<string, string> = {
    note: "Adicionou observação",
    note_added: "Adicionou observação",
    contact_whatsapp: "Registrou contato por WhatsApp",
    contact_call: "Registrou ligação",
    contact_instagram: "Registrou contato por Instagram",
    proposal_sent: "Registrou proposta enviada",
    sale_closed: "Registrou venda fechada",
    lost_set: "Marcou como perdido",
    appointment_set: "Definiu agendamento",
    updated: "Atualizou o contato",
  };

  return labels[row.activity_type] ?? row.activity_type;
}

function periodBounds(
  mode: PeriodMode,
  year: number,
  month: number,
  customFrom: string,
  customTo: string
) {
  const now = new Date();

  if (mode === "today") {
    const today = dateInputValue(now);
    return { from: today, to: today, label: "Hoje" };
  }

  if (mode === "yearly") {
    return {
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      label: `Ano ${year}`,
    };
  }

  if (mode === "custom") {
    return {
      from: customFrom,
      to: customTo,
      label:
        customFrom && customTo
          ? `${customFrom.split("-").reverse().join("/")} a ${customTo
              .split("-")
              .reverse()
              .join("/")}`
          : "Personalizado",
    };
  }

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  return {
    from: dateInputValue(first),
    to: dateInputValue(last),
    label: `${String(month + 1).padStart(2, "0")}/${year}`,
  };
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active
          ? "rgba(180,120,255,0.24)"
          : "rgba(255,255,255,0.05)",
        color: "white",
        border: active
          ? "1px solid rgba(180,120,255,0.55)"
          : "1px solid rgba(255,255,255,0.12)",
        padding: "9px 12px",
        borderRadius: 11,
        cursor: "pointer",
        fontWeight: 900,
        fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}

export default function EquipeRelatorio() {
  const now = useMemo(() => new Date(), []);

  const [mode, setMode] = useState<PeriodMode>("monthly");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [customFrom, setCustomFrom] = useState(
    dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1))
  );
  const [customTo, setCustomTo] = useState(dateInputValue(now));
  const [selectedUser, setSelectedUser] = useState("all");

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [rows, setRows] = useState<TeamActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bounds = useMemo(
    () => periodBounds(mode, year, month, customFrom, customTo),
    [mode, year, month, customFrom, customTo]
  );

  const years = useMemo(() => {
    const current = now.getFullYear();
    return Array.from({ length: 5 }, (_, index) => current - index);
  }, [now]);

  const monthLabels = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];

  const loadProfiles = useCallback(async () => {
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("id,name,role")
      .order("name", { ascending: true });

    if (profileError) {
      console.error("Erro ao carregar usuários:", profileError);
      return;
    }

    setProfiles((data ?? []) as ProfileRow[]);
  }, []);

  const loadReport = useCallback(async () => {
    if (!bounds.from || !bounds.to) return;

    if (bounds.from > bounds.to) {
      setError("A data inicial não pode ser maior que a data final.");
      setRows([]);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: reportError } = await supabase.rpc(
      "team_activity_report",
      {
        p_from: bounds.from,
        p_to: bounds.to,
        p_user_id: selectedUser === "all" ? null : selectedUser,
      }
    );

    if (reportError) {
      console.error("Erro no relatório da equipe:", reportError);
      setError(
        `Relatório da equipe não carregou: ${reportError.message}`
      );
      setRows([]);
    } else {
      setRows((data ?? []) as TeamActivityRow[]);
    }

    setLoading(false);
  }, [bounds.from, bounds.to, selectedUser]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const summary = useMemo(() => {
    return {
      activities: rows.length,
      created: rows.filter((row) => row.activity_type === "created").length,
      negotiation: rows.filter((row) =>
        isStage(row, ["Em negociação", "Em negociacao"])
      ).length,
      scheduled: rows.filter((row) => isStage(row, ["Agendado"])).length,
      attended: rows.filter((row) => isStage(row, ["Compareceu"])).length,
      closed: rows.filter((row) => isStage(row, ["Fechado"])).length,
      lost: rows.filter((row) => isStage(row, ["Perdido"])).length,
      nextActions: rows.filter((row) => row.activity_type === "next_action_set")
        .length,
    };
  }, [rows]);

  const byUser = useMemo<UserSummary[]>(() => {
    const map = new Map<string, UserSummary>();

    for (const row of rows) {
      const userId = row.user_id ?? "system";
      const userName = row.user_name || "Sistema";

      if (!map.has(userId)) {
        map.set(userId, {
          userId,
          userName,
          activities: 0,
          created: 0,
          negotiation: 0,
          scheduled: 0,
          attended: 0,
          closed: 0,
          lost: 0,
          nextActions: 0,
        });
      }

      const item = map.get(userId)!;
      item.activities += 1;

      if (row.activity_type === "created") item.created += 1;
      if (isStage(row, ["Em negociação", "Em negociacao"]))
        item.negotiation += 1;
      if (isStage(row, ["Agendado"])) item.scheduled += 1;
      if (isStage(row, ["Compareceu"])) item.attended += 1;
      if (isStage(row, ["Fechado"])) item.closed += 1;
      if (isStage(row, ["Perdido"])) item.lost += 1;
      if (row.activity_type === "next_action_set") item.nextActions += 1;
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        b.closed - a.closed ||
        b.scheduled - a.scheduled ||
        b.created - a.created ||
        b.activities - a.activities
    );
  }, [rows]);

  const card: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 14,
  };

  const miniCard: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
    borderRadius: 14,
    padding: 14,
  };

  const input: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "9px 10px",
    borderRadius: 11,
    fontWeight: 700,
  };

  const th: React.CSSProperties = {
    textAlign: "left",
    fontSize: 12,
    opacity: 0.82,
    fontWeight: 900,
    padding: 11,
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: 11,
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    fontSize: 13,
    verticalAlign: "top",
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-start",
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 950 }}>
              Equipe • Atividades e produtividade
            </div>
            <div style={{ marginTop: 5, fontSize: 12, opacity: 0.72 }}>
              Auditoria administrativa de criação de contatos, movimentações do
              funil e próximas ações.
            </div>
          </div>

          <span
            style={{
              border: "1px solid rgba(180,120,255,0.35)",
              background: "rgba(180,120,255,0.12)",
              padding: "5px 9px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            Período: {bounds.label}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {(
            [
              ["today", "Hoje"],
              ["monthly", "Mensal"],
              ["yearly", "Anual"],
              ["custom", "Personalizado"],
            ] as const
          ).map(([value, label]) => (
            <FilterButton
              key={value}
              active={mode === value}
              onClick={() => setMode(value)}
            >
              {label}
            </FilterButton>
          ))}

          {(mode === "monthly" || mode === "yearly") && (
            <select
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              style={input}
            >
              {years.map((value) => (
                <option key={value} value={value} style={{ color: "black" }}>
                  {value}
                </option>
              ))}
            </select>
          )}

          {mode === "monthly" && (
            <select
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              style={input}
            >
              {monthLabels.map((label, index) => (
                <option key={label} value={index} style={{ color: "black" }}>
                  {label}
                </option>
              ))}
            </select>
          )}

          {mode === "custom" && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
                style={input}
              />
              <input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                style={input}
              />
            </>
          )}

          <select
            value={selectedUser}
            onChange={(event) => setSelectedUser(event.target.value)}
            style={{ ...input, minWidth: 190 }}
          >
            <option value="all" style={{ color: "black" }}>
              Todos os usuários
            </option>
            {profiles.map((profile) => (
              <option
                key={profile.id}
                value={profile.id}
                style={{ color: "black" }}
              >
                {profile.name?.trim() || profile.id}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void loadReport()}
            style={{
              ...input,
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            Atualizar
          </button>
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              border: "1px solid rgba(255,120,120,0.30)",
              background: "rgba(255,120,120,0.08)",
              borderRadius: 12,
              padding: 10,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
          gap: 10,
        }}
      >
        {[
          ["Atividades", summary.activities],
          ["Contatos criados", summary.created],
          ["Negociação", summary.negotiation],
          ["Agendados", summary.scheduled],
          ["Compareceram", summary.attended],
          ["Fechados", summary.closed],
          ["Perdidos", summary.lost],
          ["Próximas ações", summary.nextActions],
        ].map(([label, value]) => (
          <div key={String(label)} style={miniCard}>
            <div style={{ fontSize: 12, opacity: 0.72 }}>{label}</div>
            <div style={{ fontSize: 25, fontWeight: 950, marginTop: 5 }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 950, marginBottom: 10 }}>
          Resumo por usuário
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
            }}
          >
            <thead>
              <tr>
                <th style={th}>Usuário</th>
                <th style={th}>Atividades</th>
                <th style={th}>Criados</th>
                <th style={th}>Negociação</th>
                <th style={th}>Agendados</th>
                <th style={th}>Compareceram</th>
                <th style={th}>Fechados</th>
                <th style={th}>Perdidos</th>
                <th style={th}>Próx. ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td style={td} colSpan={9}>
                    Carregando...
                  </td>
                </tr>
              ) : byUser.length === 0 ? (
                <tr>
                  <td style={td} colSpan={9}>
                    Nenhuma atividade encontrada neste período.
                  </td>
                </tr>
              ) : (
                byUser.map((user) => (
                  <tr key={user.userId}>
                    <td style={td}>
                      <b>{user.userName}</b>
                    </td>
                    <td style={td}>{user.activities}</td>
                    <td style={td}>{user.created}</td>
                    <td style={td}>{user.negotiation}</td>
                    <td style={td}>{user.scheduled}</td>
                    <td style={td}>{user.attended}</td>
                    <td style={td}>
                      <b>{user.closed}</b>
                    </td>
                    <td style={td}>{user.lost}</td>
                    <td style={td}>{user.nextActions}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 950, marginBottom: 10 }}>
          Histórico detalhado
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
            }}
          >
            <thead>
              <tr>
                <th style={th}>Data / hora</th>
                <th style={th}>Usuário</th>
                <th style={th}>Cliente</th>
                <th style={th}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td style={td} colSpan={4}>
                    Carregando...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td style={td} colSpan={4}>
                    Nenhuma atividade encontrada.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.activity_id}>
                    <td style={td}>{formatDateTime(row.event_at)}</td>
                    <td style={td}>
                      <b>{row.user_name || "Sistema"}</b>
                    </td>
                    <td style={td}>{row.lead_name || "Contato"}</td>
                    <td style={td}>{actionDescription(row)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
