"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!error && user) {
        router.replace("/home");
        return;
      }

      setCheckingSession(false);
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleLogin() {
    if (saving) return;

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setErrorText("Informe email e senha.");
      return;
    }

    setSaving(true);
    setErrorText("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (error) {
        setErrorText("Email ou senha inválidos.");
        return;
      }

      router.replace("/home");
      router.refresh();
    } catch (err) {
      console.error("login unexpected error:", err);
      setErrorText("Não foi possível entrar.");
    } finally {
      setSaving(false);
    }
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

  const canLogin = !!email.trim() && !!password.trim() && !saving;

  if (checkingSession) {
    return (
      <div style={page}>
        <div style={{ opacity: 0.8 }}>Carregando...</div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={card}>
        <div
          style={{
            display: "grid",
            gap: 10,
            marginBottom: 18,
            justifyItems: "center",
          }}
        >
          <img
            src="/logo-gio.png"
            alt="GIO"
            style={{ height: 82, width: "auto", objectFit: "contain" }}
          />

          <div style={{ textAlign: "center", display: "grid", gap: 6 }}>
            <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: 0.2 }}>
              CRM GIO
            </div>
            <div style={{ fontSize: 13, opacity: 0.78 }}>
              Acesse sua conta para continuar
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={labelStyle}>Email</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Digite seu email"
              style={inputStyle}
              autoComplete="email"
            />
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={labelStyle}>Senha</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
              style={inputStyle}
              autoComplete="current-password"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canLogin) {
                  handleLogin();
                }
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Link
              href="/forgot-password"
              style={{
                fontSize: 12,
                opacity: 0.88,
                textDecoration: "none",
                color: "rgba(255,255,255,0.90)",
                fontWeight: 800,
              }}
            >
              Esqueci minha senha
            </Link>
          </div>

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

          <button
            type="button"
            onClick={handleLogin}
            disabled={!canLogin}
            style={canLogin ? btn : btnDisabled}
          >
            {saving ? "Entrando..." : "Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}