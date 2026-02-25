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

type ToastAction = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "ghost";
};

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
            {title ? (
              <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>{title}</div>
            ) : null}
            <div style={{ fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" }}>
              {text}
            </div>

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

function formatDatetimeLocalToISO(v: string) {
  try {
    const d = new Date(v);
    return d.toISOString();
  } catch {
    return "";
  }
}

// ✅ Valores permitidos pelo CHECK no Supabase
const SOURCE_OPTIONS = [
  { label: "Google", value: "google" },
  { label: "Instagram", value: "instagram" },
  { label: "Site", value: "site" },
  { label: "Indicação", value: "indicacao" },
  { label: "Tráfego Pago", value: "trafego" },
  { label: "Outros", value: "outros" },
] as const;

type SourceValue = (typeof SOURCE_OPTIONS)[number]["value"];

export default function NewLeadPage() {
  const router = useRouter();

  const [stages, setStages] = useState<Stage[]>([]);
  const [loadingStages, setLoadingStages] = useState(false);

  const [name, setName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [source, setSource] = useState("");
  const [interest, setInterest] = useState("");
  const [stageId, setStageId] = useState<string>("");

  const [nextActionEnabled, setNextActionEnabled] = useState(false);
  const [nextActionType, setNextActionType] = useState<string>("whatsapp");
  const [nextActionAt, setNextActionAt] = useState<string>("");

  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{
    title?: string;
    text: string;
    variant?: "info" | "success" | "error";
    actions?: ToastAction[];
  } | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    fetchStages();
    setTimeout(() => nameRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function resetForm() {
    setName("");
    setPhoneRaw("");
    setSource("instagram"); // ✅ volta pro default seguro
    setInterest("");
    setNextActionEnabled(false);
    setNextActionType("whatsapp");
    setNextActionAt("");
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  const canSave = useMemo(() => {
    if (saving) return false;
    if (!name.trim()) return false;
    if (!interest.trim()) return false;
    if (!stageId) return false;

    const e164 = toE164BR(phoneRaw);
    if (!e164) return false;

    if (nextActionEnabled) {
      if (!nextActionType) return false;
      if (!nextActionAt) return false;
      const iso = formatDatetimeLocalToISO(nextActionAt);
      if (!iso) return false;
    }

    return true;
  }, [saving, name, interest, stageId, phoneRaw, nextActionEnabled, nextActionType, nextActionAt]);

  async function handleSave() {
    if (saving) return;

    const cleanName = name.trim();
    const cleanInterest = interest.trim();
    const cleanPhoneRaw = phoneRaw.trim();
    const phoneE164 = toE164BR(cleanPhoneRaw);

    if (!cleanName)
      return showToast("Preencha o nome.", { variant: "error", title: "Campos obrigatórios" });
    if (!cleanPhoneRaw)
      return showToast("Preencha o telefone.", { variant: "error", title: "Campos obrigatórios" });
    if (!phoneE164)
      return showToast("Telefone inválido. Ex: (15) 9xxxx-xxxx", { variant: "error", title: "Telefone" });
    if (!cleanInterest)
      return showToast("Preencha o interesse.", { variant: "error", title: "Campos obrigatórios" });
    if (!stageId)
      return showToast("Selecione a etapa.", { variant: "error", title: "Campos obrigatórios" });

    let nextActionPayload: { next_action_type?: string; next_action_at?: string } = {};
    if (nextActionEnabled) {
      if (!nextActionAt)
        return showToast("Escolha data/hora da próxima ação.", { variant: "error", title: "Próxima ação" });
      const iso = formatDatetimeLocalToISO(nextActionAt);
      if (!iso) return showToast("Data/hora inválida.", { variant: "error", title: "Próxima ação" });
      nextActionPayload = { next_action_type: nextActionType, next_action_at: iso };
    }

    setSaving(true);

    const { error: insertErr } = await supabase.from("leads").insert({
      name: cleanName,
      phone_raw: cleanPhoneRaw,
      phone_e164: phoneE164,
      source, // ✅ sempre válido pro CHECK
      interest: cleanInterest,
      stage_id: stageId,
      ...nextActionPayload,
    });

    setSaving(false);

    if (insertErr) {
      console.error("insert lead error:", insertErr);
      showToast(insertErr.message ?? "Erro ao criar lead", {
        title: "Não consegui criar",
        variant: "error",
        durationMs: 6000,
      });
      return;
    }

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
  appearance: "none",
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
        <Toast title={toast.title} text={toast.text} variant={toast.variant} actions={toast.actions} onClose={closeToast} />
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
  <div style={labelStyle}>Origem *</div>

<select
  style={{
    ...inputStyle,
    backgroundColor: "#1a1a22",
    color: "#ffffff",
    colorScheme: "dark", // 🔥 ESSA LINHA RESOLVE
  }}
  value={source}
  onChange={(e) => setSource(e.target.value)}
>
  <option value="" disabled>
    Selecione…
  </option>
  <option value="instagram">Instagram</option>
  <option value="google">Google</option>
  <option value="site">Site</option>
  <option value="indicacao">Indicação</option>
  <option value="trafego">Tráfego</option>
  <option value="outros">Outros</option>
</select>
</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/dashboard")} style={btn}>
            Voltar
          </button>
          <button onClick={handleSave} style={canSave ? btnPrimary : btnDisabled} disabled={!canSave}>
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

            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>Telefone (BR) *</div>
              <input
                style={inputStyle}
                value={phoneRaw}
                onChange={(e) => setPhoneRaw(e.target.value)}
                placeholder="Ex: (15) 9xxxx-xxxx"
                inputMode="tel"
              />
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                E.164: <span style={{ fontWeight: 900 }}>{toE164BR(phoneRaw) || "—"}</span>
              </div>
            </div>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={labelStyle}>Origem *</div>

                {/* ✅ select com values válidos pelo CHECK */}
                <select
                  style={inputStyle}
                  value={source}
                  onChange={(e) => setSource(e.target.value as SourceValue)}
                >
                  {SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  O sistema salva o valor padronizado (ex.: <b>instagram</b>, <b>google</b>).
                </div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <div style={labelStyle}>Interesse *</div>
                <input
                  style={inputStyle}
                  value={interest}
                  onChange={(e) => setInterest(e.target.value)}
                  placeholder="Ex: Botox, Depilação, Bioestimulador..."
                />
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>Etapa inicial *</div>
              <select style={inputStyle} value={stageId} onChange={(e) => setStageId(e.target.value)}>
                {stages.length === 0 ? <option value="">Sem etapas</option> : null}
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Dica: por padrão, escolhemos a primeira etapa por posição.
              </div>
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
                    <select style={inputStyle} value={nextActionType} onChange={(e) => setNextActionType(e.target.value)}>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="ligacao">Ligação</option>
                      <option value="avaliacao">Agendar avaliação</option>
                      <option value="retorno">Retorno</option>
                    </select>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={labelStyle}>Data/Hora</div>
                    <input
                      type="datetime-local"
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

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/dashboard")} style={btn}>
            Voltar pro Kanban
          </button>
          <button onClick={handleSave} style={canSave ? btnPrimary : btnDisabled} disabled={!canSave}>
            {saving ? "Salvando..." : "Criar lead"}
          </button>
        </div>
      </div>
    </div>
  );
}