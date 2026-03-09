"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Stage = { id: string; name: string; position: number; is_final?: boolean };

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

export default function EditLeadPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const leadId = params?.id;

  const rawReturnTo = searchParams.get("returnTo") || "";
  const safeReturnTo =
    rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
      ? rawReturnTo
      : "/contatos";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [stages, setStages] = useState<Stage[]>([]);

  const [name, setName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState("");
  const [source, setSource] = useState("instagram");
  const [interest, setInterest] = useState("");
  const [stageId, setStageId] = useState("");
  const [campaign, setCampaign] = useState("");
  const [responsibleId, setResponsibleId] = useState("");

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

  const sexOptions = useMemo(
    () => [
      { value: "feminino", label: "Feminino" },
      { value: "masculino", label: "Masculino" },
    ],
    []
  );

  const stageOptions = useMemo(
    () => stages.map((s) => ({ value: s.id, label: s.name })),
    [stages]
  );

  function goBackToOrigin() {
    router.push(safeReturnTo);
    router.refresh();
  }

  useEffect(() => {
    if (!leadId) return;
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  async function bootstrap() {
    setLoading(true);
    setErr(null);

    const [st, lead] = await Promise.all([
      supabase.from("stages").select("id,name,position,is_final").order("position", { ascending: true }),
      supabase
        .from("leads")
        .select("id,name,phone_raw,source,interest,stage_id,campaign,responsible_id,cpf,birth_date,sex")
        .eq("id", leadId)
        .single(),
    ]);

    const anyError = st.error || lead.error;
    if (anyError) {
      setErr(anyError.message ?? "Erro ao carregar lead");
      setLoading(false);
      return;
    }

    setStages((st.data ?? []) as Stage[]);

    const l = lead.data as any;
    setName(l?.name ?? "");
    setPhoneRaw(l?.phone_raw ?? "");
    setCpf(l?.cpf ?? "");
    setBirthDate(l?.birth_date ?? "");
    setSex(l?.sex ?? "");
    setSource(l?.source ?? "instagram");
    setInterest(l?.interest ?? "");
    setStageId(l?.stage_id ?? "");
    setCampaign(l?.campaign ?? "");
    setResponsibleId(l?.responsible_id ?? "");

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
    return true;
  }, [loading, saving, name, interest, source, stageId, phoneRaw]);

  async function handleSave() {
    if (!leadId || saving) return;
    setSaving(true);
    setErr(null);

    const cleanName = name.trim();
    const cleanPhoneRaw = phoneRaw.trim();
    const phoneE164 = toE164BR(cleanPhoneRaw);
    const cleanSource = source.trim();
    const cleanInterest = interest.trim();

    if (!phoneE164) {
      setErr("Telefone inválido. Ex: (15) 9xxxx-xxxx");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("leads")
      .update({
        name: cleanName,
        phone_raw: cleanPhoneRaw,
        phone_e164: phoneE164,
        cpf: cpf.trim() ? cpf.trim() : null,
        birth_date: birthDate || null,
        sex: sex || null,
        source: cleanSource,
        interest: cleanInterest,
        stage_id: stageId,
        campaign: campaign.trim() ? campaign.trim() : null,
      })
      .eq("id", leadId);

    setSaving(false);

    if (error) {
      setErr(error.message ?? "Erro ao salvar");
      return;
    }

    goBackToOrigin();
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
          <button onClick={goBackToOrigin} style={btn}>
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

          <div style={{ display: "grid", gap: 10 }}>
            <div style={labelStyle}>Telefone (BR) *</div>
            <input style={inputStyle} value={phoneRaw} onChange={(e) => setPhoneRaw(e.target.value)} />
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>CPF</div>
              <input style={inputStyle} value={cpf} onChange={(e) => setCpf(e.target.value)} />
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>Data de nascimento</div>
              <input
                type="date"
                style={inputStyle}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>Sexo</div>
              <Select
                value={sex}
                onChange={setSex}
                options={sexOptions}
                placeholder="Selecione…"
              />
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>Origem *</div>
              <Select value={source} onChange={setSource} options={sourceOptions} />
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>Interesse *</div>
              <input style={inputStyle} value={interest} onChange={(e) => setInterest(e.target.value)} />
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>Campanha (opcional)</div>
              <input style={inputStyle} value={campaign} onChange={(e) => setCampaign(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={labelStyle}>Responsável</div>
            <input
              style={{ ...inputStyle, opacity: 0.75 }}
              value={responsibleId || "Não definido"}
              readOnly
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