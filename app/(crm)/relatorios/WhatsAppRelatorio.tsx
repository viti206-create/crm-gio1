"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "@/lib/supabaseClient";

type OrigemInfo = { respostas: number; tempoMedioSegundos: number | null };
type Linha = { telefone: string; respostas: number; tempoMedioSegundos: number | null; ultimaRespostaEm: string; semResposta: boolean };
type Dados = {
  parcial: boolean;
  mensagensAnalisadas: number;
  respostasMedidas: number;
  tempoMedioSegundos: number | null;
  conversasSemResposta: number;
  porOrigem: { ai: OrigemInfo; crm_human: OrigemInfo; whatsapp_human: OrigemInfo };
  conversas: Linha[];
  observacao: string;
};
function dataLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function tempo(segundos: number | null) {
  if (segundos === null) return "—";
  if (segundos < 60) return `${segundos} s`;
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  return horas ? `${horas}h ${minutos}min` : `${minutos}min ${segundos % 60}s`;
}
const card: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14,
  padding: 16, background: "rgba(255,255,255,0.04)"
};
const campo: CSSProperties = { color: "white", background: "#21192b", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 9, padding: "9px 12px" };

export default function WhatsAppRelatorio() {
  const hoje = new Date();
  const [inicio,setInicio] = useState(() => dataLocal(new Date(hoje.getFullYear(),hoje.getMonth(),1)));
  const [fim,setFim] = useState(() => dataLocal(hoje));
  const [dados,setDados] = useState<Dados | null>(null);
  const [erro,setErro] = useState<string | null>(null);
  const [carregando,setCarregando] = useState(false);
  const carregar = useCallback(async () => {
    if (!inicio || !fim || inicio > fim) { setErro("Confira o período selecionado."); return; }
    setCarregando(true); setErro(null);
    try {
      const { data: sessao, error: erroSessao } = await supabase.auth.getSession();
      if (erroSessao || !sessao.session?.access_token) throw new Error("Faça login novamente para consultar os relatórios.");
      const qs = new URLSearchParams({inicio,fim});
      const resposta = await fetch(`/api/whatsapp/relatorio?${qs}`, {
        headers: { Authorization: `Bearer ${sessao.session.access_token}` },
        cache: "no-store",
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.error ?? "Não foi possível carregar o relatório.");
      setDados(corpo as Dados);
    } catch(e) { setDados(null); setErro(e instanceof Error ? e.message : "Erro ao consultar relatório."); }
    finally { setCarregando(false); }
  },[inicio,fim]);
  useEffect(() => { void carregar(); }, [carregar]);
  const grupos = dados ? [
    ["IA",dados.porOrigem.ai],
    ["Equipe pelo CRM",dados.porOrigem.crm_human],
    ["Equipe pelo WhatsApp",dados.porOrigem.whatsapp_human],
  ] as const : [];

  return <section style={{display:"grid",gap:14}}>
    <div style={card}>
      <div style={{fontWeight:900,fontSize:17,marginBottom:6}}>Tempo de resposta do WhatsApp</div>
      <p style={{fontSize:12,opacity:0.7,margin:"0 0 15px"}}>Análise detalhada de atendimento, sem repetir os indicadores da Home.</p>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"end"}}>
        <label style={{display:"grid",gap:5,fontSize:12}}>Início <input style={campo} type="date" value={inicio} onChange={e=>setInicio(e.target.value)} /></label>
        <label style={{display:"grid",gap:5,fontSize:12}}>Fim <input style={campo} type="date" value={fim} onChange={e=>setFim(e.target.value)} /></label>
        <button type="button" onClick={()=>void carregar()} disabled={carregando} style={{...campo,cursor:"pointer",background:"#67429c",fontWeight:800}}>{carregando ? "Carregando..." : "Atualizar"}</button>
      </div>
    </div>
    {erro && <div role="alert" style={{...card,borderColor:"#cf6262"}}>{erro}</div>}
    {dados && <>
      {dados.parcial && <div role="alert" style={{...card,borderColor:"#dda449"}}>Volume elevado: limite de 10.000 registros atingido. Escolha um período menor para obter valores completos.</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
        {([ ["Tempo médio geral",tempo(dados.tempoMedioSegundos)],["Respostas medidas",dados.respostasMedidas],["Sem resposta no período",dados.conversasSemResposta] ] as const).map(([titulo,valor])=>
          <div key={titulo} style={card}><div style={{fontSize:12,opacity:0.75}}>{titulo}</div><div style={{fontSize:28,fontWeight:900,marginTop:5}}>{valor}</div></div>
        )}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12}}>
        {grupos.map(([titulo,info])=><div key={titulo} style={card}>
          <div style={{fontWeight:800}}>{titulo}</div>
          <div style={{fontSize:26,fontWeight:900,marginTop:8}}>{tempo(info.tempoMedioSegundos)}</div>
          <div style={{fontSize:12,opacity:0.75,marginTop:5}}>{info.respostas} resposta(s) medidas</div>
        </div>)}
      </div>
      <div style={card}>
        <div style={{fontWeight:900,marginBottom:12}}>Atendimentos por conversa</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr>{["Telefone","Respostas medidas","Tempo médio","Última resposta","Pendente"].map(t=><th key={t} style={{textAlign:"left",padding:"10px 8px",borderBottom:"1px solid #51435e"}}>{t}</th>)}</tr></thead>
          <tbody>{dados.conversas.length ? dados.conversas.map(linha=><tr key={linha.telefone}>
            <td style={{padding:8,borderBottom:"1px solid #352a3e"}}>{linha.telefone}</td>
            <td style={{padding:8,borderBottom:"1px solid #352a3e"}}>{linha.respostas}</td>
            <td style={{padding:8,borderBottom:"1px solid #352a3e"}}>{tempo(linha.tempoMedioSegundos)}</td>
            <td style={{padding:8,borderBottom:"1px solid #352a3e"}}>{new Date(linha.ultimaRespostaEm).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</td>
            <td style={{padding:8,borderBottom:"1px solid #352a3e"}}>{linha.semResposta?"Sim":"Não"}</td>
          </tr>) : <tr><td colSpan={5} style={{padding:12}}>Ainda não existem respostas medidas no período selecionado.</td></tr>}</tbody>
        </table></div>
      </div>
      <p style={{fontSize:12,opacity:0.7,margin:0}}>{dados.observacao}</p>
    </>}
  </section>;
}
