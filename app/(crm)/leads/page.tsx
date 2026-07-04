"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SelectDark from "../_components/SelectDark";

type Stage = { id: string; name: string; position: number; is_final?: boolean; };

type Lead = {
  id: string; name: string; phone_raw: string | null; phone_e164: string;
  source: string; interest: string; interests: string[] | null;
  stage_id: string; campaign?: string | null; responsible_id?: string | null;
  next_action_type?: string | null; next_action_at?: string | null;
  cpf?: string | null; birth_date?: string | null; sex?: string | null;
  created_at?: string | null;
};

type Profile = { id: string; name: string | null; };

type TabType = "contatos" | "responsaveis";

function chipStyle(kind: "primary" | "muted" = "muted"): React.CSSProperties {
  return {
    fontSize: 12, padding: "3px 8px", borderRadius: 999,
    border: kind === "primary" ? "1px solid rgba(180,120,255,0.35)" : "1px solid rgba(255,255,255,0.10)",
    background: kind === "primary" ? "rgba(180,120,255,0.12)" : "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.90)", display: "inline-flex", alignItems: "center",
    gap: 6, lineHeight: "16px", whiteSpace: "nowrap",
  };
}

function normalizePhoneForWa(phoneE164: string) { return (phoneE164 || "").replace(/\D/g, ""); }

function formatDateOnly(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  } catch { return iso; }
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
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function getLeadInterests(l: Lead): string[] {
  if (l.interests && l.interests.length > 0) return l.interests;
  if (l.interest) return [l.interest];
  return [];
}

function todayValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function firstDayOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
}

