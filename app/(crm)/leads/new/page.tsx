"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Stage = { id: string; name: string; position: number; is_final?: boolean; };
type ProfileOption = { id: string; name: string | null; };
type ToastAction = { label: string; onClick: () => void; variant?: "primary" | "ghost"; };

function chipStyle(kind: "primary" | "muted" = "muted"): React.CSSProperties {
  return {
    fontSize: 12, padding: "3px 8px", borderRadius: 999,
    border: kind === "primary" ? "1px solid rgba(180,120,255,0.35)" : "1px solid rgba(255,255,255,0.10)",
    background: kind === "primary" ? "rgba(180,120,255,0.12)" : "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.90)", display: "inline-flex", alignItems: "center",
    gap: 6, lineHeight: "16px", whiteSpace: "nowrap",
  };
}

function Toast({ title, text, variant = "info", actions, onClose }: {
  title?: string; text: string; variant?: "info" | "success" | "error";
  actions?: ToastAction[]; onClose: () => void;
}) {
  const border = variant === "success" ? "1px solid rgba(120,255,180,0.26)" : variant === "error" ? "1px solid rgba(255,120,160,0.30)" : "1px solid rgba(180,120,255,0.18)";
  const glow = variant === "success" ? "rgba(120,255,180,0.18)" : variant === "error" ? "rgba(255,120,160,0.20)" : "rgba(180,120,255,0.16)";
  const leftBar = variant === "success" ? "rgba(120,255,180,0.92)" : variant === "error" ? "rgba(255,120,160,0.92)" : "rgba(180,120,255,0.92)";
  const btnBase: React.CSSProperties = { borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.92)", padding: "9px 10px", fontWeight: 900, cursor: "pointer", fontSize: 12 };
  const btnPrimary: React.CSSProperties = { ...btnBase, border: "1px solid rgba(180,120,255,0.28)", background: "linear-gradient(180deg, rgba(180,120,255,0.20) 0%, rgba(180,120,255,0.08) 100%)" };
  const btnGhost: React.CSSProperties = { ...btnBase, background: "rgba(255,255,255,0.04)" };
  return (
    <div style={{ position: "fixed", left: "50%", bottom: 18, transform: "translateX(-50%)", zIndex: 10000, width: "min(760px, 92vw)" }} role="status" aria-live="polite">
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 18, border, background: "rgba(10,10,14,0.84)", backdropFilter: "blur(12px)", boxShadow: `0 30px 90px rgba(0,0,0,0.70), 0 0 0 1px ${glow} inset`, padding: 14 }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: leftBar, opacity: 0.85 }} />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            {title ? <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>{title}</div> : null}
            <div style={{ fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" }}>{text}</div>
            {actions && actions.length > 0 ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                {actions.map((a, idx) => <button key={idx} onClick={a.onClick} style={a.variant === "ghost" ? btnGhost : btnPrimary}>{a.label}</button>)}
              </div>
            ) : null}
          </div>
          <button onClick={onClose} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.88)", padding: "8px 10px", fontWeight: 900, cursor: "pointer", height: 36, alignSelf: "flex-start" }} title="Fechar" aria-label="Fechar">✕</button>
        </div>
      </div>
    </div>
  );
}

function toE164BR(input: string) {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) { const d = digits.replace(/^0+/, ""); if (d.length === 12 || d.length === 13) return `+${d}`; return ""; }
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return "";
}

function formatDateToISO(v: string) {
  try { if (!v) return ""; const d = new Date(`${v}T12:00:00`); if (Number.isNaN(d.getTime())) return ""; return d.toISOString(); } catch { return ""; }
}

