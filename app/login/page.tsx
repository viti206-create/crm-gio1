"use client";

import { Suspense } from "react";
import LoginInner from "./LoginInner";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
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
      }
    >
      <LoginInner />
    </Suspense>
  );
}