export default function LeadsListPage() {
  const router = useRouter();
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("contatos");

  // Filtros aba contatos
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [interestFilter, setInterestFilter] = useState<string>("all");

  // Filtros aba responsáveis
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth());
  const [dateTo, setDateTo] = useState(todayValue());

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [{ data: stagesData }, { data: leadsData }, { data: profilesData }] = await Promise.all([
      supabase.from("stages").select("id,name,position,is_final").order("position", { ascending: true }),
      supabase.from("leads").select("id,name,phone_raw,phone_e164,source,interest,interests,stage_id,campaign,responsible_id,next_action_type,next_action_at,cpf,birth_date,sex,created_at").order("id", { ascending: false }),
      supabase.from("profiles").select("id,name"),
    ]);
    setStages((stagesData as any) ?? []);
    setLeads((leadsData as any) ?? []);
    setProfiles((profilesData as any) ?? []);
    setLoading(false);
  }

  const stageNameFromId = (id?: string | null) => { if (!id) return "—"; return stages.find((s) => s.id === id)?.name ?? "—"; };
  const profileNameFromId = (id?: string | null) => {
    if (!id) return "Não definido";
    const p = profiles.find((p) => p.id === id);
    return p?.name?.trim() || "Não definido";
  };

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) if (l.source) set.add(l.source);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const interestOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) for (const i of getLeadInterests(l)) if (i) set.add(i);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (stageFilter !== "all" && l.stage_id !== stageFilter) return false;
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (interestFilter !== "all") {
        const li = getLeadInterests(l).map(i => i.toLowerCase());
        if (!li.includes(interestFilter.toLowerCase())) return false;
      }
      if (!query) return true;
      const age = calculateAge(l.birth_date);
      const hay = [l.name ?? "", l.phone_raw ?? "", l.phone_e164 ?? "", l.source ?? "",
        getLeadInterests(l).join(" "), stageNameFromId(l.stage_id) ?? "",
        l.campaign ?? "", l.cpf ?? "", normalizeSexLabel(l.sex),
        age != null ? String(age) : "",
      ].join(" ").toLowerCase();
      return hay.includes(query);
    });
  }, [leads, q, stageFilter, sourceFilter, interestFilter, stages]);

  // Contagem por responsável filtrada por período
  const responsaveisCounts = useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    const map = new Map<string, number>();

    for (const l of leads) {
      if (from || to) {
        if (!l.created_at) continue;
        const d = new Date(l.created_at);
        if (from && d < from) continue;
        if (to && d > to) continue;
      }
      const key = l.responsible_id ?? "__sem_responsavel__";
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    return Array.from(map.entries())
      .map(([id, count]) => ({ id, name: profileNameFromId(id), count }))
      .sort((a, b) => b.count - a.count);
  }, [leads, profiles, dateFrom, dateTo]);

  const totalNoPeriodo = responsaveisCounts.reduce((s, r) => s + r.count, 0);

  const inputStyle: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", borderRadius: 12, outline: "none", minWidth: 240 };
  const inputDateStyle: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", borderRadius: 12, outline: "none" };
  const btn: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", borderRadius: 12, cursor: "pointer", fontWeight: 900, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 };
  const btnPrimary: React.CSSProperties = { ...btn, border: "1px solid rgba(180,120,255,0.30)", background: "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)" };
  const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 14, boxShadow: "0 18px 60px rgba(0,0,0,0.45)", display: "grid", gap: 10, cursor: "pointer" };

  const tabBtn = (tab: TabType): React.CSSProperties => ({
    background: activeTab === tab ? "rgba(180,120,255,0.2)" : "rgba(255,255,255,0.05)",
    border: activeTab === tab ? "1px solid rgba(180,120,255,0.4)" : "1px solid rgba(255,255,255,0.12)",
    color: "white", padding: "8px 18px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13,
  });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 0.2 }}>Contatos (Leads)</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {loading ? <span style={chipStyle("primary")}>Carregando…</span> : <span style={chipStyle("muted")}>Total: {filtered.length}</span>}
            {interestFilter !== "all" && <span style={chipStyle("primary")}>Interesse: {interestFilter}</span>}
          </div>
        </div>
        <Link href="/leads/new" style={btnPrimary}>+ Novo lead</Link>
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={tabBtn("contatos")} onClick={() => setActiveTab("contatos")}>Contatos</button>
        <button style={tabBtn("responsaveis")} onClick={() => setActiveTab("responsaveis")}>Por responsável</button>
      </div>

      {/* ABA CONTATOS */}
      {activeTab === "contatos" && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input style={inputStyle} placeholder="Buscar (nome, telefone, interesse...)" value={q} onChange={(e) => setQ(e.target.value)} />
            <SelectDark value={stageFilter} onChange={setStageFilter} placeholder="Todas as etapas" searchable={false} minWidth={220}
              options={[{ value: "all", label: "Todas as etapas" }, ...stages.map((s) => ({ value: s.id, label: s.name }))]} />
            <SelectDark value={sourceFilter} onChange={setSourceFilter} placeholder="Todas as origens" searchable={false} minWidth={200}
              options={[{ value: "all", label: "Todas as origens" }, ...sourceOptions.map((s) => ({ value: s, label: s }))]} />
            <SelectDark value={interestFilter} onChange={setInterestFilter} placeholder="Todos os interesses" searchable={true} minWidth={220}
              options={[{ value: "all", label: "Todos os interesses" }, ...interestOptions.map((i) => ({ value: i, label: i }))]} />
            <button onClick={() => { setQ(""); setStageFilter("all"); setSourceFilter("all"); setInterestFilter("all"); }} style={btn}>Limpar</button>
          </div>

          {loading ? (
            <div style={{ opacity: 0.8 }}>Carregando contatos…</div>
          ) : filtered.length === 0 ? (
            <div style={{ opacity: 0.75 }}>Nenhum contato encontrado.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {filtered.map((l) => {
                const wa = `https://wa.me/${normalizePhoneForWa(l.phone_e164)}`;
                const stageName = stageNameFromId(l.stage_id);
                const sexLabel = normalizeSexLabel(l.sex);
                const age = calculateAge(l.birth_date);
                const leadInterests = getLeadInterests(l);
                return (
                  <div key={l.id} style={card} onClick={() => router.push(`/leads/${l.id}`)} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(`/leads/${l.id}`); }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontWeight: 950, fontSize: 15 }}>{l.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.85 }}>{l.phone_raw ?? l.phone_e164}</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span style={chipStyle("primary")}>{stageName}</span>
                          <span style={chipStyle("muted")}>{l.source}</span>
                          {leadInterests.map((interest, i) => (
                            <span key={i} style={{ ...chipStyle(interestFilter === interest ? "primary" : "muted"), cursor: "pointer" }}
                              onClick={(e) => { e.stopPropagation(); setInterestFilter(interest); }} title={`Filtrar por: ${interest}`}>
                              {interest}
                            </span>
                          ))}
                          <span style={chipStyle("muted")}>{sexLabel}</span>
                          <span style={chipStyle("muted")}>{age != null ? `${age} anos` : "Idade não informada"}</span>
                          {l.next_action_at ? <span style={chipStyle("muted")}>Próx.: {l.next_action_type ?? "ação"} • {formatDateOnly(l.next_action_at)}</span> : null}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <button style={btn} onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/leads/${l.id}`); }}>Editar</button>
                        <a style={btnPrimary} href={wa} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>WhatsApp</a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ABA RESPONSÁVEIS */}
      {activeTab === "responsaveis" && (
        <div style={{ display: "grid", gap: 14 }}>
          {/* Filtro de período */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 700 }}>Período:</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>De</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputDateStyle} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Até</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputDateStyle} />
            </div>
            <button onClick={() => { setDateFrom(firstDayOfMonth()); setDateTo(todayValue()); }} style={btn}>Mês atual</button>
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={btn}>Sem filtro</button>
          </div>

          {/* Resumo */}
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {dateFrom || dateTo
              ? `${totalNoPeriodo} leads cadastrados${dateFrom ? ` a partir de ${formatDateOnly(dateFrom)}` : ""}${dateTo ? ` até ${formatDateOnly(dateTo)}` : ""}`
              : `${totalNoPeriodo} leads no total`}
          </div>

          {/* Tabela de responsáveis */}
          {loading ? (
            <div style={{ opacity: 0.8 }}>Carregando...</div>
          ) : responsaveisCounts.length === 0 ? (
            <div style={{ opacity: 0.75 }}>Nenhum lead no período.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {responsaveisCounts.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: "12px 16px", background: "rgba(255,255,255,0.04)" }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 15 }}>{r.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                      {((r.count / totalNoPeriodo) * 100).toFixed(1)}% do total
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {/* Barra de progresso */}
                    <div style={{ width: 100, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ width: `${(r.count / responsaveisCounts[0].count) * 100}%`, height: "100%", background: "rgba(180,120,255,0.7)", borderRadius: 999 }} />
                    </div>
                    <div style={{ fontWeight: 900, fontSize: 20, minWidth: 32, textAlign: "right" }}>{r.count}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
