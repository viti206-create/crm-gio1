"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginInner() {
  const searchParams = useSearchParams();

  const redirectTo = useMemo(() => {
    const r = searchParams.get("redirect") || "/dashboard";
    if (!r.startsWith("/")) return "/dashboard"; // evita redirect externo
    return r;
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      if (data.session) {
        window.location.assign(redirectTo);
        return;
      }

      setChecking(false);
    })();

    return () => {
      alive = false;
    };
  }, [redirectTo]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setErrorMsg("Email ou senha inválidos.");
      return;
    }

    // HARD redirect: garante cookie aplicado e Proxy libera no Vercel
    window.location.assign(redirectTo);
  }

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background:
            "radial-gradient(900px 500px at 20% 15%, rgba(180,120,255,0.25), transparent 60%), linear-gradient(180deg, #09070c 0%, #050408 100%)",
          padding: 16,
          color: "white",
        }}
      >
        Carregando…
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(900px 500px at 20% 15%, rgba(180,120,255,0.25), transparent 60%), linear-gradient(180deg, #09070c 0%, #050408 100%)",
        padding: 16,
        color: "white",
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          width: "min(420px, 100%)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.06)",
          boxShadow: "0 28px 90px rgba(0,0,0,0.55)",
          padding: 18,
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 14 }}>
          Login • CRM GIO
        </div>

        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Email</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="seuemail@exemplo.com"
            autoComplete="email"
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.12)",
              padding: "12px 12px",
              borderRadius: 12,
              outline: "none",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Senha</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            placeholder="••••••••"
            autoComplete="current-password"
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.12)",
              padding: "12px 12px",
              borderRadius: 12,
              outline: "none",
            }}
          />
        </label>

        {errorMsg ? (
          <div
            style={{
              marginBottom: 12,
              padding: 10,
              borderRadius: 12,
              border: "1px solid rgba(255,120,160,0.35)",
              background: "rgba(255,120,160,0.10)",
              fontSize: 13,
            }}
          >
            {errorMsg}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            borderRadius: 12,
            padding: "12px 12px",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 950,
            border: "1px solid rgba(180,120,255,0.35)",
            background:
              "linear-gradient(180deg, rgba(180,120,255,0.30) 0%, rgba(180,120,255,0.12) 100%)",
            color: "white",
            opacity: loading ? 0.85 : 1,
          }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          Dica: use o usuário que você criou no Supabase Auth.
        </div>
      </form>
    </div>
  );
}