"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import SourceMetrics from "./SourceMetrics";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragCancelEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

type Activity = {
  id: string;
  created_at: string;
  type: string;
  payload: any;
  user_id: string | null;
  profiles?: { name: string | null } | null;
};

type ToastKind = "success" | "error" | "info";
type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("") || "L";
}

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

function prettyActivityLabel(type: string) {
  const t = (type || "").toLowerCase();
  if (t === "created") return "Lead criado";
  if (t === "stage_changed") return "Mudança de etapa";
  if (t === "next_action_set") return "Próxima ação definida";
  if (t === "note") return "Observação";
  if (t === "updated") return "Atualização";
  return type;
}

function ActivityRow({
  a,
  stageNameFromId,
}: {
  a: Activity;
  stageNameFromId: (id?: string | null) => string;
}) {
  const who = a.profiles?.name || "Sistema";
  const label = prettyActivityLabel(a.type);

  let details = "";
  if (a.type === "stage_changed") {
    const from = stageNameFromId(a.payload?.from);
    const to = stageNameFromId(a.payload?.to);
    details = `${from} → ${to}`;
  } else if (a.type === "created") {
    const st = stageNameFromId(a.payload?.stage_id);
    const src = a.payload?.source ? ` • ${a.payload.source}` : "";
    const it = a.payload?.interest ? ` • ${a.payload.interest}` : "";
    details = `${st}${src}${it}`.trim();
  } else if (a.type === "next_action_set") {
    const ty = a.payload?.next_action_type ? String(a.payload.next_action_type) : "ação";
    const at = a.payload?.next_action_at ? formatWhen(String(a.payload.next_action_at)) : "";
    details = at ? `${ty} • ${at}` : ty;
  } else if (a.type === "note") {
    details = a.payload?.text ? String(a.payload.text) : "";
  }

  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 900 }}>{label}</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>{formatWhen(a.created_at)}</div>
      </div>

      {details ? (
        <div style={{ fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" }}>{details}</div>
      ) : null}

      <div style={{ fontSize: 12, opacity: 0.65 }}>Por: {who}</div>
    </div>
  );
}

function LeadCard({
  lead,
  accent,
  onOpen,
}: {
  lead: Lead;
  accent: string;
  onOpen: (leadId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: lead.id,
      data: { type: "lead", leadId: lead.id, stageId: lead.stage_id },
    });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.15 : 1,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)",
    padding: 12,
    borderRadius: 14,
    marginTop: 10,
    cursor: "grab",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 14px 36px rgba(0,0,0,0.30)",
    userSelect: "none",
    position: "relative",
    overflow: "hidden",
  };

  const leftGlow: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    background: accent,
    opacity: 0.8,
  };

  const avatar: React.CSSProperties = {
    width: 30,
    height: 30,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    fontWeight: 900,
    fontSize: 12,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        if (isDragging) return;
        onOpen(lead.id);
      }}
    >
      <div style={leftGlow} />
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={avatar}>{initials(lead.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 14, lineHeight: "18px" }}>{lead.name}</div>
          <div style={{ opacity: 0.82, fontSize: 12, marginTop: 3 }}>
            {lead.phone_raw ?? lead.phone_e164}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <span style={chipStyle("primary")}>{lead.interest}</span>
        <span style={chipStyle("muted")}>{lead.source}</span>
      </div>
    </div>
  );
}

