"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Stage = { id: string; name: string; position: number; is_final?: boolean; };
type ProfileOption = { id: string; name: string | null; };

function toE164BR(input: string) {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) { const d = digits.replace(/^0+/, ""); if (d.length === 12 || d.length === 13) return `+${d}`; return ""; }
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return "";
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
  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button type="button" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.92)", border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", borderRadius: 12, outline: "none", width: "100%", cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, opacity: disabled ? 0.6 : 1 }} disabled={disabled} onClick={() => !disabled && setOpen((v) => !v)}>
        <span style={{ opacity: selected ? 1 : 0.75 }}>{selected ? selected.label : placeholder}</span>
        <span style={{ opacity: 0.7, fontWeight: 900 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 50, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(10,10,14,0.96)", backdropFilter: "blur(12px)", boxShadow: "0 24px 80px rgba(0,0,0,0.65)", overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
          {options.map((o) => { const active = o.value === value; return (
            <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
              style={{ width: "100%", textAlign: "left", padding: "10px 12px", cursor: "pointer", background: active ? "rgba(180,120,255,0.18)" : "transparent", border: "none", color: "rgba(255,255,255,0.92)", fontWeight: 850 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = active ? "rgba(180,120,255,0.18)" : "rgba(255,255,255,0.06)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = active ? "rgba(180,120,255,0.18)" : "transparent"; }}
            >{o.label}</button>
          ); })}
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
    setInput(""); setOpen(true);
  }

  function removeTag(idx: number) { onChange(values.filter((_, i) => i !== idx)); }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); if (input.trim()) addTag(input); }
    if (e.key === "Backspace" && !input && values.length > 0) removeTag(values.length - 1);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "6px 10px", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", minHeight: 44, cursor: "text" }} onClick={() => inputRef.current?.focus()}>
        {values.map((v, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(180,120,255,0.18)", border: "1px solid rgba(180,120,255,0.35)", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700, color: "white" }}>
            {v}
            <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(i); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1 }}>✕</button>
          </span>
        ))}
        <input ref={inputRef} value={input} onChange={(e) => { setInput(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? "Digite e Enter para adicionar" : "Adicionar mais..."}
          style={{ background: "none", border: "none", outline: "none", color: "white", fontSize: 13, flex: 1, minWidth: 140 }} />
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

export default function EditLeadPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const leadId = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [interestSuggestions, setInterestSuggestions] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState("");
  const [source, setSource] = useState("instagram");
  const [interests, setInterests] = useState<string[]>([]);
  const [stageId, setStageId] = useState("");
  const [campaign, setCampaign] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [responsibleName, setResponsibleName] = useState("");

  const sourceOptions = useMemo(() => [
    { value: "instagram", label: "Instagram" }, { value: "google", label: "Google" },
    { value: "site", label: "Site" }, { value: "indicacao", label: "Indicação" },
    { value: "trafego", label: "Tráfego" }, { value: "organico", label: "Orgânico" },
    { value: "outros", label: "Outros" },
  ], []);

  const sexOptions = useMemo(() => [
    { value: "feminino", label: "Feminino" }, { value: "masculino", label: "Masculino" },
  ], []);

  const stageOptions = useMemo(() => stages.map((s) => ({ value: s.id, label: s.name })), [stages]);

  useEffect(() => { if (leadId) void bootstrap(); }, [leadId]);

  useEffect(() => {
    if (!responsibleId) { setResponsibleName("Não definido"); return; }
    const found = profiles.find((p) => p.id === responsibleId);
    setResponsibleName(found?.name?.trim() || responsibleId);
  }, [profiles, responsibleId]);

  async function bootstrap() {
    setLoading(true); setErr(null);
    const [st, lead, prof, interestsRes] = await Promise.all([
      supabase.from("stages").select("id,name,position,is_final").order("position", { ascending: true }),
      supabase.from("leads").select("id,name,phone_raw,source,interest,interests,stage_id,campaign,responsible_id,cpf,birth_date,sex").eq("id", leadId).single(),
      supabase.from("profiles").select("id,name"),
      supabase.from("leads").select("interest,interests").not("interest", "is", null),
    ]);

    if (st.error || lead.error) { setErr((st.error || lead.error)?.message ?? "Erro ao carregar"); setLoading(false); return; }

    setStages((st.data ?? []) as Stage[]);
    setProfiles((prof.data ?? []) as ProfileOption[]);

    const l = lead.data as any;
    setName(l?.name ?? "");
    setPhoneRaw(l?.phone_raw ?? "");
    setCpf(l?.cpf ?? "");
    setBirthDate(l?.birth_date ?? "");
    setSex(l?.sex ?? "");
    setSource(l?.source ?? "instagram");
    setStageId(l?.stage_id ?? "");
    setCampaign(l?.campaign ?? "");
    setResponsibleId(l?.responsible_id ?? "");

    // Carregar interesses: preferir array, fallback para string legada
    if (l?.interests && l.interests.length > 0) setInterests(l.interests);
    else if (l?.interest) setInterests([l.interest]);
    else setInterests([]);

    // Sugestões de todos os leads
    const allMeta = (interestsRes.data ?? []) as Array<{ interest: string | null; interests: string[] | null }>;
    const allStrings: string[] = [];
    for (const x of allMeta) {
      if (x.interests && x.interests.length > 0) allStrings.push(...x.interests);
      else if (x.interest) allStrings.push(x.interest);
    }
    const uniqueInterests = Array.from(new Map(allStrings.filter(Boolean).map(i => [i.trim().toLowerCase(), i.trim()])).values()).sort((a, b) => a.localeCompare(b));
    setInterestSuggestions(uniqueInterests);
    setLoading(false);
  }

  const canSave = useMemo(() => {
    if (loading || saving) return false;
    if (!name.trim()) return false;
    if (interests.length === 0) return false;
    if (!source.trim()) return false;
    if (!stageId) return false;
    return !!toE164BR(phoneRaw);
  }, [loading, saving, name, interests, source, stageId, phoneRaw]);

  async function handleSave() {
    if (!leadId || saving) return;
    setSaving(true); setErr(null);
    const phoneE164 = toE164BR(phoneRaw.trim());
    if (!phoneE164) { setErr("Telefone inválido. Ex: (15) 9xxxx-xxxx"); setSaving(false); return; }

    const { error } = await supabase.from("leads").update({
      name: name.trim(), phone_raw: phoneRaw.trim(), phone_e164: phoneE164,
      cpf: cpf.trim() ? cpf.trim() : null, birth_date: birthDate || null, sex: sex || null,
      source: source.trim(),
      interest: interests[0] ?? null,  // manter compatibilidade legada
      interests: interests,             // novo campo array
      stage_id: stageId,
      campaign: campaign.trim() ? campaign.trim() : null,
    }).eq("id", leadId);

    setSaving(false);
    if (error) { setErr(error.message ?? "Erro ao salvar"); return; }
    router.replace("/leads");
  }

  const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", borderRadius: 18, padding: 16, boxShadow: "0 24px 80px rgba(0,0,0,0.55)", maxWidth: 920 };
  const inputStyle: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", borderRadius: 12, outline: "none", width: "100%" };
  const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.8, fontWeight: 900, letterSpacing: 0.2 };
  const btn: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", borderRadius: 12, cursor: "pointer", fontWeight: 900 };
  const btnPrimary: React.CSSProperties = { ...btn, border: "1px solid rgba(180,120,255,0.30)", background: "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)" };
  const btnDisabled: React.CSSProperties = { ...btnPrimary, opacity: 0.55, cursor: "not-allowed" };
  const smallLockedStyle: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "10px 12px", borderRadius: 12, minHeight: 42, display: "inline-flex", alignItems: "center", fontWeight: 900, width: "fit-content", minWidth: 160 };

  return (
    <div style={{ padding: 16, color: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 950 }}>Editar lead</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{leadId}</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.replace("/leads")} style={btn}>Voltar</button>
          <button onClick={handleSave} style={canSave ? btnPrimary : btnDisabled} disabled={!canSave}>{saving ? "Salvando..." : "Salvar"}</button>
        </div>
      </div>

      <div style={{ height: 14 }} />

      <div style={card}>
        {loading ? <div style={{ opacity: 0.8 }}>Carregando...</div> : null}
        {err ? <div style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 10 }}>{err}</div> : null}

        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 10 }}><div style={labelStyle}>Nome *</div><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div style={{ display: "grid", gap: 10 }}><div style={labelStyle}>Telefone (BR) *</div><input style={inputStyle} value={phoneRaw} onChange={(e) => setPhoneRaw(e.target.value)} /></div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ display: "grid", gap: 10 }}><div style={labelStyle}>CPF</div><input style={inputStyle} value={cpf} onChange={(e) => setCpf(e.target.value)} /></div>
            <div style={{ display: "grid", gap: 10 }}><div style={labelStyle}>Data de nascimento</div><input type="date" style={inputStyle} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ display: "grid", gap: 10 }}><div style={labelStyle}>Sexo</div><Select value={sex} onChange={setSex} options={sexOptions} placeholder="Selecione…" /></div>
            <div style={{ display: "grid", gap: 10 }}><div style={labelStyle}>Origem *</div><Select value={source} onChange={setSource} options={sourceOptions} /></div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>Interesses * <span style={{ fontWeight: 400, opacity: 0.6 }}>(pode adicionar vários)</span></div>
              <InterestTags values={interests} onChange={setInterests} suggestions={interestSuggestions} />
            </div>
            <div style={{ display: "grid", gap: 10 }}><div style={labelStyle}>Campanha (opcional)</div><input style={inputStyle} value={campaign} onChange={(e) => setCampaign(e.target.value)} /></div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "220px 1fr", alignItems: "end" }}>
            <div style={{ display: "grid", gap: 10 }}><div style={labelStyle}>Responsável</div><div style={smallLockedStyle}>{responsibleName || "Não definido"}</div></div>
            <div style={{ display: "grid", gap: 10 }}><div style={labelStyle}>Etapa atual *</div><Select value={stageId} onChange={setStageId} options={stageOptions} disabled={stages.length === 0} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
