"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Stage = {
  id: string;
  name: string;
  position: number;
  is_final?: boolean;
};

type ToastAction = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "ghost";
};

type ComboOption = {
  value: string;
  label: string;
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

function Toast({
  title,
  text,
  variant = "info",
  actions,
  onClose,
}: {
  title?: string;
  text: string;
  variant?: "info" | "success" | "error";
  actions?: ToastAction[];
  onClose: () => void;
}) {
  const border =
    variant === "success"
      ? "1px solid rgba(120,255,180,0.26)"
      : variant === "error"
      ? "1px solid rgba(255,120,160,0.30)"
      : "1px solid rgba(180,120,255,0.18)";

  const glow =
    variant === "success"
      ? "rgba(120,255,180,0.18)"
      : variant === "error"
      ? "rgba(255,120,160,0.20)"
      : "rgba(180,120,255,0.16)";

  const leftBar =
    variant === "success"
      ? "rgba(120,255,180,0.92)"
      : variant === "error"
      ? "rgba(255,120,160,0.92)"
      : "rgba(180,120,255,0.92)";

  const btnBase: React.CSSProperties = {
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    padding: "9px 10px",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 12,
  };

  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    border: "1px solid rgba(180,120,255,0.28)",
    background:
      "linear-gradient(180deg, rgba(180,120,255,0.20) 0%, rgba(180,120,255,0.08) 100%)",
  };

  const btnGhost: React.CSSProperties = {
    ...btnBase,
    background: "rgba(255,255,255,0.04)",
  };

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 18,
        transform: "translateX(-50%)",
        zIndex: 10000,
        width: "min(760px, 92vw)",
      }}
      role="status"
      aria-live="polite"
    >
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 18,
          border,
          background: "rgba(10,10,14,0.84)",
          backdropFilter: "blur(12px)",
          boxShadow: `0 30px 90px rgba(0,0,0,0.70), 0 0 0 1px ${glow} inset`,
          padding: 14,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            background: leftBar,
            opacity: 0.85,
          }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            {title ? <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>{title}</div> : null}
            <div style={{ fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" }}>{text}</div>

            {actions && actions.length > 0 ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                {actions.map((a, idx) => (
                  <button
                    key={idx}
                    onClick={a.onClick}
                    style={a.variant === "ghost" ? btnGhost : btnPrimary}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            onClick={onClose}
            style={{
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.88)",
              padding: "8px 10px",
              fontWeight: 900,
              cursor: "pointer",
              height: 36,
              alignSelf: "flex-start",
            }}
            title="Fechar"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function toE164BR(input: string) {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("55")) {
    const d = digits.replace(/^0+/, "");
    if (d.length === 12 || d.length === 13) return `+${d}`;
    return "";
  }

  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

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

function formatDateToISO(v: string) {
  try {
    if (!v) return "";
    const d = new Date(`${v}T12:00:00`);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString();
  } catch {
    return "";
  }
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

export default function NewLeadPage() {
  const router = useRouter();

  const [stages, setStages] = useState<Stage[]>([]);
  const [loadingStages, setLoadingStages] = useState(false);

  const [name, setName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");

  const [source, setSource] = useState<string>("instagram");
  const [interest, setInterest] = useState("");
  const [stageId, setStageId] = useState<string>("");

  const [campaign, setCampaign] = useState<string>("");

  const [existingCampaigns, setExistingCampaigns] = useState<ComboOption[]>([]);
  const [existingInterests, setExistingInterests] = useState<ComboOption[]>([]);

  const [nextActionEnabled, setNextActionEnabled] = useState(false);
  const [nextActionType, setNextActionType] = useState<string>("whatsapp");
  const [nextActionAt, setNextActionAt] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserName, setCurrentUserName] = useState<string>("");

  const [toast, setToast] = useState<{
    title?: string;
    text: string;
    variant?: "info" | "success" | "error";
    actions?: ToastAction[];
  } | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

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

  function showToast(
    text: string,
    opts?: {
      title?: string;
      variant?: "info" | "success" | "error";
      actions?: ToastAction[];
      durationMs?: number;
    }
  ) {
    const duration = opts?.durationMs ?? 3200;

    setToast({
      title: opts?.title,
      text,
      variant: opts?.variant ?? "info",
      actions: opts?.actions,
    });

    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);

    const finalDuration = opts?.actions && opts.actions.length > 0 ? 9000 : duration;
    toastTimerRef.current = window.setTimeout(() => setToast(null), finalDuration);
  }

  function closeToast() {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(null);
  }

  async function fetchCurrentUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error("auth user error:", error);
      return;
    }

    const uid = data.user?.id ?? "";
    setCurrentUserId(uid);

    if (!uid) return;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", uid)
      .maybeSingle();

    setCurrentUserName((profileData as any)?.name ?? "");
  }

  async function fetchStages() {
    setLoadingStages(true);

    const { data, error: err } = await supabase
      .from("stages")
      .select("id,name,position,is_final")
      .order("position", { ascending: true });

    setLoadingStages(false);

    if (err) {
      console.error("stages error:", err);
      showToast(err.message ?? "Erro ao carregar etapas", {
        title: "Falha ao carregar",
        variant: "error",
      });
      return;
    }

    const rows = (data ?? []) as Stage[];
    setStages(rows);

    if (!stageId && rows.length > 0) setStageId(rows[0].id);
  }

  async function fetchExistingOptions() {
    const { data, error } = await supabase
      .from("leads")
      .select("campaign, interest");

    if (error) {
      console.error("fetch leads options error:", error);
      return;
    }

    const rows = (data ?? []) as Array<{ campaign?: string | null; interest?: string | null }>;

    setExistingCampaigns(uniqueNormalizedOptions(rows.map((r) => r.campaign)));
    setExistingInterests(uniqueNormalizedOptions(rows.map((r) => r.interest)));
  }

  useEffect(() => {
    fetchStages();
    fetchCurrentUser();
    fetchExistingOptions();
    setTimeout(() => nameRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setName("");
    setPhoneRaw("");
    setCpf("");
    setBirthDate("");
    setSource("instagram");
    setInterest("");
    setCampaign("");
    setNextActionEnabled(false);
    setNextActionType("whatsapp");
    setNextActionAt("");
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  const canSave = useMemo(() => {
    if (saving) return false;
    if (!name.trim()) return false;
    if (!source.trim()) return false;
    if (!interest.trim()) return false;
    if (!stageId) return false;

    const e164 = toE164BR(phoneRaw);
    if (!e164) return false;

    if (cpf.trim() && normalizeCpf(cpf).length !== 11) return false;

    if (nextActionEnabled) {
      if (!nextActionType) return false;
      if (!nextActionAt) return false;

      const iso = formatDateToISO(nextActionAt);
      if (!iso) return false;
    }

    return true;
  }, [
    saving,
    name,
    source,
    interest,
    stageId,
    phoneRaw,
    cpf,
    nextActionEnabled,
    nextActionType,
    nextActionAt,
  ]);

  async function handleSave() {
    if (saving) return;

    const cleanName = name.trim();
    const cleanSource = source.trim();
    const cleanInterest = interest.trim();
    const cleanPhoneRaw = phoneRaw.trim();
    const phoneE164 = toE164BR(cleanPhoneRaw);
    const cleanCpf = normalizeCpf(cpf);

    const cleanCampaign = campaign.trim();

    if (!cleanName) {
      return showToast("Preencha o nome.", {
        variant: "error",
        title: "Campos obrigatórios",
      });
    }

    if (!cleanPhoneRaw) {
      return showToast("Preencha o telefone.", {
        variant: "error",
        title: "Campos obrigatórios",
      });
    }

    if (!phoneE164) {
      return showToast("Telefone inválido. Ex: (15) 9xxxx-xxxx", {
        variant: "error",
        title: "Telefone",
      });
    }

    if (cleanCpf && cleanCpf.length !== 11) {
      return showToast("CPF inválido.", {
        variant: "error",
        title: "CPF",
      });
    }

    if (!cleanSource) {
      return showToast("Preencha a origem.", {
        variant: "error",
        title: "Campos obrigatórios",
      });
    }

    if (!cleanInterest) {
      return showToast("Preencha o interesse.", {
        variant: "error",
        title: "Campos obrigatórios",
      });
    }

    if (!stageId) {
      return showToast("Selecione a etapa.", {
        variant: "error",
        title: "Campos obrigatórios",
      });
    }

    let nextActionPayload: Record<string, any> = {};

    if (nextActionEnabled) {
      if (!nextActionAt) {
        return showToast("Escolha a data da próxima ação.", {
          variant: "error",
          title: "Próxima ação",
        });
      }

      const iso = formatDateToISO(nextActionAt);

      if (!iso) {
        return showToast("Data inválida.", {
          variant: "error",
          title: "Próxima ação",
        });
      }

      nextActionPayload = {
        next_action_type: nextActionType,
        next_action_at: iso,
      };
    }

    setSaving(true);

    const payload: Record<string, any> = {
      name: cleanName,
      phone_raw: cleanPhoneRaw,
      phone_e164: phoneE164,
      cpf: cleanCpf || null,
      birth_date: birthDate || null,
      source: cleanSource,
      interest: cleanInterest,
      stage_id: stageId,
      responsible_id: currentUserId || null,
      ...nextActionPayload,
    };

    if (cleanCampaign) payload.campaign = cleanCampaign;

    const { error: insertErr } = await supabase.from("leads").insert(payload);

    setSaving(false);

    if (insertErr) {
      console.error("insert lead error:", JSON.stringify(insertErr, null, 2));
      showToast(insertErr.message ?? "Erro ao criar lead (RLS/policy?)", {
        title: "Não consegui criar",
        variant: "error",
        durationMs: 6000,
      });
      return;
    }

    await fetchExistingOptions();

    showToast(`Lead criado: ${cleanName}`, {
      title: "Sucesso ✅",
      variant: "success",
      actions: [
        {
          label: "Criar outro",
          variant: "primary",
          onClick: () => {
            closeToast();
            resetForm();
          },
        },
        {
          label: "Ir para Kanban",
          variant: "ghost",
          onClick: () => {
            closeToast();
            router.push("/dashboard");
            router.refresh();
          },
        },
      ],
    });

    resetForm();
  }

  const card: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
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

  const btnDisabled: React.CSSProperties = {
    ...btnPrimary,
    opacity: 0.55,
    cursor: "not-allowed",
  };

  return (
    <div>
      {toast ? (
        <Toast
          title={toast.title}
          text={toast.text}
          variant={toast.variant}
          actions={toast.actions}
          onClose={closeToast}
        />
      ) : null}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 0.2 }}>Novo lead</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={chipStyle("muted")}>GIO • CRM</span>
            {loadingStages ? (
              <span style={chipStyle("primary")}>Carregando etapas…</span>
            ) : (
              <span style={chipStyle("muted")}>Pronto</span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/dashboard")} style={btn}>
            Voltar
          </button>
          <button
            onClick={handleSave}
            style={canSave ? btnPrimary : btnDisabled}
            disabled={!canSave}
          >
            {saving ? "Salvando..." : "Criar lead"}
          </button>
        </div>
      </div>

      <div style={{ height: 14 }} />

      <div style={{ display: "grid", gap: 14, maxWidth: 920 }}>
        <div style={card}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>Nome *</div>
              <input
                ref={nameRef}
                style={inputStyle}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Maria Silva"
              />
            </div>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={labelStyle}>Telefone (BR) *</div>
                <input
                  style={inputStyle}
                  value={phoneRaw}
                  onChange={(e) => setPhoneRaw(e.target.value)}
                  placeholder="Ex: (15) 9xxxx-xxxx"
                  inputMode="tel"
                />
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
                <Select
                  value={source}
                  onChange={setSource}
                  placeholder="Selecione…"
                  options={sourceOptions}
                />
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
              <div style={labelStyle}>Etapa inicial *</div>
              <Select
                value={stageId}
                onChange={setStageId}
                placeholder={loadingStages ? "Carregando…" : "Selecione…"}
                options={stageOptions}
                disabled={loadingStages || stageOptions.length === 0}
              />
            </div>

            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.10)",
                marginTop: 8,
                paddingTop: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 950 }}>Próxima ação (opcional)</div>

                <label
                  style={{
                    display: "inline-flex",
                    gap: 10,
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={nextActionEnabled}
                    onChange={(e) => setNextActionEnabled(e.target.checked)}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ fontWeight: 900, opacity: 0.9 }}>Ativar</span>
                </label>
              </div>

              {nextActionEnabled ? (
                <div
                  style={{
                    display: "grid",
                    gap: 12,
                    marginTop: 12,
                    gridTemplateColumns: "1fr 1fr",
                  }}
                >
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={labelStyle}>Tipo</div>
                    <select
                      style={inputStyle}
                      value={nextActionType}
                      onChange={(e) => setNextActionType(e.target.value)}
                    >
                      <option value="whatsapp">WhatsApp</option>
                      <option value="ligacao">Ligação</option>
                      <option value="avaliacao">Agendar avaliação</option>
                      <option value="retorno">Retorno</option>
                    </select>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={labelStyle}>Data</div>
                    <input
                      type="date"
                      style={inputStyle}
                      value={nextActionAt}
                      onChange={(e) => setNextActionAt(e.target.value)}
                    />
                  </div>

                  <div style={{ gridColumn: "1 / -1", fontSize: 12, opacity: 0.75 }}>
                    Se você preencher a próxima ação no INSERT, seu trigger deve registrar{" "}
                    <span style={{ fontWeight: 900 }}>next_action_set</span> automaticamente.
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button onClick={() => router.push("/dashboard")} style={btn}>
            Voltar pro Kanban
          </button>
          <button
            onClick={handleSave}
            style={canSave ? btnPrimary : btnDisabled}
            disabled={!canSave}
          >
            {saving ? "Salvando..." : "Criar lead"}
          </button>
        </div>
      </div>
    </div>
  );
}