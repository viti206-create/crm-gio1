"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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
  next_action_type?: string | null;
  next_action_at?: string | null;
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
      .select("id,name,phone_raw,phone_e164,source,interest,stage_id,next_action_type,next_action_at")
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

      const hay = [
        l.name ?? "",
        l.phone_raw ?? "",
        l.phone_e164 ?? "",
        l.source ?? "",
        l.interest ?? "",
        stageNameFromId(l.stage_id) ?? "",
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

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    minWidth: 200,
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    backgroundColor: "rgba(255,255,255,0.06)",
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
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 0.2 }}>Contatos (Leads)</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {loading ? (
              <span style={chipStyle("primary")}>Carregando…</span>
            ) : (
              <span style={chipStyle("muted")}>Total: {filtered.length}</span>
            )}
            <span style={chipStyle("muted")}>Dica: clique em “Abrir no Kanban” para abrir o modal direto</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/leads/new" style={btnPrimary}>
            + Novo lead
          </Link>

          <button onClick={() => router.push("/dashboard")} style={btn}>
            Ir para Kanban
          </button>

          <button onClick={fetchAll} style={btn}>
            Atualizar
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          style={inputStyle}
          placeholder="Buscar (nome, telefone, origem, interesse...)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select style={selectStyle} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="all">Todas as etapas</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select style={selectStyle} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          <option value="all">Todas as origens</option>
          {sourceOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select style={selectStyle} value={interestFilter} onChange={(e) => setInterestFilter(e.target.value)}>
          <option value="all">Todos os interesses</option>
          {interestOptions.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>

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

            return (
              <div key={l.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 950, fontSize: 15 }}>{l.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      {l.phone_raw ?? l.phone_e164}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={chipStyle("primary")}>{stageName}</span>
                      <span style={chipStyle("muted")}>{l.source}</span>
                      <span style={chipStyle("muted")}>{l.interest}</span>
                      {l.next_action_at ? (
                        <span style={chipStyle("muted")}>
                          Próx.: {l.next_action_type ?? "ação"} • {formatWhen(l.next_action_at)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <button
                      style={btnPrimary}
                      onClick={() => router.push(`/dashboard?lead=${encodeURIComponent(l.id)}`)}
                      title="Abre o modal do lead direto no Kanban"
                    >
                      Abrir no Kanban
                    </button>

                    <a style={btn} href={wa} target="_blank" rel="noreferrer">
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