"use client";

import { useEffect, useRef, useState } from "react";

type Conversa = {
  telefone: string;
  nome: string;
  ultimaMensagem: string;
  ultimoHorario: string;
  iaPausada: boolean;
  aguardandoResposta: boolean;
  aguardandoDesde: string | null;
  naoLidas: number;
  ultimaOrigemResposta: "ai" | "crm_human" | "whatsapp_human" | null;
};

type Bolha = {
  tipo: "recebida" | "enviada";
  texto: string;
  horario: string;
};

export default function WhatsAppPainelPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mensagensContainerRef = useRef<HTMLDivElement>(null);
  const [alturaDisponivel, setAlturaDisponivel] = useState<number | null>(null);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [telefoneSelecionado, setTelefoneSelecionado] = useState<string | null>(
    null
  );
  const [nomeSelecionado, setNomeSelecionado] = useState<string>("");
  const [iaPausada, setIaPausada] = useState(false);
  const [bolhas, setBolhas] = useState<Bolha[]>([]);
  const [textoInput, setTextoInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mostrarBotaoDescer, setMostrarBotaoDescer] = useState(false);
  const quantidadeAnteriorRef = useRef(0);
  const [agora, setAgora] = useState(() => Date.now());

  // Pausa global da IA (afeta todas as conversas, inclusive novas)
  const [iaPausadaGlobal, setIaPausadaGlobal] = useState(false);
  const [carregandoPausaGlobal, setCarregandoPausaGlobal] = useState(true);

  async function carregarConversas() {
    try {
      const resposta = await fetch("/api/whatsapp/conversas");
      const dados = await resposta.json();
      setConversas(dados.conversas ?? []);
    } catch (erro) {
      console.error("Erro ao carregar conversas:", erro);
    }
  }

  async function carregarMensagens(telefone: string) {
    try {
      const resposta = await fetch(
        `/api/whatsapp/conversas/${telefone}/mensagens`
      );
      const dados = await resposta.json();
      setBolhas(dados.bolhas ?? []);
      setNomeSelecionado(dados.nome ?? telefone);
      setIaPausada(Boolean(dados.iaPausada));

      if (dados.marcouComoLida) {
        await carregarConversas();
      }
    } catch (erro) {
      console.error("Erro ao carregar mensagens:", erro);
    }
  }

  async function carregarPausaGlobal() {
    try {
      const resposta = await fetch("/api/whatsapp/ia-global");
      const dados = await resposta.json();
      setIaPausadaGlobal(Boolean(dados.iaPausadaGlobalmente));
    } catch (erro) {
      console.error("Erro ao carregar pausa global:", erro);
    } finally {
      setCarregandoPausaGlobal(false);
    }
  }

  async function alternarPausaGlobal() {
    const novoValor = !iaPausadaGlobal;
    setIaPausadaGlobal(novoValor);

    try {
      await fetch("/api/whatsapp/ia-global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pausada: novoValor }),
      });
    } catch (erro) {
      console.error("Erro ao alternar pausa global:", erro);
      setIaPausadaGlobal(!novoValor); // reverte em caso de erro
    }
  }

  useEffect(() => {
    carregarConversas();
    carregarPausaGlobal();

    const intervaloConversas = setInterval(carregarConversas, 5000);
    const intervaloRelogio = setInterval(() => setAgora(Date.now()), 30000);

    return () => {
      clearInterval(intervaloConversas);
      clearInterval(intervaloRelogio);
    };
  }, []);

  useEffect(() => {
    if (!telefoneSelecionado) return;
    carregarMensagens(telefoneSelecionado);
    const intervalo = setInterval(
      () => carregarMensagens(telefoneSelecionado),
      3000
    );
    return () => clearInterval(intervalo);
  }, [telefoneSelecionado]);

  useEffect(() => {
    const container = mensagensContainerRef.current;
    if (!container) return;

    const quantidadeAumentou = bolhas.length > quantidadeAnteriorRef.current;
    quantidadeAnteriorRef.current = bolhas.length;

    if (quantidadeAumentou) {
      container.scrollTop = container.scrollHeight;
    }
  }, [bolhas]);

  // Zera a contagem ao trocar de conversa, para rolar até o final na abertura
  useEffect(() => {
    quantidadeAnteriorRef.current = 0;
  }, [telefoneSelecionado]);

  function aoRolarMensagens() {
    const container = mensagensContainerRef.current;
    if (!container) return;

    const distanciaDoFinal =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    setMostrarBotaoDescer(distanciaDoFinal > 150);
  }

  function descerParaFinal() {
    const container = mensagensContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    setMostrarBotaoDescer(false);
  }

  // Trava a rolagem da página inteira enquanto essa tela estiver aberta,
  // sem precisar alterar o layout do CRM — restaura ao sair da página
  useEffect(() => {
    const overflowOriginalHtml = document.documentElement.style.overflow;
    const overflowOriginalBody = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = overflowOriginalHtml;
      document.body.style.overflow = overflowOriginalBody;
    };
  }, []);

  useEffect(() => {
    function calcularAltura() {
      if (!containerRef.current) return;
      const topo = containerRef.current.getBoundingClientRect().top;
      const margemInferior = 18; // mesmo padding que o CrmShell usa embaixo
      const altura = window.innerHeight - topo - margemInferior;
      setAlturaDisponivel(altura > 300 ? altura : 300);
    }

    calcularAltura();
    window.addEventListener("resize", calcularAltura);
    return () => window.removeEventListener("resize", calcularAltura);
  }, []);

  async function enviarMensagem() {
    if (!telefoneSelecionado || !textoInput.trim() || enviando) return;

    setEnviando(true);
    const texto = textoInput;
    setTextoInput("");

    try {
      await fetch(`/api/whatsapp/conversas/${telefoneSelecionado}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      await carregarMensagens(telefoneSelecionado);
      await carregarConversas();
    } catch (erro) {
      console.error("Erro ao enviar mensagem:", erro);
    } finally {
      setEnviando(false);
    }
  }

  async function alternarPausaIA() {
    if (!telefoneSelecionado) return;
    const novoValor = !iaPausada;
    setIaPausada(novoValor);

    try {
      await fetch(`/api/whatsapp/conversas/${telefoneSelecionado}/pausa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pausada: novoValor }),
      });
      await carregarConversas();
    } catch (erro) {
      console.error("Erro ao alternar pausa da IA:", erro);
    }
  }

  function formatarHorario(horario: string) {
    return new Date(horario).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  }

  function chaveData(horario: string) {
    return new Date(horario).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  }

  function formatarSeparadorData(horario: string) {
    const data = new Date(horario);
    const hoje = new Date();
    const chaveMensagem = chaveData(horario);
    const chaveHoje = hoje.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    const chaveOntem = ontem.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    if (chaveMensagem === chaveHoje) return "HOJE";
    if (chaveMensagem === chaveOntem) return "ONTEM";
    return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).toUpperCase();
  }

  function formatarTempoEspera(desde: string | null) {
    if (!desde) return "";

    const inicio = new Date(desde).getTime();
    if (!Number.isFinite(inicio)) return "";

    const totalSegundos = Math.max(0, Math.floor((agora - inicio) / 1000));

    if (totalSegundos < 60) return "agora";

    const minutos = Math.floor(totalSegundos / 60);
    if (minutos < 60) return `${minutos} min`;

    const horas = Math.floor(minutos / 60);
    const minutosRestantes = minutos % 60;
    if (horas < 24) {
      return minutosRestantes > 0
        ? `${horas}h ${minutosRestantes}min`
        : `${horas}h`;
    }

    const dias = Math.floor(horas / 24);
    const horasRestantes = horas % 24;
    return horasRestantes > 0 ? `${dias}d ${horasRestantes}h` : `${dias}d`;
  }

  function rotuloOrigemResposta(
    origem: Conversa["ultimaOrigemResposta"]
  ) {
    if (origem === "ai") return "IA respondeu";
    if (origem === "crm_human") return "Equipe respondeu pelo CRM";
    if (origem === "whatsapp_human") return "Equipe respondeu pelo WhatsApp";
    return null;
  }

  return (
    <div
      ref={containerRef}
      style={{
        height: alturaDisponivel ? `${alturaDisponivel}px` : "80vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: "sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Interruptor de pausa global da IA */}
      {!carregandoPausaGlobal && (
        <div
          style={{
            padding: "10px 16px",
            background: iaPausadaGlobal ? "#ffb020" : "#f0f2f5",
            borderBottom: "1px solid #d1d7db",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: iaPausadaGlobal ? "#ffffff" : "#111b21",
            }}
          >
            {iaPausadaGlobal
              ? "⏸️ IA pausada para TODAS as conversas"
              : "🤖 IA ativa normalmente"}
          </span>
          <button
            onClick={alternarPausaGlobal}
            style={{
              background: iaPausadaGlobal ? "#ffffff" : "#008069",
              color: iaPausadaGlobal ? "#ffb020" : "#ffffff",
              border: "none",
              borderRadius: 14,
              padding: "4px 12px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {iaPausadaGlobal ? "Reativar" : "Pausar tudo"}
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Lista de conversas */}
        <div
          style={{
            width: 320,
            borderRight: "1px solid #d1d7db",
            display: "flex",
            flexDirection: "column",
            background: "#ffffff",
            height: "100%",
          }}
        >
          <div
            style={{
              background: "#008069",
              color: "#ffffff",
              padding: "16px",
              fontWeight: 700,
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            Conversas
          </div>
          <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
            {conversas.map((conversa) => {
              const selecionada = telefoneSelecionado === conversa.telefone;
              const rotuloResposta = rotuloOrigemResposta(
                conversa.ultimaOrigemResposta
              );

              return (
                <div
                  key={conversa.telefone}
                  onClick={() => setTelefoneSelecionado(conversa.telefone)}
                  style={{
                    padding: "12px 16px",
                    cursor: "pointer",
                    borderBottom: "1px solid #f0f0f0",
                    background: selecionada
                      ? "#f0f2f5"
                      : conversa.naoLidas > 0
                        ? "#f7fffb"
                        : "transparent",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: conversa.naoLidas > 0 ? 700 : 600,
                        color: "#111b21",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {conversa.nome}
                    </span>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: conversa.naoLidas > 0 ? "#00a884" : "#667781",
                          fontWeight: conversa.naoLidas > 0 ? 700 : 400,
                        }}
                      >
                        {formatarHorario(conversa.ultimoHorario)}
                      </span>

                      {conversa.naoLidas > 0 && (
                        <span
                          style={{
                            minWidth: 20,
                            height: 20,
                            padding: "0 6px",
                            borderRadius: 10,
                            background: "#25d366",
                            color: "#ffffff",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {conversa.naoLidas > 99 ? "99+" : conversa.naoLidas}
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: conversa.naoLidas > 0 ? "#111b21" : "#667781",
                      fontWeight: conversa.naoLidas > 0 ? 600 : 400,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 2,
                    }}
                  >
                    {conversa.iaPausada && (
                      <span
                        style={{
                          background: "#ffb020",
                          color: "#ffffff",
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 8,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        HUMANO
                      </span>
                    )}

                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {conversa.ultimaMensagem}
                    </span>
                  </div>

                  {conversa.aguardandoResposta ? (
                    <div
                      style={{
                        marginTop: 5,
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#c62828",
                      }}
                    >
                      Aguardando resposta
                      {conversa.aguardandoDesde
                        ? ` • ${formatarTempoEspera(conversa.aguardandoDesde)}`
                        : ""}
                    </div>
                  ) : (
                    rotuloResposta && (
                      <div
                        style={{
                          marginTop: 5,
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#008069",
                        }}
                      >
                        {rotuloResposta}
                      </div>
                    )
                  )}
                </div>
              );
            })}
            {conversas.length === 0 && (
              <div style={{ padding: 16, color: "#667781" }}>
                Nenhuma conversa ainda.
              </div>
            )}
          </div>
        </div>

        {/* Área da conversa */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: "#e5ddd5",
            height: "100%",
            minWidth: 0,
          }}
        >
          {telefoneSelecionado ? (
            <>
              <div
                style={{
                  background: "#008069",
                  color: "#ffffff",
                  padding: "12px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: "#ffffff" }}>
                    {nomeSelecionado}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.85, color: "#ffffff" }}>
                    {telefoneSelecionado}
                  </div>
                </div>
                <button
                  onClick={alternarPausaIA}
                  style={{
                    background: iaPausada ? "#ffb020" : "rgba(255,255,255,0.2)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 20,
                    padding: "8px 16px",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  {iaPausada ? "🙋 Humano no controle" : "🤖 IA ativa"}
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  position: "relative",
                  minHeight: 0,
                  overflow: "hidden",
                }}
              >
                <div
                  ref={mensagensContainerRef}
                  onScroll={aoRolarMensagens}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    overflowY: "auto",
                    padding: "16px 24px",
                  }}
                >
                  {bolhas.map((bolha, indice) => {
                    const mostrarData = indice === 0 || chaveData(bolha.horario) !== chaveData(bolhas[indice - 1].horario);
                    return (
                      <div key={indice}>
                        {mostrarData && (
                          <div style={{ display: "flex", justifyContent: "center", margin: indice === 0 ? "4px 0 14px" : "18px 0 14px" }}>
                            <div style={{ background: "#ffffff", color: "#54656f", fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 8, boxShadow: "0 1px 1px rgba(0,0,0,0.08)" }}>
                              {formatarSeparadorData(bolha.horario)}
                            </div>
                          </div>
                        )}
                        <div
                      style={{
                        display: "flex",
                        justifyContent:
                          bolha.tipo === "enviada" ? "flex-end" : "flex-start",
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "65%",
                          background:
                            bolha.tipo === "enviada" ? "#d9fdd3" : "#ffffff",
                          borderRadius: 8,
                          padding: "8px 12px",
                          boxShadow: "0 1px 1px rgba(0,0,0,0.1)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 14,
                            whiteSpace: "pre-wrap",
                            color: "#111b21",
                          }}
                        >
                          {bolha.texto}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "#667781",
                            textAlign: "right",
                            marginTop: 2,
                          }}
                        >
                          {formatarHorario(bolha.horario)}
                        </div>
                      </div>
                    </div>
                      </div>
                    );
                  })}
                </div>

                {mostrarBotaoDescer && (
                  <button
                    onClick={descerParaFinal}
                    style={{
                      position: "absolute",
                      bottom: 16,
                      right: 24,
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: "#ffffff",
                      border: "1px solid #d1d7db",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                      cursor: "pointer",
                      fontSize: 18,
                      color: "#111b21",
                    }}
                  >
                    ↓
                  </button>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  padding: "12px 16px",
                  background: "#f0f2f5",
                  flexShrink: 0,
                }}
              >
                <input
                  value={textoInput}
                  onChange={(evento) => setTextoInput(evento.target.value)}
                  onKeyDown={(evento) => {
                    if (evento.key === "Enter") enviarMensagem();
                  }}
                  placeholder="Digite uma mensagem"
                  style={{
                    flex: 1,
                    border: "none",
                    borderRadius: 20,
                    padding: "10px 16px",
                    fontSize: 14,
                    color: "#111b21",
                    background: "#ffffff",
                  }}
                />
                <button
                  onClick={enviarMensagem}
                  disabled={enviando}
                  style={{
                    background: "#008069",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "50%",
                    width: 40,
                    height: 40,
                    cursor: "pointer",
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  ➤
                </button>
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#667781",
              }}
            >
              Selecione uma conversa para começar
            </div>
          )}
        </div>
      </div>
    </div>
  );
}