function Column({
  stage,
  leads,
  onOpenLead,
}: {
  stage: Stage;
  leads: Lead[];
  onOpenLead: (leadId: string) => void;
}) {
  const leadIds = leads.map((l) => l.id);

  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: "stage", stageId: stage.id },
  });

  const theme = stageTheme(stage.name);

  const style: React.CSSProperties = {
    minWidth: 300,
    maxWidth: 340,
    padding: 14,
    borderRadius: 18,
    border: isOver
      ? `1px solid ${theme.accent.replace("0.95", "0.40")}`
      : "1px solid rgba(255,255,255,0.08)",
    background: isOver
      ? `linear-gradient(180deg, ${theme.tint} 0%, rgba(255,255,255,0.03) 100%)`
      : "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
    boxShadow: "0 16px 44px rgba(0,0,0,0.35)",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  };

  const titleStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontWeight: 950,
  };

  const dot: React.CSSProperties = {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: theme.accent,
    boxShadow: `0 0 0 6px ${theme.tint}`,
  };

  const badgeStyle: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.9,
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "2px 8px",
    borderRadius: 999,
    background: "rgba(0,0,0,0.20)",
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={headerStyle}>
        <div style={titleStyle}>
          <span style={dot} />
          <span>{stage.name}</span>
          {stage.is_final ? <span style={{ ...chipStyle("muted"), opacity: 0.9 }}>Final</span> : null}
        </div>
        <div style={badgeStyle}>{leads.length}</div>
      </div>

      <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} accent={theme.accent} onOpen={onOpenLead} />
        ))}
      </SortableContext>

      {leads.length === 0 ? (
        <div style={{ opacity: 0.55, fontSize: 12, marginTop: 12 }}>Solte um lead aqui</div>
      ) : null}
    </div>
  );
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(900px, 100%)",
          maxHeight: "86vh",
          overflow: "auto",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.14)",
          background:
            "linear-gradient(180deg, rgba(18,18,26,0.98) 0%, rgba(10,10,16,0.96) 100%)",
          boxShadow: "0 34px 120px rgba(0,0,0,0.70)",
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div style={{ fontWeight: 950, fontSize: 16 }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.14)",
              padding: "8px 10px",
              borderRadius: 12,
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            Fechar
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function normalizePhoneForWa(phoneE164: string) {
  return (phoneE164 || "").replace(/\D/g, "");
}

function normalizePhoneReadable(raw: string | null, e164: string) {
  const base = (raw && raw.trim().length > 0 ? raw : e164) || "";
  return base.trim();
}

function buildWhatsappMessage(lead: Lead) {
  const firstName = (lead.name || "").trim().split(/\s+/)[0] || "tudo bem";
  const interest = lead.interest ? `sobre ${lead.interest}` : "sobre um procedimento";
  return (
    `Olá, ${firstName}! Aqui é da GIO Estética Avançada.\n\n` +
    `Vi seu contato ${interest} e quero te ajudar com a melhor indicação para o seu objetivo.\n\n` +
    `Você prefere agendar uma avaliação ou quer tirar uma dúvida primeiro?`
  );
}

