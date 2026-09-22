import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type Origem = "ai" | "crm_human" | "whatsapp_human";
type Linha = {
  telefone_cliente: string | null;
  mensagem: string | null;
  resposta: string | null;
  created_at: string | null;
  response_at: string | null;
  response_origin: Origem | null;
  conversation_status: string | null;
};
type Evento = { telefone: string; tipo: "entrada" | "saida"; horario: number; origem?: Origem };
type Estatistica = { total: number; somaMs: number };

const origens: Origem[] = ["ai", "crm_human", "whatsapp_human"];
const MAX_LINHAS = 10000;
function media(quantidade: number, soma: number): number | null {
  return quantidade ? Math.round(soma / quantidade / 1000) : null;
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Sessão necessária." }, { status: 401 });

  const supabase = createSupabaseServerClient();
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData.user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }
  const { data: perfil, error: perfilError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (perfilError || perfil?.role !== "admin") {
    return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  }

  const inicio = req.nextUrl.searchParams.get("inicio") ?? "";
  const fim = req.nextUrl.searchParams.get("fim") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || inicio > fim) {
    return NextResponse.json({ error: "Informe datas válidas." }, { status: 400 });
  }
  const inicioMs = Date.parse(`${inicio}T00:00:00-03:00`);
  const fimMs = Date.parse(`${fim}T23:59:59.999-03:00`);
  if (!Number.isFinite(inicioMs) || !Number.isFinite(fimMs) || (fimMs - inicioMs) / 86400000 > 366) {
    return NextResponse.json({ error: "Selecione um período de até 366 dias." }, { status: 400 });
  }

  // O relatório inclui mensagens recebidas no período. Respostas para mensagens
  // anteriores ao início não entram na média, evitando tempos artificiais.
  const linhas: Linha[] = [];
  const TAMANHO = 1000;
  let truncado = false;
  for (let offset = 0; offset < MAX_LINHAS; offset += TAMANHO) {
    const { data, error } = await supabase
      .from("whatsapp_conversas")
      .select("telefone_cliente,mensagem,resposta,created_at,response_at,response_origin,conversation_status")
      .gte("created_at", new Date(inicioMs).toISOString())
      .lte("created_at", new Date(fimMs).toISOString())
      .order("created_at", { ascending: true })
      .range(offset, offset + TAMANHO - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const lote = (data ?? []) as Linha[];
    linhas.push(...lote);
    if (lote.length < TAMANHO) break;
    if (offset + TAMANHO >= MAX_LINHAS) truncado = true;
  }

  const eventos: Evento[] = [];
  const ultimoStatus = new Map<string, { instante: number; status: string | null }>();
  for (const linha of linhas) {
    const telefone = linha.telefone_cliente;
    if (!telefone) continue;
    const entradaMs = linha.created_at ? Date.parse(linha.created_at) : NaN;
    const saidaMs = linha.response_at ? Date.parse(linha.response_at) : entradaMs;
    if (linha.mensagem && Number.isFinite(entradaMs)) {
      eventos.push({ telefone, tipo: "entrada", horario: entradaMs });
    }
    if (linha.resposta && Number.isFinite(saidaMs) && saidaMs <= fimMs) {
      eventos.push({ telefone, tipo: "saida", horario: saidaMs, origem: linha.response_origin ?? undefined });
    }
    const statusMs = linha.resposta && Number.isFinite(saidaMs) ? saidaMs : entradaMs;
    if (Number.isFinite(statusMs)) {
      const atual = ultimoStatus.get(telefone);
      if (!atual || statusMs >= atual.instante) {
        ultimoStatus.set(telefone, { instante: statusMs, status: linha.conversation_status });
      }
    }
  }
  eventos.sort((a, b) => a.horario - b.horario || (a.tipo === "entrada" ? -1 : 1));

  const pendentes = new Map<string, number>();
  const estatisticas = new Map<string, { total: number; somaMs: number; ultimoHorario: number }>();
  const porOrigem: Record<Origem, Estatistica> = {
    ai: { total: 0, somaMs: 0 },
    crm_human: { total: 0, somaMs: 0 },
    whatsapp_human: { total: 0, somaMs: 0 },
  };
  let respostasMedidas = 0;
  let somaMs = 0;
  for (const evento of eventos) {
    if (evento.tipo === "entrada") {
      if (!pendentes.has(evento.telefone)) pendentes.set(evento.telefone, evento.horario);
      continue;
    }
    const inicioEspera = pendentes.get(evento.telefone);
    if (inicioEspera === undefined) continue;
    const duracao = evento.horario - inicioEspera;
    if (duracao < 0) continue;
    pendentes.delete(evento.telefone);
    respostasMedidas++;
    somaMs += duracao;
    if (evento.origem && origens.includes(evento.origem)) {
      porOrigem[evento.origem].total++;
      porOrigem[evento.origem].somaMs += duracao;
    }
    const atual = estatisticas.get(evento.telefone) ?? { total: 0, somaMs: 0, ultimoHorario: 0 };
    atual.total++;
    atual.somaMs += duracao;
    atual.ultimoHorario = evento.horario;
    estatisticas.set(evento.telefone, atual);
  }
  const semResposta = Array.from(pendentes).filter(([telefone]) => ultimoStatus.get(telefone)?.status !== "finalizada");
  const conversas = Array.from(estatisticas, ([telefone, valor]) => ({
    telefone,
    respostas: valor.total,
    tempoMedioSegundos: media(valor.total, valor.somaMs),
    ultimaRespostaEm: new Date(valor.ultimoHorario).toISOString(),
    semResposta: pendentes.has(telefone) && ultimoStatus.get(telefone)?.status !== "finalizada",
  })).sort((a, b) => b.respostas - a.respostas);

  return NextResponse.json({
    periodo: { inicio, fim },
    parcial: truncado,
    mensagensAnalisadas: linhas.length,
    respostasMedidas,
    tempoMedioSegundos: media(respostasMedidas, somaMs),
    conversasSemResposta: semResposta.length,
    porOrigem: Object.fromEntries(origens.map((origem) => [origem, {
      respostas: porOrigem[origem].total,
      tempoMedioSegundos: media(porOrigem[origem].total, porOrigem[origem].somaMs),
    }])),
    conversas,
    observacao: "Tempos calculados a partir da primeira mensagem ainda sem resposta até a primeira resposta posterior. Mensagens recebidas antes do início do período não entram na média. Conversas sem resposta referem-se às mensagens deste intervalo.",
  });
}
