"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SelectDark from "../_components/SelectDark";

type Stage = {
  id: string;
  name: string;
  position: number;
  is_final?: boolean;
};

type Lead = {
  id: string;
  name: string;
  phone_raw: string | null;
  phone_e164: string;
  source: string;
  interest: string;
  stage_id: string;
  campaign?: string | null;
  responsible_id?: string | null;
  next_action_type?: string | null;
  next_action_at?: string | null;
  cpf?: string | null;
  birth_date?: string | null;
  sex?: string | null;
};

function chipStyle(kind: "primary" | "muted" = "muted"): React.CSSProperties {
  return {
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 999,
    border:
      kind === "primary"
        ? "1px solid rgba(180,120,255,0.35)"
        : "1px solid rgba(255,255,255,0.10)",
    background:
      kind === "primary"
        ? "rgba(180,120,255,0.12)"
        : "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.90)",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    lineHeight: "16px",
    whiteSpace: "nowrap",
  };
}

function normalizePhoneForWa(phoneE164: string) {
  return (phoneE164 || "").replace(/\D/g, "");
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

function normalizeSexLabel(v?: string | null) {
  const key = String(v ?? "").trim().toLowerCase();
  if (key === "feminino") return "Feminino";
  if (key === "masculino") return "Masculino";
  return "Não informado";
}

function calculateAge(birthDate?: string | null) {
  if (!birthDate) return null;

  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birth.getDate())
  ) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

export default function LeadsListPage() {
  const router = useRouter();

  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [interestFilter, setInterestFilter] = useState<string>("all");

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchAll() {
    setLoading(true);

    const { data: stagesData, error: stagesErr } = await supabase
      .from("stages")
      .select("id,name,position,is_final")
      .order("position", { ascending: true });

    const { data: leadsData, error: leadsErr } = await supabase
      .from("leads")
      .select(
        "id,name,phone_raw,phone_e164,source,interest,stage_id,campaign,responsible_id,next_action_type,next_action_at,cpf,birth_date,sex"
      )
      .order("id", { ascending: false });

    if (stagesErr) console.error("stages error:", stagesErr);
    if (leadsErr) console.error("leads error:", leadsErr);

    setStages((stagesData as any) ?? []);
    setLeads((leadsData as any) ?? []);
    setLoading(false);
  }

  const stageNameFromId = (id?: string | null) => {
    if (!id) return "—";
    return stages.find((s) => s.id === id)?.name ?? "—";
  };

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) if (l.source) set.add(l.source);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const interestOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) if (l.interest) set.add(l.interest);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return leads.filter((l) => {
      if (stageFilter !== "all" && l.stage_id !== stageFilter) return false;
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (interestFilter !== "all" && l.interest !== interestFilter) return false;

      if (!query) return true;

      const age = calculateAge(l.birth_date);
      const sex = normalizeSexLabel(l.sex);

      const hay = [
        l.name ?? "",
        l.phone_raw ?? "",
        l.phone_e164 ?? "",
        l.source ?? "",
        l.interest ?? "",
        stageNameFromId(l.stage_id) ?? "",
        l.campaign ?? "",
        l.responsible_id ?? "",
        l.cpf ?? "",
        l.birth_date ?? "",
        sex,
        age != null ? String(age) : "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(query);
    });
  }, [leads, q, stageFilter, sourceFilter, interestFilter, stages]);

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    outline: "none",
    minWidth: 240,
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

  const card: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
    display: "grid",
    gap: 10,
    cursor: "pointer",
  };

  function goEdit(id: string) {
    router.push(`/leads/${id}?returnTo=/contatos`);
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 0.2 }}>
            Contatos (Leads)
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {loading ? (
              <span style={chipStyle("primary")}>Carregando…</span>
            ) : (
              <span style={chipStyle("muted")}>Total: {filtered.length}</span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/leads/new?returnTo=/contatos" style={btnPrimary}>
            + Novo lead
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          style={inputStyle}
          placeholder="Buscar (nome, telefone, origem, interesse, sexo, idade...)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <SelectDark
          value={stageFilter}
          onChange={setStageFilter}
          placeholder="Todas as etapas"
          searchable={false}
          minWidth={220}
          options={[
            { value: "all", label: "Todas as etapas" },
            ...stages.map((s) => ({
              value: s.id,
              label: s.name,
            })),
          ]}
        />

        <SelectDark
          value={sourceFilter}
          onChange={setSourceFilter}
          placeholder="Todas as origens"
          searchable={false}
          minWidth={220}
          options={[
            { value: "all", label: "Todas as origens" },
            ...sourceOptions.map((s) => ({
              value: s,
              label: s,
            })),
          ]}
        />

        <SelectDark
          value={interestFilter}
          onChange={setInterestFilter}
          placeholder="Todos os interesses"
          searchable={false}
          minWidth={220}
          options={[
            { value: "all", label: "Todos os interesses" },
            ...interestOptions.map((i) => ({
              value: i,
              label: i,
            })),
          ]}
        />

        <button
          onClick={() => {
            setQ("");
            setStageFilter("all");
            setSourceFilter("all");
            setInterestFilter("all");
          }}
          style={btn}
        >
          Limpar
        </button>
      </div>

      {loading ? (
        <div style={{ opacity: 0.8 }}>Carregando contatos…</div>
      ) : filtered.length === 0 ? (
        <div style={{ opacity: 0.75 }}>
          Nenhum contato encontrado. Se você ainda não cadastrou, clique em <b>+ Novo lead</b>.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {filtered.map((l) => {
            const wa = `https://wa.me/${normalizePhoneForWa(l.phone_e164)}`;
            const stageName = stageNameFromId(l.stage_id);
            const sexLabel = normalizeSexLabel(l.sex);
            const age = calculateAge(l.birth_date);

            return (
              <div
                key={l.id}
                style={card}
                onClick={() => goEdit(l.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") goEdit(l.id);
                }}
                title="Clique para editar"
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 950, fontSize: 15 }}>{l.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>{l.phone_raw ?? l.phone_e164}</div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={chipStyle("primary")}>{stageName}</span>
                      <span style={chipStyle("muted")}>{l.source}</span>
                      <span style={chipStyle("muted")}>{l.interest}</span>
                      <span style={chipStyle("muted")}>{sexLabel}</span>
                      <span style={chipStyle("muted")}>
                        {age != null ? `${age} anos` : "Idade não informada"}
                      </span>

                      {l.next_action_at ? (
                        <span style={chipStyle("muted")}>
                          Próx.: {l.next_action_type ?? "ação"} • {formatWhen(l.next_action_at)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <button
                      style={btn}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        goEdit(l.id);
                      }}
                    >
                      Editar
                    </button>

                    <a
                      style={btnPrimary}
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}