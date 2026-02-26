"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

function stageTheme(stageName: string) {
  const n = stageName.trim().toLowerCase();

  if (n.includes("novo"))
    return { accent: "rgba(180,120,255,0.95)", tint: "rgba(180,120,255,0.10)" };
  if (n.includes("contat"))
    return { accent: "rgba(120,190,255,0.95)", tint: "rgba(120,190,255,0.10)" };
  if (n.includes("orç") || n.includes("orc"))
    return { accent: "rgba(255,200,120,0.95)", tint: "rgba(255,200,120,0.10)" };
  if (n.includes("agend"))
    return { accent: "rgba(120,255,180,0.95)", tint: "rgba(120,255,180,0.10)" };
  if (n.includes("fech"))
    return { accent: "rgba(190,255,120,0.95)", tint: "rgba(190,255,120,0.10)" };
  if (n.includes("perd"))
    return { accent: "rgba(255,120,160,0.95)", tint: "rgba(255,120,160,0.10)" };

  return { accent: "rgba(255,255,255,0.70)", tint: "rgba(255,255,255,0.06)" };
}

function formatWhenCompact(iso: string) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

function prettyNextAction(type?: string | null) {
  const t = (type || "").toLowerCase();
  if (!t) return "Ação";
  if (t === "whatsapp") return "WhatsApp";
  if (t === "ligacao") return "Ligação";
  if (t === "avaliacao") return "Agendar avaliação";
  if (t === "retorno") return "Retorno";
  return type as string;
}

