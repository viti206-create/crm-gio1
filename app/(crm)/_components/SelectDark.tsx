"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type SelectDarkOption = {
  value: string;
  label: string;
  meta?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectDarkOption[];
  placeholder?: string;
  disabled?: boolean;
  minWidth?: number;
  fullWidth?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  maxMenuHeight?: number;
  valueLabelOverride?: string | null;
  renderOption?: (
    opt: SelectDarkOption,
    isActive: boolean,
    isSelected: boolean
  ) => React.ReactNode;
};

export default function SelectDark({
  value,
  onChange,
  options,
  placeholder = "Selecione...",
  disabled = false,
  minWidth = 160,
  fullWidth = false,
  searchable = true,
  searchPlaceholder = "Buscar...",
  maxMenuHeight = 320,
  valueLabelOverride = null,
  renderOption,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;

    return options.filter((o) => {
      const hay = `${o.label} ${o.meta ?? ""} ${o.value}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);

    if (searchable) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, searchable]);

  function commitPick(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;

    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) commitPick(opt.value);
    }
  }

  const base: React.CSSProperties = {
    position: "relative",
    minWidth,
    width: fullWidth ? "100%" : undefined,
    maxWidth: "100%",
    minHeight: 0,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  const control: React.CSSProperties = {
    width: "100%",
    minWidth: 0,
    height: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "0 12px",
    borderRadius: 12,
    cursor: disabled ? "not-allowed" : "pointer",
    userSelect: "none",
    boxSizing: "border-box",
    border: open
      ? "1px solid rgba(180,120,255,0.35)"
      : "1px solid rgba(255,255,255,0.12)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)",
    boxShadow: open ? "0 18px 60px rgba(0,0,0,0.45)" : undefined,
    opacity: disabled ? 0.6 : 1,
  };

  const label: React.CSSProperties = {
    color: "rgba(255,255,255,0.92)",
    fontWeight: 900,
    fontSize: 13,
    lineHeight: "16px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    flex: 1,
    minWidth: 0,
  };

  const placeholderStyle: React.CSSProperties = {
    ...label,
    color: "rgba(255,255,255,0.60)",
    fontWeight: 800,
  };

  const caret: React.CSSProperties = {
    width: 0,
    height: 0,
    flexShrink: 0,
    borderLeft: "5px solid transparent",
    borderRight: "5px solid transparent",
    borderTop: open ? "0" : "6px solid rgba(255,255,255,0.65)",
    borderBottom: open ? "6px solid rgba(255,255,255,0.65)" : "0",
    opacity: 0.9,
    marginLeft: 4,
  };

  const menu: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    zIndex: 9999,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background:
      "linear-gradient(180deg, rgba(18,18,26,0.98) 0%, rgba(10,10,16,0.96) 100%)",
    boxShadow: "0 28px 90px rgba(0,0,0,0.70)",
    overflow: "hidden",
  };

  const searchWrap: React.CSSProperties = {
    padding: 8,
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
  };

  const searchInput: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "9px 10px",
    borderRadius: 10,
    outline: "none",
    fontWeight: 800,
    fontSize: 13,
  };

  const list: React.CSSProperties = {
    maxHeight: maxMenuHeight,
    overflowY: "auto",
    padding: 6,
    display: "grid",
    gap: 5,
  };

  const itemBase: React.CSSProperties = {
    padding: "9px 10px",
    borderRadius: 10,
    cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    display: "flex",
    flexDirection: "column",
    gap: 3,
  };

  const itemLabel: React.CSSProperties = {
    fontWeight: 950,
    color: "rgba(255,255,255,0.92)",
    fontSize: 13,
    lineHeight: "16px",
  };

  const itemMeta: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.75,
    color: "rgba(255,255,255,0.85)",
  };

  const selectedText = valueLabelOverride ?? (selected ? selected.label : "");

  return (
    <div ref={wrapRef} style={base} tabIndex={0} onKeyDown={onKeyDown}>
      <div
        style={control}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-disabled={disabled}
      >
        {selectedText ? (
          <div style={label} title={selectedText}>
            {selectedText}
          </div>
        ) : (
          <div style={placeholderStyle}>{placeholder}</div>
        )}

        <div style={caret} />
      </div>

      {open ? (
        <div style={menu}>
          {searchable ? (
            <div style={searchWrap}>
              <input
                ref={inputRef}
                style={searchInput}
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
              />
            </div>
          ) : null}

          <div style={list}>
            {filtered.length === 0 ? (
              <div style={{ padding: 10, opacity: 0.75, fontSize: 13 }}>
                Nenhum resultado.
              </div>
            ) : (
              filtered.map((opt, idx) => {
                const isActive = idx === activeIndex;
                const isSelected = opt.value === value;

                const itemStyle: React.CSSProperties = {
                  ...itemBase,
                  border: isSelected
                    ? "1px solid rgba(180,120,255,0.30)"
                    : isActive
                    ? "1px solid rgba(255,255,255,0.18)"
                    : itemBase.border,
                  background: isSelected
                    ? "linear-gradient(180deg, rgba(180,120,255,0.18) 0%, rgba(180,120,255,0.06) 100%)"
                    : isActive
                    ? "rgba(255,255,255,0.06)"
                    : itemBase.background,
                };

                return (
                  <div
                    key={opt.value}
                    style={itemStyle}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => commitPick(opt.value)}
                  >
                    {renderOption ? (
                      renderOption(opt, isActive, isSelected)
                    ) : (
                      <>
                        <div style={itemLabel}>{opt.label}</div>
                        {opt.meta ? <div style={itemMeta}>{opt.meta}</div> : null}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}