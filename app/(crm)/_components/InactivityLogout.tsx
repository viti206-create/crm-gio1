"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const AUTO_LOGOUT_MS = 30 * 60 * 1000; // 30 minutos

export default function InactivityLogout() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoggingOutRef = useRef(false);

  useEffect(() => {
    async function logoutNow() {
      if (isLoggingOutRef.current) return;
      isLoggingOutRef.current = true;

      try {
        await supabase.auth.signOut();
      } catch (error) {
        console.error("Erro ao fazer logout automático:", error);
      } finally {
        router.replace("/login");
      }
    }

    function resetTimer() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        logoutNow();
      }, AUTO_LOGOUT_MS);
    }

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    events.forEach((eventName) => {
      window.addEventListener(eventName, resetTimer, { passive: true });
    });

    resetTimer();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      events.forEach((eventName) => {
        window.removeEventListener(eventName, resetTimer);
      });
    };
  }, [router]);

  return null;
}