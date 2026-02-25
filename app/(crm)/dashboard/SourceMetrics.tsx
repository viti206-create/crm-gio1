"use client";

import React, { useMemo } from "react";

type LeadLike = { source?: string | null };

export default function SourceMetrics({ leads }: { leads: LeadLike[] }) {
  const bySource = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const lead of leads ?? []) {
      const key = (lead?.source ?? "outros").toString().toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
    }
    return acc;
  }, [leads]);

  const rows = useMemo(() => {
    const entries = Object.entries(bySource);
    entries.sort((a, b) => b[1] - a[1]);
    return entries;
  }, [bySource]);

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
        marginBottom: 14,
      }}
    >
      <div style={{ fontWeight: 950, fontSize: 14, marginBottom: 10 }}>
        Leads por origem
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.75 }}>Sem leads ainda.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map(([k, v]) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                fontSize: 13,
                opacity: 0.92,
              }}
            >
              <span style={{ fontWeight: 900, textTransform: "capitalize" }}>
                {k}
              </span>
              <span style={{ fontWeight: 950 }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}