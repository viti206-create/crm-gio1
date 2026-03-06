"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function handleReset() {
    setLoading(true);
    setError("");
    setMsg("");

    const baseUrl =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://crm-gio1.vercel.app";

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${baseUrl}/update-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMsg("Enviamos um link de recuperação para seu email.");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(900px 500px at 20% 15%, rgba(180,120,255,0.25), transparent 60%), linear-gradient(180deg, #09070c 0%, #050408 100%)",
        color: "white",
      }}
    >
      <div
        style={{
          width: 400,
          borderRadius: 18,
          padding: 20,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <h2>Recuperar senha</h2>

        <input
          type="email"
          placeholder="Digite seu email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            marginTop: 10,
            marginBottom: 10,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "white",
          }}
        />

        <button
          onClick={handleReset}
          disabled={loading}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(180,120,255,0.35)",
            background: "rgba(180,120,255,0.2)",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {loading ? "Enviando..." : "Enviar link"}
        </button>

        {msg && <p style={{ marginTop: 10 }}>{msg}</p>}
        {error && <p style={{ marginTop: 10, color: "#ff7a9c" }}>{error}</p>}
      </div>
    </div>
  );
}