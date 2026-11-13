"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import AdminRelatorios from "./AdminRelatorios";
import EquipeRelatorio from "./EquipeRelatorio";

type UserRole = "admin" | "manager" | "agent" | "whatsapp" | null;

export default function RelatoriosPage() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAccess() {
      setLoading(true);
      setAccessError(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          if (active) {
            setRole(null);
            setLoading(false);
          }

          router.replace("/");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        const currentRole = String(profile?.role ?? "")
          .trim()
          .toLowerCase();

        if (!active) return;

        if (
          currentRole === "admin" ||
          currentRole === "manager" ||
          currentRole === "agent" ||
          currentRole === "whatsapp"
        ) {
          setRole(currentRole as UserRole);
        } else {
          setRole(null);
        }

        setLoading(false);
      } catch (error) {
        console.error("Erro ao verificar acesso aos relatórios:", error);

        if (!active) return;

        setRole(null);
        setAccessError(
          error instanceof Error
            ? error.message
            : "Não foi possível verificar o acesso."
        );
        setLoading(false);
      }
    }

    void loadAccess();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (loading) return;

    if (role === "agent" || role === "whatsapp" || !role) {
      router.replace("/dashboard");
    }
  }, [loading, role, router]);

  if (loading) {
    return (
      <div
        style={{
          padding: 20,
          color: "white",
        }}
      >
        Carregando permissões...
      </div>
    );
  }

  if (accessError) {
    return (
      <div
        style={{
          padding: 20,
          color: "white",
        }}
      >
        <div
          style={{
            border: "1px solid rgba(255,120,120,0.30)",
            background: "rgba(255,120,120,0.08)",
            borderRadius: 14,
            padding: 14,
          }}
        >
          Erro ao verificar acesso: {accessError}
        </div>
      </div>
    );
  }

  /*
   * ADMIN
   *
   * Continua usando exatamente a página administrativa
   * que já existia antes.
   */
  if (role === "admin") {
    return <AdminRelatorios />;
  }

  /*
   * MANAGER
   *
   * Mesmo nível operacional do agent,
   * porém com acesso exclusivo ao relatório da Equipe.
   */
  if (role === "manager") {
    return (
      <div
        style={{
          padding: 16,
          color: "white",
        }}
      >
        <div
          style={{
            background:
              "radial-gradient(900px 500px at 20% 15%, rgba(180,120,255,0.25), transparent 60%), linear-gradient(180deg, #09070c 0%, #050408 100%)",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.10)",
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "grid",
                gap: 7,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 950,
                  letterSpacing: 0.2,
                }}
              >
                Relatórios
              </div>

              <div
                style={{
                  width: "fit-content",
                  background: "rgba(180,120,255,0.20)",
                  border: "1px solid rgba(180,120,255,0.45)",
                  borderRadius: 11,
                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                Equipe
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.12)",
                padding: "10px 12px",
                borderRadius: 12,
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              Voltar
            </button>
          </div>

          <EquipeRelatorio />
        </div>
      </div>
    );
  }

  return null;
}