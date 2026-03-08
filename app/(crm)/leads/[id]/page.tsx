"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Stage = { id: string; name: string; position: number; is_final?: boolean };
type ComboOption = { value: string; label: string };

function toE164BR(input: string) {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) {
    const d = digits.replace(/^0+/, "");
    if (d.length === 12 || d.length === 13) return `+${d}`;
    return "";
  }
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return "";
}

function normalizeCpf(input: string) {
  return (input || "").replace(/\D/g, "").slice(0, 11);
}

function formatCpf(input: string) {
  const digits = normalizeCpf(input);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function uniqueNormalizedOptions(values: Array<string | null | undefined>) {
  const map = new Map<string, string>();

  for (const raw of values) {
    const clean = String(raw ?? "").trim();
    if (!clean) continue;

    const key = clean.toLocaleLowerCase("pt-BR");
    if (!map.has(key)) {
      map.set(key, clean);
    }
  }

  return Array.from(map.values())
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((x) => ({ value: x, label: x }));
}

function Select({
  value,
  onChange,
  placeholder = "Selecione…",
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const btnStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    outline: "none",
    width: "100%",
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    opacity: disabled ? 0.6 : 1,
  };

  const menuStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    right: 0,
    zIndex: 50,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(10,10,14,0.96)",
    backdropFilter: "blur(12px)",
    boxShadow: "0 24px 80px rgba(0,0,0,0.65)",
    overflow: "hidden",
    maxHeight: 260,
    overflowY: "auto",
  };

  const itemStyle: React.CSSProperties = {
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    cursor: "pointer",
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 850,
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        style={btnStyle}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span style={{ opacity: selected ? 1 : 0.75 }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ opacity: 0.7, fontWeight: 900 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div style={menuStyle}>
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={{
                  ...itemStyle,
                  background: active ? "rgba(180,120,255,0.18)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = active
                    ? "rgba(180,120,255,0.18)"
                    : "rgba(255,255,255,0.06)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = active
                    ? "rgba(180,120,255,0.18)"
                    : "transparent";
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ComboCreatable({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ComboOption[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    if (!q) return options.slice(0, 8);

    return options
      .filter((o) => o.label.toLocaleLowerCase("pt-BR").includes(q))
      .slice(0, 8);
  }, [options, query]);

  const exactExists = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    if (!q) return false;
    return options.some((o) => o.label.toLocaleLowerCase("pt-BR") === q);
  }, [options, query]);

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    outline: "none",
    width: "100%",
  };

  const menuStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    right: 0,
    zIndex: 50,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(10,10,14,0.96)",
    backdropFilter: "blur(12px)",
    boxShadow: "0 24px 80px rgba(0,0,0,0.65)",
    overflow: "hidden",
    maxHeight: 260,
    overflowY: "auto",
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        style={inputStyle}
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          onChange(v);
          setOpen(true);
        }}
      />

      {open ? (
        <div style={menuStyle}>
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                setQuery(o.label);
                onChange(o.value);
                setOpen(false);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                cursor: "pointer",
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.92)",
                fontWeight: 850,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
              }}
            >
              {o.label}
            </button>
          ))}

          {query.trim() && !exactExists ? (
            <div
              style={{
                padding: "10px 12px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                fontSize: 12,
                opacity: 0.82,
              }}
            >
              Novo valor: <b>{query.trim()}</b>
            </div>
          ) : null}
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
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserName, setCurrentUserName] = useState("");

  const [name, setName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [source, setSource] = useState("instagram");
  const [interest, setInterest] = useState("");
  const [stageId, setStageId] = useState("");
  const [campaign, setCampaign] = useState("");

  const [existingCampaigns, setExistingCampaigns] = useState<ComboOption[]>([]);
  const [existingInterests, setExistingInterests] = useState<ComboOption[]>([]);

  const sourceOptions = useMemo(
    () => [
      { value: "instagram", label: "Instagram" },
      { value: "google", label: "Google" },
      { value: "site", label: "Site" },
      { value: "indicacao", label: "Indicação" },
      { value: "trafego", label: "Tráfego" },
      { value: "outros", label: "Outros" },
    ],
    []
  );

  const stageOptions = useMemo(
    () => stages.map((s) => ({ value: s.id, label: s.name })),
    [stages]
  );

  useEffect(() => {
    if (!leadId) return;
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  async function bootstrap() {
    setLoading(true);
    setErr(null);

    const [{ data: authData }, st, lead, leadsOptions] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("stages").select("id,name,position,is_final").order("position", { ascending: true }),
      supabase
        .from("leads")
        .select("id,name,phone_raw,source,interest,stage_id,campaign,cpf,birth_date")
        .eq("id", leadId)
        .single(),
      supabase.from("leads").select("campaign,interest"),
    ]);

    const anyError = st.error || lead.error || leadsOptions.error;
    if (anyError) {
      setErr(anyError.message ?? "Erro ao carregar lead");
      setLoading(false);
      return;
    }

    const uid = authData.user?.id ?? "";
    setCurrentUserId(uid);

    if (uid) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", uid)
        .maybeSingle();

      setCurrentUserName((profileData as any)?.name ?? "");
    }

    setStages((st.data ?? []) as Stage[]);

    const optionsRows = (leadsOptions.data ?? []) as Array<{
      campaign?: string | null;
      interest?: string | null;
    }>;

    setExistingCampaigns(uniqueNormalizedOptions(optionsRows.map((r) => r.campaign)));
    setExistingInterests(uniqueNormalizedOptions(optionsRows.map((r) => r.interest)));

    const l = lead.data as any;
    setName(l?.name ?? "");
    setPhoneRaw(l?.phone_raw ?? "");
    setSource(l?.source ?? "instagram");
    setInterest(l?.interest ?? "");
    setStageId(l?.stage_id ?? "");
    setCampaign(l?.campaign ?? "");
    setCpf(formatCpf(l?.cpf ?? ""));
    setBirthDate(l?.birth_date ? String(l.birth_date).slice(0, 10) : "");

    setLoading(false);
  }

  const canSave = useMemo(() => {
    if (loading || saving) return false;
    if (!name.trim()) return false;
    if (!interest.trim()) return false;
    if (!source.trim()) return false;
    if (!stageId) return false;
    const e164 = toE164BR(phoneRaw);
    if (!e164) return false;
    if (cpf.trim() && normalizeCpf(cpf).length !== 11) return false;
    return true;
  }, [loading, saving, name, interest, source, stageId, phoneRaw, cpf]);

  async function handleSave() {
    if (!leadId || saving) return;
    setSaving(true);
    setErr(null);

    const cleanName = name.trim();
    const cleanPhoneRaw = phoneRaw.trim();
    const phoneE164 = toE164BR(cleanPhoneRaw);
    const cleanSource = source.trim();
    const cleanInterest = interest.trim();
    const cleanCpf = normalizeCpf(cpf);

    if (!phoneE164) {
      setErr("Telefone inválido. Ex: (15) 9xxxx-xxxx");
      setSaving(false);
      return;
    }

    if (cleanCpf && cleanCpf.length !== 11) {
      setErr("CPF inválido.");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("leads")
      .update({
        name: cleanName,
        phone_raw: cleanPhoneRaw,
        phone_e164: phoneE164,
        cpf: cleanCpf || null,
        birth_date: birthDate || null,
        source: cleanSource,
        interest: cleanInterest,
        stage_id: stageId,
        campaign: campaign.trim() ? campaign.trim() : null,
        responsible_id: currentUserId || null,
      })
      .eq("id", leadId);

    setSaving(false);

    if (error) {
      setErr(error.message ?? "Erro ao salvar");
      return;
    }

    router.refresh();
    router.push("/contatos");
  }

  const card: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
    maxWidth: 920,
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    outline: "none",
    width: "100%",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.8,
    fontWeight: 900,
    letterSpacing: 0.2,
  };

  const btn: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 900,
  };

  const btnPrimary: React.CSSProperties = {
    ...btn,
    border: "1px solid rgba(180,120,255,0.30)",
    background:
      "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.08) 100%)",
  };

  const btnDisabled: React.CSSProperties = { ...btnPrimary, opacity: 0.55, cursor: "not-allowed" };

  return (
    <div style={{ padding: 16, color: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 950 }}>Editar lead</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{leadId}</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.back()} style={btn}>
            Voltar
          </button>
          <button onClick={handleSave} style={canSave ? btnPrimary : btnDisabled} disabled={!canSave}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      <div style={{ height: 14 }} />

      <div style={card}>
        {loading ? <div style={{ opacity: 0.8 }}>Carregando...</div> : null}
        {err ? <div style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 10 }}>{err}</div> : null}

        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={labelStyle}>Nome *</div>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>Telefone (BR) *</div>
              <input style={inputStyle} value={phoneRaw} onChange={(e) => setPhoneRaw(e.target.value)} />
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>CPF</div>
              <input
                style={inputStyle}
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
                placeholder="000.000.000-00"
                inputMode="numeric"
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>Data de nascimento</div>
              <input
                type="date"
                style={inputStyle}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>Responsável</div>
              <input
                style={{
                  ...inputStyle,
                  opacity: 0.82,
                  cursor: "not-allowed",
                }}
                value={currentUserName || currentUserId || "Usuário logado"}
                readOnly
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>Origem *</div>
              <Select value={source} onChange={setSource} options={sourceOptions} />
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>Interesse *</div>
              <ComboCreatable
                value={interest}
                onChange={setInterest}
                options={existingInterests}
                placeholder="Ex: Botox, Depilação, Bioestimulador..."
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={labelStyle}>Campanha (opcional)</div>
            <ComboCreatable
              value={campaign}
              onChange={setCampaign}
              options={existingCampaigns}
              placeholder="Ex: MARÇO - LASER PERNAS"
            />
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={labelStyle}>Etapa atual *</div>
            <Select value={stageId} onChange={setStageId} options={stageOptions} disabled={stages.length === 0} />
          </div>
        </div>
      </div>
    </div>
  );
}