function todayInputValue() {
  const dt = new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function Select({ value, onChange, placeholder = "Selecione…", options, disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  options: { value: string; label: string }[]; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((o) => o.value === value);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (!wrapRef.current) return; if (!wrapRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const btnStyle: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.92)", border: "1px solid rgba(255,255,255,0.12)", height: 44, padding: "0 12px", borderRadius: 12, outline: "none", width: "100%", cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, opacity: disabled ? 0.6 : 1, boxSizing: "border-box", minWidth: 0 };
  const menuStyle: React.CSSProperties = { position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 50, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(10,10,14,0.96)", backdropFilter: "blur(12px)", boxShadow: "0 24px 80px rgba(0,0,0,0.65)", overflow: "hidden", maxHeight: 260, overflowY: "auto" };
  return (
    <div ref={wrapRef} style={{ position: "relative", minWidth: 0 }}>
      <button type="button" style={btnStyle} disabled={disabled} onClick={() => !disabled && setOpen((v) => !v)}>
        <span style={{ opacity: selected ? 1 : 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected ? selected.label : placeholder}</span>
        <span style={{ opacity: 0.7, fontWeight: 900, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div style={menuStyle}>
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                style={{ width: "100%", textAlign: "left", padding: "10px 12px", cursor: "pointer", background: active ? "rgba(180,120,255,0.18)" : "transparent", border: "none", color: "rgba(255,255,255,0.92)", fontWeight: 850 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = active ? "rgba(180,120,255,0.18)" : "rgba(255,255,255,0.06)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = active ? "rgba(180,120,255,0.18)" : "transparent"; }}
              >{o.label}</button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SuggestInput({ value, onChange, suggestions, placeholder }: {
  value: string; onChange: (v: string) => void; suggestions: string[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (!wrapRef.current) return; if (!wrapRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const filtered = useMemo(() => {
    const current = value.trim().toLowerCase();
    const uniq = new Map<string, string>();
    for (const item of suggestions) { const clean = String(item || "").trim(); if (!clean) continue; uniq.set(clean.toLowerCase(), clean); }
    return Array.from(uniq.values()).filter((item) => { if (!current) return true; return item.toLowerCase().includes(current); }).slice(0, 8);
  }, [suggestions, value]);
  const inputStyle: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", height: 44, padding: "0 12px", borderRadius: 12, outline: "none", width: "100%", boxSizing: "border-box", minWidth: 0 };
  return (
    <div ref={wrapRef} style={{ position: "relative", minWidth: 0 }}>
      <input style={inputStyle} value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={placeholder} />
      {open && filtered.length > 0 ? (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 60, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(10,10,14,0.96)", backdropFilter: "blur(12px)", boxShadow: "0 24px 80px rgba(0,0,0,0.65)", overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
          {filtered.map((item) => (
            <button key={item} type="button" onClick={() => { onChange(item); setOpen(false); }}
              style={{ width: "100%", textAlign: "left", padding: "10px 12px", cursor: "pointer", background: "transparent", border: "none", color: "rgba(255,255,255,0.92)", fontWeight: 850 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >{item}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InterestTags({ values, onChange, suggestions }: {
  values: string[]; onChange: (v: string[]) => void; suggestions: string[];
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (!wrapRef.current) return; if (!wrapRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const current = input.trim().toLowerCase();
    const uniq = new Map<string, string>();
    for (const item of suggestions) { const clean = String(item || "").trim(); if (!clean) continue; uniq.set(clean.toLowerCase(), clean); }
    return Array.from(uniq.values()).filter((item) => {
      if (values.map(v => v.toLowerCase()).includes(item.toLowerCase())) return false;
      if (!current) return true;
      return item.toLowerCase().includes(current);
    }).slice(0, 8);
  }, [suggestions, input, values]);

  function addTag(tag: string) {
    const clean = tag.trim();
    if (!clean) return;
    if (values.map(v => v.toLowerCase()).includes(clean.toLowerCase())) return;
    onChange([...values, clean]);
    setInput("");
    setOpen(true);
  }

  function removeTag(idx: number) { onChange(values.filter((_, i) => i !== idx)); }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); if (input.trim()) addTag(input); }
    if (e.key === "Backspace" && !input && values.length > 0) removeTag(values.length - 1);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "6px 10px", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", minHeight: 44, cursor: "text" }}
        onClick={() => inputRef.current?.focus()}>
        {values.map((v, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(180,120,255,0.18)", border: "1px solid rgba(180,120,255,0.35)", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700, color: "white" }}>
            {v}
            <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(i); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1 }}>✕</button>
          </span>
        ))}
        <input ref={inputRef} value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? "Digite e Enter para adicionar" : "Adicionar mais..."}
          style={{ background: "none", border: "none", outline: "none", color: "white", fontSize: 13, flex: 1, minWidth: 140 }}
        />
      </div>
      {open && (filtered.length > 0 || input.trim()) ? (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 60, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(10,10,14,0.96)", backdropFilter: "blur(12px)", boxShadow: "0 24px 80px rgba(0,0,0,0.65)", overflow: "hidden", maxHeight: 220, overflowY: "auto" }}>
          {input.trim() && !filtered.map(f => f.toLowerCase()).includes(input.trim().toLowerCase()) && (
            <button type="button" onClick={() => addTag(input)} style={{ width: "100%", textAlign: "left", padding: "10px 12px", cursor: "pointer", background: "rgba(180,120,255,0.10)", border: "none", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.92)", fontWeight: 850, fontSize: 13 }}>
              + Criar "{input.trim()}"
            </button>
          )}
          {filtered.map((item) => (
            <button key={item} type="button" onClick={() => addTag(item)}
              style={{ width: "100%", textAlign: "left", padding: "10px 12px", cursor: "pointer", background: "transparent", border: "none", color: "rgba(255,255,255,0.92)", fontWeight: 850, fontSize: 13 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >{item}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function NewLeadPage() {
  const router = useRouter();

  const [stages, setStages] = useState<Stage[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [interestSuggestions, setInterestSuggestions] = useState<string[]>([]);
  const [campaignSuggestions, setCampaignSuggestions] = useState<string[]>([]);
  const [loadingStages, setLoadingStages] = useState(false);

  const [name, setName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState("");
  const [becameClientAt, setBecameClientAt] = useState(todayInputValue());
  const [source, setSource] = useState<string>("instagram");
  const [interests, setInterests] = useState<string[]>([]);
  const [stageId, setStageId] = useState<string>("");
  const [campaign, setCampaign] = useState<string>("");
  const [responsibleId, setResponsibleId] = useState<string>("");
  const [responsibleName, setResponsibleName] = useState<string>("");
  const [nextActionEnabled, setNextActionEnabled] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [nextActionType, setNextActionType] = useState<string>("whatsapp");
  const [nextActionAt, setNextActionAt] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ title?: string; text: string; variant?: "info" | "success" | "error"; actions?: ToastAction[]; } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const sourceOptions = useMemo(() => [
    { value: "instagram", label: "Instagram" }, { value: "google", label: "Google" },
    { value: "site", label: "Site" }, { value: "indicacao", label: "Indicação" },
    { value: "trafego", label: "Tráfego" }, { value: "organico", label: "Orgânico" },
    { value: "outros", label: "Outros" },
  ], []);

  const sexOptions = useMemo(() => [
    { value: "feminino", label: "Feminino" }, { value: "masculino", label: "Masculino" },
  ], []);

  const nextActionTypeOptions = useMemo(() => [
    { value: "whatsapp", label: "WhatsApp" }, { value: "ligacao", label: "Ligação" },
    { value: "avaliacao", label: "Agendar avaliação" }, { value: "retorno", label: "Retorno" },
  ], []);

  const stageOptions = useMemo(() => stages.map((s) => ({ value: s.id, label: s.name })), [stages]);

  function showToast(text: string, opts?: { title?: string; variant?: "info" | "success" | "error"; actions?: ToastAction[]; durationMs?: number; }) {
    const duration = opts?.durationMs ?? 3200;
    setToast({ title: opts?.title, text, variant: opts?.variant ?? "info", actions: opts?.actions });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    const finalDuration = opts?.actions && opts.actions.length > 0 ? 9000 : duration;
    toastTimerRef.current = window.setTimeout(() => setToast(null), finalDuration);
  }

  function closeToast() { if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current); setToast(null); }

  async function fetchInitialData() {
    setLoadingStages(true);
    const [stagesRes, profilesRes, leadsMetaRes, authRes] = await Promise.all([
      supabase.from("stages").select("id,name,position,is_final").order("position", { ascending: true }),
      supabase.from("profiles").select("id,name"),
      supabase.from("leads").select("interest,interests,campaign"),
      supabase.auth.getUser(),
    ]);
    setLoadingStages(false);
    if (stagesRes.error) { showToast(stagesRes.error.message ?? "Erro ao carregar etapas", { title: "Falha ao carregar", variant: "error" }); return; }
    const rows = (stagesRes.data ?? []) as Stage[];
    setStages(rows);
    if (!stageId && rows.length > 0) setStageId(rows[0].id);
    setProfiles((profilesRes.data ?? []) as ProfileOption[]);

    // Coleta sugestões de interests (array) e interest (string legado)
    const allMeta = (leadsMetaRes.data ?? []) as Array<{ interest: string | null; interests: string[] | null; campaign: string | null; }>;
    const allInterestStrings: string[] = [];
    for (const x of allMeta) {
      if (x.interests && x.interests.length > 0) allInterestStrings.push(...x.interests);
      else if (x.interest) allInterestStrings.push(x.interest);
    }
    const uniqueInterests = Array.from(new Map(allInterestStrings.filter(Boolean).map(i => [i.trim().toLowerCase(), i.trim()])).values()).sort((a, b) => a.localeCompare(b));
    setInterestSuggestions(uniqueInterests);

    const uniqueCampaigns = Array.from(new Map(allMeta.map(x => String(x.campaign ?? "").trim()).filter(Boolean).map(item => [item.toLowerCase(), item])).values()).sort((a, b) => a.localeCompare(b));
    setCampaignSuggestions(uniqueCampaigns);

    const authUserId = authRes.data.user?.id ?? "";
    setResponsibleId(authUserId);
    if (authUserId) {
      const found = (profilesRes.data ?? []).find((p: any) => p.id === authUserId);
      setResponsibleName(found?.name?.trim() || authUserId);
    } else { setResponsibleName("Não definido"); }
  }

  useEffect(() => { fetchInitialData(); setTimeout(() => nameRef.current?.focus(), 50); }, []);

  function resetForm() {
    setName(""); setPhoneRaw(""); setCpf(""); setBirthDate(""); setSex("");
    setBecameClientAt(todayInputValue()); setSource("instagram"); setInterests([]);
    setCampaign(""); setNextActionEnabled(false); setNextActionType("whatsapp"); setNextActionAt("");
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  const canSave = useMemo(() => {
    if (saving) return false;
    if (!name.trim()) return false;
    if (!source.trim()) return false;
    if (interests.length === 0) return false;
    if (!stageId) return false;
    const e164 = toE164BR(phoneRaw);
    if (!e164) return false;
    if (nextActionEnabled) { if (!nextActionType) return false; if (!nextActionAt) return false; if (!formatDateToISO(nextActionAt)) return false; }
    return true;
  }, [saving, name, source, interests, stageId, phoneRaw, nextActionEnabled, nextActionType, nextActionAt]);

  async function handleSave() {
    if (saving) return;
    const cleanName = name.trim();
    const phoneE164 = toE164BR(phoneRaw.trim());
    const normalizedCampaign = campaignSuggestions.find(item => item.trim().toLowerCase() === campaign.trim().toLowerCase()) ?? campaign.trim();

    if (!cleanName) return showToast("Preencha o nome.", { variant: "error", title: "Campos obrigatórios" });
    if (!phoneRaw.trim()) return showToast("Preencha o telefone.", { variant: "error", title: "Campos obrigatórios" });
    if (!phoneE164) return showToast("Telefone inválido. Ex: (15) 9xxxx-xxxx", { variant: "error", title: "Telefone" });
    if (!source.trim()) return showToast("Preencha a origem.", { variant: "error", title: "Campos obrigatórios" });
    if (interests.length === 0) return showToast("Adicione pelo menos um interesse.", { variant: "error", title: "Campos obrigatórios" });
    if (!stageId) return showToast("Selecione a etapa.", { variant: "error", title: "Campos obrigatórios" });

    let nextActionPayload: Record<string, any> = {};
    if (nextActionEnabled) {
      if (!nextActionAt) return showToast("Escolha a data da próxima ação.", { variant: "error", title: "Próxima ação" });
      const iso = formatDateToISO(nextActionAt);
      if (!iso) return showToast("Data inválida.", { variant: "error", title: "Próxima ação" });
      nextActionPayload = { next_action_type: nextActionType, next_action_at: iso };
    }

    setSaving(true);
    const payload: Record<string, any> = {
      name: cleanName, phone_raw: phoneRaw.trim(), phone_e164: phoneE164,
      source: source.trim(),
      interest: interests[0], // manter compatibilidade com campo legado
      interests: interests,   // novo campo array
      stage_id: stageId, responsible_id: responsibleId || null, ...nextActionPayload,
    };
    if (normalizedCampaign) payload.campaign = normalizedCampaign;
    if (cpf.trim()) payload.cpf = cpf.trim();
    if (birthDate) payload.birth_date = birthDate;
    if (sex) payload.sex = sex;
    if (becameClientAt) payload.became_client_at = becameClientAt;

    const { error: insertErr } = await supabase.from("leads").insert(payload);
    setSaving(false);

    if (insertErr) {
      showToast(insertErr.message ?? "Erro ao criar lead", { title: "Não consegui criar", variant: "error", durationMs: 6000 });
      return;
    }

    // Salvar observação se preenchida
    if (noteText.trim()) {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id ?? null;
      const { data: newLead } = await supabase.from("leads").select("id").eq("name", cleanName).eq("phone_e164", phoneE164).order("created_at", { ascending: false }).limit(1).single();
      if (newLead?.id) {
        await supabase.from("activities").insert({ lead_id: newLead.id, user_id: userId, type: "note", payload: { text: noteText.trim() } });
      }
    }

    showToast(`Lead criado: ${cleanName}`, {
      title: "Sucesso ✅", variant: "success",
      actions: [
        { label: "Criar outro", variant: "primary", onClick: () => { closeToast(); resetForm(); } },
        { label: "Voltar", variant: "ghost", onClick: () => { closeToast(); router.replace("/leads"); } },
      ],
    });
  }

  const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", borderRadius: 18, padding: 16, boxShadow: "0 24px 80px rgba(0,0,0,0.55)" };
  const inputStyle: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", height: 44, padding: "0 12px", borderRadius: 12, outline: "none", width: "100%", boxSizing: "border-box", minWidth: 0 };
  const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.8, fontWeight: 900, letterSpacing: 0.2 };
  const btn: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", borderRadius: 12, cursor: "pointer", fontWeight: 900 };
  const btnPrimary: React.CSSProperties = { ...btn, border: "1px solid rgba(180,120,255,0.30)", background: "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)" };
  const btnDisabled: React.CSSProperties = { ...btnPrimary, opacity: 0.55, cursor: "not-allowed" };
  const fieldWrap: React.CSSProperties = { display: "grid", gap: 10, minWidth: 0 };

  return (
    <div>
      {toast ? <Toast title={toast.title} text={toast.text} variant={toast.variant} actions={toast.actions} onClose={closeToast} /> : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 0.2 }}>Novo lead</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={chipStyle("muted")}>GIO • CRM</span>
            {loadingStages ? <span style={chipStyle("primary")}>Carregando etapas…</span> : <span style={chipStyle("muted")}>Pronto</span>}
            <span style={chipStyle("muted")}>Responsável: {responsibleName || "Não definido"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.replace("/leads")} style={btn}>Voltar</button>
          <button onClick={handleSave} style={canSave ? btnPrimary : btnDisabled} disabled={!canSave}>{saving ? "Salvando..." : "Criar lead"}</button>
        </div>
      </div>

      <div style={{ height: 14 }} />

      <div style={{ display: "grid", gap: 14, maxWidth: 920 }}>
        <div style={card}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={fieldWrap}>
              <div style={labelStyle}>Nome *</div>
              <input ref={nameRef} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Maria Silva" />
            </div>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 0.85fr) minmax(0, 1fr)" }}>
              <div style={fieldWrap}><div style={labelStyle}>Telefone (BR) *</div><input style={inputStyle} value={phoneRaw} onChange={(e) => setPhoneRaw(e.target.value)} placeholder="Ex: (15) 9xxxx-xxxx" inputMode="tel" /></div>
              <div style={fieldWrap}><div style={labelStyle}>CPF</div><input style={inputStyle} value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="Ex: 000.000.000-00" /></div>
            </div>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              <div style={fieldWrap}><div style={labelStyle}>Data de nascimento</div><input type="date" style={inputStyle} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></div>
              <div style={fieldWrap}><div style={labelStyle}>Sexo</div><Select value={sex} onChange={setSex} placeholder="Selecione..." options={sexOptions} /></div>
              <div style={fieldWrap}><div style={labelStyle}>Cliente desde</div><input type="date" style={inputStyle} value={becameClientAt} onChange={(e) => setBecameClientAt(e.target.value)} /></div>
            </div>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
              <div style={fieldWrap}><div style={labelStyle}>Origem *</div><Select value={source} onChange={setSource} placeholder="Selecione..." options={sourceOptions} /></div>
              <div style={fieldWrap}><div style={labelStyle}>Etapa inicial *</div><Select value={stageId} onChange={setStageId} placeholder={loadingStages ? "Carregando..." : "Selecione..."} options={stageOptions} disabled={loadingStages || stageOptions.length === 0} /></div>
            </div>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
              <div style={fieldWrap}>
                <div style={labelStyle}>Interesses * <span style={{ fontWeight: 400, opacity: 0.6 }}>(pode adicionar vários)</span></div>
                <InterestTags values={interests} onChange={setInterests} suggestions={interestSuggestions} />
              </div>
              <div style={fieldWrap}><div style={labelStyle}>Campanha (opcional)</div><SuggestInput value={campaign} onChange={setCampaign} suggestions={campaignSuggestions} placeholder="Digite ou selecione" /></div>
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.10)", marginTop: 8, paddingTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ fontWeight: 950 }}>Próxima ação (opcional)</div>
                <label style={{ display: "inline-flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={nextActionEnabled} onChange={(e) => setNextActionEnabled(e.target.checked)} style={{ width: 18, height: 18 }} />
                  <span style={{ fontWeight: 900, opacity: 0.9 }}>Ativar</span>
                </label>
              </div>
              {nextActionEnabled ? (
                <div style={{ display: "grid", gap: 12, marginTop: 12, gridTemplateColumns: "1fr 1fr" }}>
                  <div style={fieldWrap}><div style={labelStyle}>Tipo</div><Select value={nextActionType} onChange={setNextActionType} placeholder="Selecione..." options={nextActionTypeOptions} /></div>
                  <div style={fieldWrap}><div style={labelStyle}>Data</div><input type="date" style={inputStyle} value={nextActionAt} onChange={(e) => setNextActionAt(e.target.value)} /></div>
                </div>
              ) : null}
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.10)", marginTop: 8, paddingTop: 12 }}>
              <div style={{ fontWeight: 950, marginBottom: 10 }}>Observação (opcional)</div>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Ex: Cliente pediu para chamar amanhã após 14h..."
                style={{ width: "100%", minHeight: 90, background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12, outline: "none", resize: "vertical", boxSizing: "border-box", fontSize: 13 }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.replace("/leads")} style={btn}>Voltar</button>
          <button onClick={handleSave} style={canSave ? btnPrimary : btnDisabled} disabled={!canSave}>{saving ? "Salvando..." : "Criar lead"}</button>
        </div>
      </div>
    </div>
  );
}
