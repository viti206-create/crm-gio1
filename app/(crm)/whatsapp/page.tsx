"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Conversa = {
  telefone: string;
  nome: string;
  ultimaMensagem: string;
  ultimoHorario: string;
  naoLidas: number;
};

type Bolha = {
  tipo: "recebida" | "enviada";
  texto: string;
  horario: string;
};

function formatarHorario(horario: string) {
  return new Date(horario).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function chaveData(horario: string) {
  return new Date(horario).toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

function formatarSeparadorData(horario: string) {
  const data = new Date(horario);
  const hoje = new Date();

  const chaveMensagem = chaveData(horario);
  const chaveHoje = hoje.toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });

  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);

  const chaveOntem = ontem.toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });

  if (chaveMensagem === chaveHoje) return "HOJE";
  if (chaveMensagem === chaveOntem) return "ONTEM";

  return data
    .toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    })
    .toUpperCase();
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return partes.map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export default function WhatsAppPage() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [telefoneSelecionado, setTelefoneSelecionado] = useState<string | null>(
    null
  );
  const [nomeSelecionado, setNomeSelecionado] = useState("");
  const [bolhas, setBolhas] = useState<Bolha[]>([]);
  const [busca, setBusca] = useState("");
  const [textoInput, setTextoInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [alturaDisponivel, setAlturaDisponivel] = useState<number | null>(null);
  const [mostrarBotaoDescer, setMostrarBotaoDescer] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mensagensContainerRef = useRef<HTMLDivElement | null>(null);
  const quantidadeAnteriorRef = useRef(0);

  async function carregarConversas() {
    try {
      const resposta = await fetch("/api/whatsapp/conversas", {
        cache: "no-store",
      });

      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => null);
        throw new Error(dados?.error ?? "Erro ao carregar conversas");
      }

      const dados = await resposta.json();
      setConversas(dados.conversas ?? []);
    } catch (error) {
      console.error("Erro ao carregar conversas:", error);
    }
  }

  async function carregarMensagens(telefone: string) {
    try {
      const resposta = await fetch(
        `/api/whatsapp/conversas/${encodeURIComponent(telefone)}/mensagens`,
        { cache: "no-store" }
      );

      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => null);
        throw new Error(dados?.error ?? "Erro ao carregar mensagens");
      }

      const dados = await resposta.json();

      setBolhas(dados.bolhas ?? []);
      setNomeSelecionado(dados.nome ?? telefone);

      if (dados.marcouComoLida) {
        await carregarConversas();
      }
    } catch (error) {
      console.error("Erro ao carregar mensagens:", error);
    }
  }

  useEffect(() => {
    carregarConversas();
    const intervalo = window.setInterval(carregarConversas, 5000);
    return () => window.clearInterval(intervalo);
  }, []);

  useEffect(() => {
    if (!telefoneSelecionado) {
      setBolhas([]);
      setNomeSelecionado("");
      return;
    }

    carregarMensagens(telefoneSelecionado);

    const intervalo = window.setInterval(
      () => carregarMensagens(telefoneSelecionado),
      3000
    );

    return () => window.clearInterval(intervalo);
  }, [telefoneSelecionado]);

  useEffect(() => {
    const container = mensagensContainerRef.current;
    if (!container) return;

    const aumentou = bolhas.length > quantidadeAnteriorRef.current;
    quantidadeAnteriorRef.current = bolhas.length;

    if (aumentou) {
      container.scrollTop = container.scrollHeight;
    }
  }, [bolhas]);

  useEffect(() => {
    quantidadeAnteriorRef.current = 0;
  }, [telefoneSelecionado]);

  useEffect(() => {
    const overflowHtml = document.documentElement.style.overflow;
    const overflowBody = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = overflowHtml;
      document.body.style.overflow = overflowBody;
    };
  }, []);

  useEffect(() => {
    function calcularAltura() {
      if (!containerRef.current) return;

      const topo = containerRef.current.getBoundingClientRect().top;
      const altura = window.innerHeight - topo - 18;
      setAlturaDisponivel(altura > 320 ? altura : 320);
    }

    calcularAltura();
    window.addEventListener("resize", calcularAltura);

    return () => window.removeEventListener("resize", calcularAltura);
  }, []);

  const conversasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return conversas;

    return conversas.filter((conversa) =>
      [conversa.nome, conversa.telefone, conversa.ultimaMensagem]
        .join(" ")
        .toLowerCase()
        .includes(termo)
    );
  }, [conversas, busca]);

  const conversaSelecionada = useMemo(
    () =>
      conversas.find((conversa) => conversa.telefone === telefoneSelecionado) ??
      null,
    [conversas, telefoneSelecionado]
  );

  const grupos = useMemo(() => {
    const resultado: Array<
      | { tipo: "data"; chave: string; texto: string }
      | { tipo: "mensagem"; chave: string; bolha: Bolha }
    > = [];

    let ultimaData = "";

    bolhas.forEach((bolha, index) => {
      const data = chaveData(bolha.horario);

      if (data !== ultimaData) {
        resultado.push({
          tipo: "data",
          chave: `data-${data}`,
          texto: formatarSeparadorData(bolha.horario),
        });
        ultimaData = data;
      }

      resultado.push({
        tipo: "mensagem",
        chave: `msg-${index}-${bolha.horario}`,
        bolha,
      });
    });

    return resultado;
  }, [bolhas]);

  async function enviarMensagem() {
    if (!telefoneSelecionado || !textoInput.trim() || enviando) return;

    const texto = textoInput.trim();
    setTextoInput("");
    setEnviando(true);
    setErro(null);

    try {
      const resposta = await fetch(
        `/api/whatsapp/conversas/${encodeURIComponent(
          telefoneSelecionado
        )}/enviar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto }),
        }
      );

      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => null);
        throw new Error(dados?.error ?? "Erro ao enviar mensagem");
      }

      await carregarMensagens(telefoneSelecionado);
      await carregarConversas();
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      setErro(
        error instanceof Error ? error.message : "Erro ao enviar mensagem"
      );
      setTextoInput(texto);
    } finally {
      setEnviando(false);
    }
  }

  function aoRolarMensagens() {
    const container = mensagensContainerRef.current;
    if (!container) return;

    const distancia =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    setMostrarBotaoDescer(distancia > 150);
  }

  function descerParaFinal() {
    const container = mensagensContainerRef.current;
    if (!container) return;

    container.scrollTop = container.scrollHeight;
    setMostrarBotaoDescer(false);
  }

  return (
    <div
      ref={containerRef}
      style={{
        height: alturaDisponivel ? `${alturaDisponivel}px` : "80vh",
        width: "100%",
        display: "flex",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 18,
        background: "#0b0f14",
        color: "#f5f7f8",
      }}
    >
      <aside
        style={{
          width: 360,
          minWidth: 300,
          borderRight: "1px solid rgba(255,255,255,0.10)",
          display: "flex",
          flexDirection: "column",
          background: "#111820",
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>WhatsApp</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>
            Atendimento manual
          </div>

          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar nome, telefone ou mensagem..."
            style={{
              width: "100%",
              marginTop: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 12,
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              padding: "11px 12px",
              outline: "none",
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {conversasFiltradas.map((conversa) => {
            const selecionada = conversa.telefone === telefoneSelecionado;

            return (
              <button
                key={conversa.telefone}
                onClick={() => setTelefoneSelecionado(conversa.telefone)}
                style={{
                  width: "100%",
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  background: selecionada
                    ? "rgba(180,120,255,0.12)"
                    : "transparent",
                  color: "#fff",
                  padding: 14,
                  display: "flex",
                  gap: 12,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    background: "rgba(180,120,255,0.18)",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  {iniciais(conversa.nome)}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <strong
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {conversa.nome}
                    </strong>

                    <span style={{ fontSize: 11, opacity: 0.55 }}>
                      {formatarHorario(conversa.ultimoHorario)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 5,
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12,
                        opacity: 0.68,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {conversa.ultimaMensagem}
                    </span>

                    {conversa.naoLidas > 0 ? (
                      <span
                        style={{
                          minWidth: 20,
                          height: 20,
                          padding: "0 6px",
                          borderRadius: 999,
                          display: "grid",
                          placeItems: "center",
                          background: "#25d366",
                          color: "#07120b",
                          fontSize: 11,
                          fontWeight: 900,
                        }}
                      >
                        {conversa.naoLidas}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}

          {conversasFiltradas.length === 0 ? (
            <div style={{ padding: 20, opacity: 0.6, fontSize: 13 }}>
              Nenhuma conversa encontrada.
            </div>
          ) : null}
        </div>
      </aside>

      <main
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          background:
            "radial-gradient(circle at top right, rgba(116,71,170,0.12), transparent 35%), #0b0f14",
        }}
      >
        {!telefoneSelecionado ? (
          <div
            style={{
              flex: 1,
              display: "grid",
              placeItems: "center",
              textAlign: "center",
              padding: 30,
              opacity: 0.7,
            }}
          >
            <div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>
                Selecione uma conversa
              </div>
              <div style={{ marginTop: 8, fontSize: 13 }}>
                As mensagens recebidas aparecem aqui. O atendimento é manual.
              </div>
            </div>
          </div>
        ) : (
          <>
            <header
              style={{
                padding: "13px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                background: "#111820",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "rgba(180,120,255,0.18)",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 900,
                }}
              >
                {iniciais(nomeSelecionado || conversaSelecionada?.nome || "?")}
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900 }}>
                  {nomeSelecionado || conversaSelecionada?.nome}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  {telefoneSelecionado}
                </div>
              </div>
            </header>

            <div
              ref={mensagensContainerRef}
              onScroll={aoRolarMensagens}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "18px 22px",
                position: "relative",
              }}
            >
              {grupos.map((item) => {
                if (item.tipo === "data") {
                  return (
                    <div
                      key={item.chave}
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        margin: "12px 0",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: 0.5,
                          padding: "5px 10px",
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.08)",
                          color: "rgba(255,255,255,0.68)",
                        }}
                      >
                        {item.texto}
                      </span>
                    </div>
                  );
                }

                const enviada = item.bolha.tipo === "enviada";

                return (
                  <div
                    key={item.chave}
                    style={{
                      display: "flex",
                      justifyContent: enviada ? "flex-end" : "flex-start",
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "75%",
                        padding: "9px 11px 6px",
                        borderRadius: enviada
                          ? "14px 14px 4px 14px"
                          : "14px 14px 14px 4px",
                        background: enviada
                          ? "#6e3da0"
                          : "rgba(255,255,255,0.09)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      <div style={{ fontSize: 14, lineHeight: 1.4 }}>
                        {item.bolha.texto}
                      </div>

                      <div
                        style={{
                          textAlign: "right",
                          fontSize: 10,
                          opacity: 0.6,
                          marginTop: 4,
                        }}
                      >
                        {formatarHorario(item.bolha.horario)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {mostrarBotaoDescer ? (
                <button
                  onClick={descerParaFinal}
                  style={{
                    position: "sticky",
                    bottom: 8,
                    marginLeft: "auto",
                    display: "block",
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "#1c2630",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  ↓
                </button>
              ) : null}
            </div>

            <footer
              style={{
                padding: 12,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                background: "#111820",
              }}
            >
              {erro ? (
                <div
                  style={{
                    marginBottom: 8,
                    fontSize: 12,
                    color: "#ff9aa8",
                  }}
                >
                  {erro}
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <textarea
                  value={textoInput}
                  onChange={(event) => setTextoInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      enviarMensagem();
                    }
                  }}
                  placeholder="Digite uma mensagem..."
                  style={{
                    flex: 1,
                    minHeight: 44,
                    maxHeight: 140,
                    resize: "vertical",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#fff",
                    padding: "11px 12px",
                    outline: "none",
                    font: "inherit",
                  }}
                />

                <button
                  onClick={enviarMensagem}
                  disabled={enviando || !textoInput.trim()}
                  style={{
                    minHeight: 44,
                    padding: "0 18px",
                    borderRadius: 14,
                    border: "none",
                    background:
                      enviando || !textoInput.trim() ? "#3a4249" : "#25d366",
                    color:
                      enviando || !textoInput.trim() ? "#aeb6bc" : "#07120b",
                    fontWeight: 900,
                    cursor:
                      enviando || !textoInput.trim()
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {enviando ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