function LeadFromUrlOpener({
  onOpen,
}: {
  onOpen: (leadId: string) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const id = searchParams.get("lead");
    if (!id) return;

    onOpen(id);
    router.replace("/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return null;
}

export default function DashboardPage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  // filtros
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [interestFilter, setInterestFilter] = useState<string>("all");

  // drag overlay
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const activeLead = useMemo(
    () => leads.find((l) => l.id === activeLeadId) ?? null,
    [activeLeadId, leads]
  );

  // modal
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? null,
    [selectedLeadId, leads]
  );


  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);

  // ações do modal
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  const [nextActionType, setNextActionType] = useState<string>("whatsapp");
  const [nextActionAt, setNextActionAt] = useState<string>(""); // datetime-local
  const [nextActionSaving, setNextActionSaving] = useState(false);

  // toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimers = useRef<Map<string, number>>(new Map());

  function pushToast(t: Omit<ToastItem, "id">, ttlMs = 2600) {
    const id = uid();
    setToasts((prev) => [...prev, { id, ...t }]);

    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
      toastTimers.current.delete(id);
    }, ttlMs);

    toastTimers.current.set(id, timer);
  }

  function removeToast(id: string) {
    const timer = toastTimers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      toastTimers.current.delete(id);
    }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } })
  );

  const dropAnimation = {
    duration: 220,
    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: "0.35" } },
    }),
  };

  
  const bySource = useMemo(() => {
  const acc: Record<string, number> = {};

  for (const lead of (leads as any[]) ?? []) {
    const key = (lead?.source ?? "outros").toString().toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
  }


  useEffect(() => {
    
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  
async function fetchData() {
  const { data: stagesData, error: stagesErr } = await supabase
    .from("stages")
    .select("id,name,position,is_final")
    .order("position", { ascending: true });

  const { data: leadsData, error: leadsErr } = await supabase
    .from("leads")
    .select(
      "id,name,phone_raw,phone_e164,source,interest,stage_id,next_action_type,next_action_at"
    );

  if (stagesErr) console.error("stages error", stagesErr);
  if (leadsErr) console.error("leads error", leadsErr);

  if (stagesData) setStages(stagesData as any);
  if (leadsData) setLeads(leadsData as any);
}

  return acc;
}, [leads]);

  const stageNameFromId = (id?: string | null) => {
    if (!id) return "—";
    return stages.find((s) => s.id === id)?.name ?? "—";
  };

  async function loadActivities(leadId: string) {
    setActivities([]);
    setActivitiesLoading(true);
    setActivitiesError(null);

    const { data, error } = await supabase
      .from("activities")
      .select("id, created_at, type, payload, user_id, profiles(name)")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("activities error:", error);

      const { data: data2, error: error2 } = await supabase
        .from("activities")
        .select("id, created_at, type, payload, user_id")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });

      if (error2) {
        console.error("activities fallback error:", error2);
        setActivitiesError(error2.message ?? "Erro ao carregar atividades");
        setActivitiesLoading(false);
        return;
      }

      setActivities((data2 as any) ?? []);
      setActivitiesLoading(false);
      return;
    }

    setActivities((data as any) ?? []);
    setActivitiesLoading(false);
  }

  useEffect(() => {
    if (!selectedLeadId) return;

    setNoteText("");
    setNextActionType("whatsapp");
    setNextActionAt("");

    loadActivities(selectedLeadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeadId]);

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

  const filteredLeads = useMemo(() => {
    const query = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (stageFilter !== "all" && l.stage_id !== stageFilter) return false;
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (interestFilter !== "all" && l.interest !== interestFilter) return false;

      if (!query) return true;

      const hay = [
        l.name,
        l.phone_raw ?? "",
        l.phone_e164 ?? "",
        l.source ?? "",
        l.interest ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(query);
    });
  }, [leads, q, stageFilter, sourceFilter, interestFilter]);

  const totalLeads = filteredLeads.length;

  const leadsByStage = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const s of stages) map.set(s.id, []);
    for (const l of filteredLeads) {
      if (!map.has(l.stage_id)) map.set(l.stage_id, []);
      map.get(l.stage_id)!.push(l);
    }
    return map;
  }, [stages, filteredLeads]);

  const visibleStages = useMemo(() => {
    if (stageFilter === "all") return stages;
    return stages.filter((s) => s.id === stageFilter);
  }, [stages, stageFilter]);

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) {
      setActiveLeadId(null);
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    setActiveLeadId(null);

    if (activeId === overId) return;

    const activeLeadNow = leads.find((l) => l.id === activeId);
    if (!activeLeadNow) return;

    const overLead = leads.find((l) => l.id === overId);
    const overIsStage = stages.some((s) => s.id === overId);

    const targetStageId = overLead
      ? overLead.stage_id
      : overIsStage
      ? overId
      : activeLeadNow.stage_id;

    if (targetStageId !== activeLeadNow.stage_id) {
      setSaving(activeLeadNow.id);

      setLeads((prev) =>
        prev.map((l) => (l.id === activeLeadNow.id ? { ...l, stage_id: targetStageId } : l))
      );

      const { error } = await supabase
        .from("leads")
        .update({ stage_id: targetStageId })
        .eq("id", activeLeadNow.id);

      setSaving(null);

      if (error) {
        console.error("update stage error (raw):", error);
        console.error("update stage error (json):", JSON.stringify(error, null, 2));

        setLeads((prev) =>
          prev.map((l) =>
            l.id === activeLeadNow.id ? { ...l, stage_id: activeLeadNow.stage_id } : l
          )
        );

        pushToast({
          kind: "error",
          title: "Não consegui mover o lead",
          description: "Verifique policy/RLS. Veja o console (F12).",
        });
        return;
      }

      pushToast({
        kind: "success",
        title: "Etapa atualizada",
        description: `Agora em: ${stageNameFromId(targetStageId)}`,
      });

      if (selectedLeadId === activeLeadNow.id) loadActivities(activeLeadNow.id);
      return;
    }

    // Reordenar dentro da coluna (apenas visual)
    if (!overLead) return;

    const currentStageLeads = leads.filter((l) => l.stage_id === activeLeadNow.stage_id);
    const oldIndex = currentStageLeads.findIndex((l) => l.id === activeId);
    const newIndex = currentStageLeads.findIndex((l) => l.id === overId);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(currentStageLeads, oldIndex, newIndex);
    setLeads((prev) => {
      const others = prev.filter((l) => l.stage_id !== activeLeadNow.stage_id);
      return [...others, ...reordered];
    });
  }

  async function copyText(text: string, successMsg: string) {
    try {
      await navigator.clipboard.writeText(text);
      pushToast({ kind: "success", title: successMsg });
    } catch {
      // fallback
      prompt("Copie:", text);
      pushToast({ kind: "info", title: "Copie manualmente", description: "Seu navegador bloqueou o clipboard." });
    }
  }

  async function handleCopyWhatsAppLink() {
    if (!selectedLead) return;
    const phoneDigits = normalizePhoneForWa(selectedLead.phone_e164);
    const url = `https://wa.me/${phoneDigits}`;
    return copyText(url, "Link do WhatsApp copiado");
  }

  async function handleCopyPhone() {
    if (!selectedLead) return;
    const phone = normalizePhoneReadable(selectedLead.phone_raw, selectedLead.phone_e164);
    return copyText(phone, "Telefone copiado");
  }

  async function handleCopyMessage() {
    if (!selectedLead) return;
    const msg = buildWhatsappMessage(selectedLead);
    return copyText(msg, "Mensagem copiada");
  }

  function whatsappUrlWithText(lead: Lead) {
    const phoneDigits = normalizePhoneForWa(lead.phone_e164);
    const msg = buildWhatsappMessage(lead);
    return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`;
  }

  async function handleAddNote() {
    if (!selectedLeadId) return;
    const text = noteText.trim();
    if (!text) {
      pushToast({ kind: "info", title: "Digite uma observação antes de salvar" });
      return;
    }

    setNoteSaving(true);

    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes?.user?.id ?? null;

    const { error } = await supabase.from("activities").insert({
      lead_id: selectedLeadId,
      user_id: userId,
      type: "note",
      payload: { text },
    });

    setNoteSaving(false);

    if (error) {
      console.error("add note error:", error);
      pushToast({
        kind: "error",
        title: "Não consegui salvar a observação",
        description: "Verifique policy/RLS. Veja o console (F12).",
      });
      return;
    }

    setNoteText("");
    loadActivities(selectedLeadId);
    pushToast({ kind: "success", title: "Observação salva" });
  }

  function toIsoFromDatetimeLocal(v: string) {
    try {
      const d = new Date(v);
      return d.toISOString();
    } catch {
      return null;
    }
  }

  async function handleSetNextAction() {
    if (!selectedLead) return;

    if (!nextActionAt) {
      pushToast({ kind: "info", title: "Escolha a data/hora da próxima ação" });
      return;
    }

    const iso = toIsoFromDatetimeLocal(nextActionAt);
    if (!iso) {
      pushToast({ kind: "error", title: "Data/hora inválida" });
      return;
    }

    setNextActionSaving(true);

    setLeads((prev) =>
      prev.map((l) =>
        l.id === selectedLead.id ? { ...l, next_action_type: nextActionType, next_action_at: iso } : l
      )
    );

    const { error } = await supabase
      .from("leads")
      .update({ next_action_type: nextActionType, next_action_at: iso })
      .eq("id", selectedLead.id);

    setNextActionSaving(false);

    if (error) {
      console.error("set next action error:", error);
      pushToast({
        kind: "error",
        title: "Não consegui salvar a próxima ação",
        description: "Verifique policy/RLS. Veja o console (F12).",
      });
      return;
    }

    loadActivities(selectedLead.id);
    pushToast({ kind: "success", title: "Próxima ação salva" });
  }

  const topBar: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    gap: 12,
    flexWrap: "wrap",
  };

  const leftHeader: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 280,
  };

  const colsWrap: React.CSSProperties = {
    display: "flex",
    gap: 14,
    overflowX: "auto",
    paddingBottom: 12,
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    outline: "none",
    minWidth: 240,
  };

  const selectStyle: React.CSSProperties = { ...inputStyle, minWidth: 190 };

  const cardBox: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 12,
  };

  const smallBtn: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 900,
  };

  const softText: React.CSSProperties = { fontSize: 12, opacity: 0.7 };

  const toastWrap: React.CSSProperties = {
    position: "fixed",
    right: 16,
    bottom: 16,
    display: "grid",
    gap: 10,
    zIndex: 10000,
    width: "min(380px, calc(100vw - 32px))",
  };

  function toastStyle(kind: ToastKind): React.CSSProperties {
    const base: React.CSSProperties = {
      borderRadius: 16,
      padding: 12,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "linear-gradient(180deg, rgba(18,18,26,0.96) 0%, rgba(10,10,16,0.94) 100%)",
      boxShadow: "0 22px 70px rgba(0,0,0,0.55)",
      backdropFilter: "blur(10px)",
      overflow: "hidden",
      position: "relative",
    };

    let accent = "rgba(255,255,255,0.40)";
    if (kind === "success") accent = "rgba(140,255,190,0.55)";
    if (kind === "error") accent = "rgba(255,120,160,0.55)";
    if (kind === "info") accent = "rgba(180,120,255,0.55)";

    return {
      ...base,
      border: `1px solid ${accent}`,
    };
  }

  return (
    <div>
      <Suspense fallback={null}>
  <LeadFromUrlOpener onOpen={setSelectedLeadId} />
</Suspense>
      {/* TOASTS */}
      <div style={toastWrap} aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} style={toastStyle(t.kind)}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 950 }}>{t.title}</div>
              <button
                onClick={() => removeToast(t.id)}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10,
                  padding: "6px 8px",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                ✕
              </button>
            </div>
            {t.description ? (
              <div style={{ fontSize: 12, opacity: 0.82, marginTop: 6 }}>{t.description}</div>
            ) : null}
          </div>
        ))}
      </div>

      <div style={topBar}>
        <div style={leftHeader}>
          <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 0.2 }}>Kanban de Leads</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={chipStyle("muted")}>Total: {totalLeads}</span>
            {saving ? (
              <span style={chipStyle("primary")}>Salvando… {saving.slice(0, 6)}</span>
            ) : (
              <span style={chipStyle("muted")}>Pronto</span>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              style={inputStyle}
              placeholder="Buscar (nome, telefone...)"
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
              style={smallBtn}
            >
              Limpar
            </button>
            
          </div>

          
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setActiveLeadId(String(e.active.id))}
        onDragCancel={(_: DragCancelEvent) => setActiveLeadId(null)}
        onDragEnd={onDragEnd}
        modifiers={[restrictToWindowEdges]}
      >
        <div style={colsWrap}>
          {visibleStages.map((stage) => (
            <Column
              key={stage.id}
              stage={stage}
              leads={leadsByStage.get(stage.id) ?? []}
              onOpenLead={(leadId) => setSelectedLeadId(leadId)}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={dropAnimation}>
          {activeLead ? (
            <div
              style={{
                background:
                  "linear-gradient(180deg, rgba(18,18,26,0.98) 0%, rgba(10,10,16,0.96) 100%)",
                padding: 12,
                borderRadius: 16,
                width: 320,
                border: "1px solid rgba(255,255,255,0.14)",
                boxShadow: "0 28px 90px rgba(0,0,0,0.70)",
                transform: "scale(1.02)",
              }}
            >
              <div style={{ fontWeight: 950, marginBottom: 6 }}>{activeLead.name}</div>
              <div style={{ opacity: 0.9 }}>{activeLead.phone_raw ?? activeLead.phone_e164}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <span style={chipStyle("primary")}>{activeLead.interest}</span>
                <span style={chipStyle("muted")}>{activeLead.source}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Modal open={!!selectedLeadId} title={selectedLead ? selectedLead.name : "Lead"} onClose={() => setSelectedLeadId(null)}>
        {selectedLead ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span style={chipStyle("primary")}>Etapa: {stageNameFromId(selectedLead.stage_id)}</span>
                <span style={chipStyle("muted")}>
                  Telefone: {normalizePhoneReadable(selectedLead.phone_raw, selectedLead.phone_e164)}
                </span>
                <span style={chipStyle("muted")}>Origem: {selectedLead.source}</span>
                <span style={chipStyle("muted")}>Interesse: {selectedLead.interest}</span>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button style={smallBtn} onClick={handleCopyWhatsAppLink}>
                  Copiar WhatsApp (link)
                </button>

                <button style={smallBtn} onClick={handleCopyPhone}>
                  Copiar telefone
                </button>

                <button style={smallBtn} onClick={handleCopyMessage}>
                  Copiar mensagem pronta
                </button>

                <a
                  href={`https://wa.me/${normalizePhoneForWa(selectedLead.phone_e164)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    ...smallBtn,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  Abrir WhatsApp
                </a>

                <a
                  href={whatsappUrlWithText(selectedLead)}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    ...smallBtn,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  Abrir WhatsApp com mensagem
                </a>
              </div>

              <div style={softText}>
                Dica: “Abrir WhatsApp com mensagem” já leva o texto pronto. Se preferir, use “Copiar mensagem pronta”.
              </div>
            </div>

            <div style={cardBox}>
              <div style={{ fontWeight: 950, marginBottom: 10 }}>Próxima ação</div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={nextActionType}
                  onChange={(e) => setNextActionType(e.target.value)}
                  style={{ ...selectStyle, minWidth: 200 }}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="ligacao">Ligação</option>
                  <option value="avaliacao">Agendar avaliação</option>
                  <option value="retorno">Retorno</option>
                </select>

                <input
                  type="datetime-local"
                  value={nextActionAt}
                  onChange={(e) => setNextActionAt(e.target.value)}
                  style={{ ...inputStyle, minWidth: 240 }}
                />

                <button style={smallBtn} onClick={handleSetNextAction} disabled={nextActionSaving}>
                  {nextActionSaving ? "Salvando..." : "Salvar próxima ação"}
                </button>
              </div>

              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
                Atual:{" "}
                {selectedLead.next_action_type || selectedLead.next_action_at
                  ? `${selectedLead.next_action_type ?? "—"} • ${
                      selectedLead.next_action_at ? formatWhen(selectedLead.next_action_at) : "—"
                    }`
                  : "—"}
              </div>
            </div>

            <div style={cardBox}>
              <div style={{ fontWeight: 950, marginBottom: 10 }}>Adicionar observação</div>

              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Ex: Cliente pediu para chamar amanhã após 14h..."
                style={{
                  width: "100%",
                  minHeight: 90,
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  padding: 12,
                  outline: "none",
                  resize: "vertical",
                }}
              />

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button style={smallBtn} onClick={handleAddNote} disabled={noteSaving}>
                  {noteSaving ? "Salvando..." : "Salvar observação"}
                </button>
              </div>
            </div>

            <div style={{ fontWeight: 950, marginTop: 2 }}>Histórico</div>

            {activitiesLoading ? (
              <div style={{ opacity: 0.75 }}>Carregando atividades…</div>
            ) : activitiesError ? (
              <div style={{ opacity: 0.85 }}>Erro ao carregar atividades: {activitiesError}</div>
            ) : activities.length === 0 ? (
              <div style={{ opacity: 0.65 }}>Sem atividades ainda (ou sem permissão de leitura).</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {activities.map((a) => (
                  <ActivityRow key={a.id} a={a} stageNameFromId={stageNameFromId} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ opacity: 0.75 }}>Lead não encontrado.</div>
        )}
      </Modal>
    </div>
  );
}