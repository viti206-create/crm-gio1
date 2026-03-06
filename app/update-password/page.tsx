"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function UpdatePasswordPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
        setErrorText("");
        return;
      }

      if (session) {
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        console.error("getSession error:", error);
      }

      if (data.session) {
        setReady(true);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const canSave = useMemo(() => {
    if (!ready || saving) return false;
    if (!password.trim()) return false;
    if (!confirmPassword.trim()) return false;
    if (password !== confirmPassword) return false;
    if (password.length < 6) return false;
    return true;
  }, [ready, saving, password, confirmPassword]);

  async function handleSave() {
    if (!canSave) return;

    setSaving(true);
    setMessage("");
    setErrorText("");

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setSaving(false);

    if (error) {
      console.error("updateUser error:", error);
      setErrorText(error.message ?? "Não foi possível atualizar a senha.");
      return;
    }

    setMessage("Senha atualizada com sucesso. Redirecionando...");
    setTimeout(() => {
      router.push("/login");
    }, 1200);
  }

  const page: React.CSSProperties = {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 20,
    background:
      "radial-gradient(1000px 600px at 20% 10%, rgba(180,120,255,0.18), transparent 60%), linear-gradient(180deg, #09070c 0%, #050408 100%)",
    color: "white",
  };

  const card: React.CSSProperties = {
    width: "100%",
    maxWidth: 460,
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
    padding: 20,
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "12px 14px",
    borderRadius: 12,
    outline: "none",
    width: "100%",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.82,
    fontWeight: 900,
    letterSpacing: 0.2,
  };

  const btn: React.CSSProperties = {
    width: "100%",
    background:
      "linear-gradient(180deg, rgba(180,120,255,0.20) 0%, rgba(180,120,255,0.08) 100%)",
    color: "white",
    border: "1px solid rgba(180,120,255,0.30)",
    padding: "12px 14px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 900,
  };

  const btnDisabled: React.CSSProperties = {
    ...btn,
    opacity: 0.55,
    cursor: "not-allowed",
  };

  return (
    <div style={page}>
      <div style={card}>
        <div style={{ display: "grid", gap: 6, marginBottom: 18 }}>
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: 0.2 }}>
            Nova senha
          </div>
          <div style={{ fontSize: 13, opacity: 0.78 }}>
            Defina sua nova senha para continuar.
          </div>
        </div>

        {!ready ? (
          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              padding: 14,
              fontSize: 14,
              opacity: 0.9,
            }}
          >
            Validando o link de recuperação...
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={labelStyle}>Nova senha</div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite a nova senha"
                style={inputStyle}
              />
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={labelStyle}>Confirmar nova senha</div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Digite novamente"
                style={inputStyle}
              />
            </div>

            <div style={{ fontSize: 12, opacity: 0.72 }}>
              A senha deve ter pelo menos 6 caracteres.
            </div>

            {password && confirmPassword && password !== confirmPassword ? (
              <div
                style={{
                  fontSize: 12,
                  color: "#ff9ab8",
                  fontWeight: 800,
                }}
              >
                As senhas não coincidem.
              </div>
            ) : null}

            {errorText ? (
              <div
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(255,120,160,0.30)",
                  background: "rgba(255,120,160,0.10)",
                  color: "rgba(255,220,230,0.95)",
                  padding: "10px 12px",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {errorText}
              </div>
            ) : null}

            {message ? (
              <div
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(120,255,180,0.26)",
                  background: "rgba(120,255,180,0.10)",
                  color: "rgba(220,255,235,0.95)",
                  padding: "10px 12px",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {message}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              style={canSave ? btn : btnDisabled}
            >
              {saving ? "Salvando..." : "Salvar nova senha"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}