export default function HomePage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setErr(null);

    const { data: stagesData, error: stagesErr } = await supabase
      .from("stages")
      .select("id,name,position,is_final")
      .order("position", { ascending: true });

    const { data: leadsData, error: leadsErr } = await supabase
      .from("leads")
      .select("id,name,phone_raw,phone_e164,source,interest,stage_id,next_action_type,next_action_at");

    if (stagesErr) console.error(stagesErr);
    if (leadsErr) console.error(leadsErr);

    if (stagesErr || leadsErr) {
      setErr(stagesErr?.message || leadsErr?.message || "Erro ao carregar dados");
    }

    setStages((stagesData as any) ?? []);
    setLeads((leadsData as any) ?? []);
    setLoading(false);
  }

  const stageNameFromId = (id?: string | null) => {
    if (!id) return "—";
    return stages.find((s) => s.id === id)?.name ?? "—";
  };

  const finalStageIds = useMemo(() => {
    const s = new Set<string>();
    for (const st of stages) if (st.is_final) s.add(st.id);
    return s;
  }, [stages]);

  const totalLeads = leads.length;

  const inProgress = useMemo(() => {
    return leads.filter((l) => !finalStageIds.has(l.stage_id)).length;
  }, [leads, finalStageIds]);

  // Agenda
  const now = useMemo(() => new Date(), [loading]); // “refresca” quando carregar
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [loading]);
  const todayEnd = useMemo(() => {
    const d = new Date(todayStart);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [todayStart]);
  const next7End = useMemo(() => {
    const d = new Date(todayEnd);
    d.setDate(d.getDate() + 7);
    return d;
  }, [todayEnd]);

  const leadsWithNext = useMemo(() => {
    return leads
      .filter((l) => !!l.next_action_at)
      .map((l) => ({ ...l, _next: new Date(l.next_action_at as string) }))
      .filter((l) => !isNaN((l as any)._next.getTime()))
      .sort((a: any, b: any) => a._next.getTime() - b._next.getTime());
  }, [leads]);

  const overdue = useMemo(
    () => leadsWithNext.filter((l: any) => l._next.getTime() < now.getTime()),
    [leadsWithNext, now]
  );

  const today = useMemo(
    () =>
      leadsWithNext.filter((l: any) => {
        const t = l._next.getTime();
        return t >= todayStart.getTime() && t <= todayEnd.getTime();
      }),
    [leadsWithNext, todayStart, todayEnd]
  );

  const next7 = useMemo(
    () =>
      leadsWithNext.filter((l: any) => {
        const t = l._next.getTime();
        return t > todayEnd.getTime() && t <= next7End.getTime();
      }),
    [leadsWithNext, todayEnd, next7End]
  );

  // Resumo por etapa
  const countsByStage = useMemo(() => {
    const m = new Map<string, number>();
    for (const st of stages) m.set(st.id, 0);
    for (const l of leads) m.set(l.stage_id, (m.get(l.stage_id) ?? 0) + 1);
    return m;
  }, [stages, leads]);

  const pageTitle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 950,
    letterSpacing: 0.2,
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  };

  const gridTop: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 12,
  };

  const card: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 16px 44px rgba(0,0,0,0.35)",
    overflow: "hidden",
  };

  const cardTitle: React.CSSProperties = { fontSize: 13, opacity: 0.8, fontWeight: 900 };
  const cardValue: React.CSSProperties = { fontSize: 34, fontWeight: 950, marginTop: 4, lineHeight: "38px" };
  const cardHint: React.CSSProperties = { fontSize: 12, opacity: 0.65 };

  const gridMain: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
    gap: 12,
  };

  const sectionTitle: React.CSSProperties = { fontWeight: 950, fontSize: 16, marginBottom: 10 };
  const soft: React.CSSProperties = { fontSize: 12, opacity: 0.7 };

  const listWrap: React.CSSProperties = {
    display: "grid",
    gap: 10,
  };

  const row: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.035)",
    borderRadius: 14,
    padding: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  };

  const rowLeft: React.CSSProperties = { display: "grid", gap: 4, minWidth: 0 };
  const rowName: React.CSSProperties = { fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  const rowMeta: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };

  const openBtn: React.CSSProperties = {
    textDecoration: "none",
    color: "white",
    fontWeight: 900,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(180,120,255,0.30)",
    background: "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)",
    whiteSpace: "nowrap",
  };

  const smallLink: React.CSSProperties = {
    textDecoration: "none",
    color: "rgba(255,255,255,0.85)",
    fontWeight: 800,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    padding: "8px 10px",
    borderRadius: 12,
  };

  return (
    <div>
      <div style={pageTitle}>
        CRM GIO • Home <span style={{ ...chipStyle("muted"), marginLeft: 6 }}>Boituva • Unidade</span>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={chipStyle("muted")}>Leads: {totalLeads}</span>
        <span style={chipStyle("primary")}>Em progresso: {inProgress}</span>
        <Link href="/dashboard" style={smallLink}>
          Ir para o Kanban
        </Link>
        <Link href="/leads/new" style={smallLink}>
          + Novo lead
        </Link>
        <Link href="/leads" style={smallBtn}>Contatos</Link>
      </div>

      {loading ? <div style={soft}>Carregando…</div> : null}
      {err ? <div style={{ ...soft, color: "#ff6b6b" }}>{err}</div> : null}

      <div style={gridTop}>
        <div style={card}>
          <div style={cardTitle}>Total de leads</div>
          <div style={cardValue}>{totalLeads}</div>
          <div style={cardHint}>Base total cadastrada</div>
        </div>

        <div style={card}>
          <div style={cardTitle}>Em progresso</div>
          <div style={cardValue}>{inProgress}</div>
          <div style={cardHint}>Exclui etapas finais</div>
        </div>

        <div style={card}>
          <div style={cardTitle}>Ações hoje</div>
          <div style={cardValue}>{today.length}</div>
          <div style={cardHint}>Próximas ações no dia</div>
        </div>

        <div style={card}>
          <div style={cardTitle}>Atrasadas</div>
          <div style={cardValue}>{overdue.length}</div>
          <div style={cardHint}>Precisa agir agora</div>
        </div>
      </div>

      <div style={gridMain}>
        {/* Agenda */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <div style={sectionTitle}>Agenda de ações</div>
            <div style={soft}>
              Mostrando{" "}
              <span style={{ fontWeight: 900 }}>
                {Math.min(12, overdue.length + today.length + next7.length)}
              </span>{" "}
              de <span style={{ fontWeight: 900 }}>{leadsWithNext.length}</span>
            </div>
          </div>

          {leadsWithNext.length === 0 ? (
            <div style={{ opacity: 0.75 }}>Nenhuma próxima ação definida ainda.</div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {/* Atrasadas */}
              <div>
                <div style={{ fontWeight: 950, marginBottom: 10 }}>
                  Atrasadas <span style={{ ...chipStyle("muted"), marginLeft: 8 }}>{overdue.length}</span>
                </div>

                {overdue.length === 0 ? (
                  <div style={soft}>Nenhuma ação atrasada 🎯</div>
                ) : (
                  <div style={listWrap}>
                    {overdue.slice(0, 6).map((l: any) => (
                      <div key={l.id} style={row}>
                        <div style={rowLeft}>
                          <div style={rowName}>{l.name}</div>
                          <div style={rowMeta}>
                            <span style={chipStyle("primary")}>{prettyNextAction(l.next_action_type)}</span>
                            <span style={chipStyle("muted")}>Quando: {formatWhenCompact(l.next_action_at!)}</span>
                            <span style={chipStyle("muted")}>Etapa: {stageNameFromId(l.stage_id)}</span>
                          </div>
                        </div>

                        <Link href={`/dashboard?lead=${l.id}`} style={openBtn}>
                          Abrir lead
                        </Link>
                      </div>
                    ))}
                    {overdue.length > 6 ? <div style={soft}>+ {overdue.length - 6} a mais…</div> : null}
                  </div>
                )}
              </div>

              {/* Hoje */}
              <div>
                <div style={{ fontWeight: 950, marginBottom: 10 }}>
                  Hoje <span style={{ ...chipStyle("muted"), marginLeft: 8 }}>{today.length}</span>
                </div>

                {today.length === 0 ? (
                  <div style={soft}>Nenhuma ação marcada para hoje.</div>
                ) : (
                  <div style={listWrap}>
                    {today.slice(0, 6).map((l: any) => (
                      <div key={l.id} style={row}>
                        <div style={rowLeft}>
                          <div style={rowName}>{l.name}</div>
                          <div style={rowMeta}>
                            <span style={chipStyle("primary")}>{prettyNextAction(l.next_action_type)}</span>
                            <span style={chipStyle("muted")}>Quando: {formatWhenCompact(l.next_action_at!)}</span>
                            <span style={chipStyle("muted")}>Etapa: {stageNameFromId(l.stage_id)}</span>
                          </div>
                        </div>

                        <Link href={`/dashboard?lead=${l.id}`} style={openBtn}>
                          Abrir lead
                        </Link>
                      </div>
                    ))}
                    {today.length > 6 ? <div style={soft}>+ {today.length - 6} a mais…</div> : null}
                  </div>
                )}
              </div>

              {/* Próximos 7 dias */}
              <div>
                <div style={{ fontWeight: 950, marginBottom: 10 }}>
                  Próximos 7 dias <span style={{ ...chipStyle("muted"), marginLeft: 8 }}>{next7.length}</span>
                </div>

                {next7.length === 0 ? (
                  <div style={soft}>Nenhuma ação nos próximos 7 dias.</div>
                ) : (
                  <div style={listWrap}>
                    {next7.slice(0, 6).map((l: any) => (
                      <div key={l.id} style={row}>
                        <div style={rowLeft}>
                          <div style={rowName}>{l.name}</div>
                          <div style={rowMeta}>
                            <span style={chipStyle("primary")}>{prettyNextAction(l.next_action_type)}</span>
                            <span style={chipStyle("muted")}>Quando: {formatWhenCompact(l.next_action_at!)}</span>
                            <span style={chipStyle("muted")}>Etapa: {stageNameFromId(l.stage_id)}</span>
                          </div>
                        </div>

                        <Link href={`/dashboard?lead=${l.id}`} style={openBtn}>
                          Abrir lead
                        </Link>
                      </div>
                    ))}
                    {next7.length > 6 ? <div style={soft}>+ {next7.length - 6} a mais…</div> : null}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Resumo por etapas */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <div style={sectionTitle}>Resumo por etapas</div>
            <div style={soft}>Distribuição</div>
          </div>

          {stages.length === 0 ? (
            <div style={soft}>Sem etapas carregadas.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {stages.map((st) => {
                const theme = stageTheme(st.name);
                const count = countsByStage.get(st.id) ?? 0;
                const pct = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;

                return (
                  <div
                    key={st.id}
                    style={{
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: 14,
                      padding: 12,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 950 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: theme.accent,
                            boxShadow: `0 0 0 6px ${theme.tint}`,
                          }}
                        />
                        {st.name}
                        {st.is_final ? <span style={chipStyle("muted")}>Final</span> : null}
                      </div>
                      <div style={{ fontWeight: 900, opacity: 0.85 }}>
                        {count} • {pct}%
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        height: 10,
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(0,0,0,0.25)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          background: theme.accent,
                          opacity: 0.55,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}