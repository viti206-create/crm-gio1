import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const META_GRAPH_VERSION = "v26.0";

export async function GET() {
  try {
    const accessToken = process.env.META_ADS_ACCESS_TOKEN;
    const configuredAdAccountId = process.env.META_AD_ACCOUNT_ID;

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "META_ADS_ACCESS_TOKEN não está configurado.",
        },
        { status: 500 }
      );
    }

    if (!configuredAdAccountId) {
      return NextResponse.json(
        {
          ok: false,
          error: "META_AD_ACCOUNT_ID não está configurado.",
        },
        { status: 500 }
      );
    }

    const adAccountId = configuredAdAccountId.replace(/^act_/, "").trim();

    /*
     * TESTE DE INSIGHTS POR ANÚNCIO
     *
     * Consulta somente dados de leitura da conta.
     * Não cria, altera, pausa ou exclui campanhas.
     *
     * O token permanece exclusivamente no servidor
     * e nunca é devolvido pela resposta desta rota.
     */
    const url = new URL(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${adAccountId}/insights`
    );

    url.searchParams.set("level", "ad");

    url.searchParams.set(
      "fields",
      [
        "ad_id",
        "ad_name",
        "adset_id",
        "adset_name",
        "campaign_id",
        "campaign_name",
        "spend",
        "impressions",
        "reach",
        "clicks",
      ].join(",")
    );

    /*
     * Últimos 30 dias.
     *
     * time_increment=1 faz a Meta retornar os dados
     * separados por dia, o que será importante depois
     * para armazenarmos o investimento diário no Supabase.
     */
    url.searchParams.set("date_preset", "last_30d");
    url.searchParams.set("time_increment", "1");
    url.searchParams.set("limit", "500");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Meta Ads insights test error:", {
        status: response.status,
        error: data?.error
          ? {
              message: data.error.message,
              type: data.error.type,
              code: data.error.code,
              error_subcode: data.error.error_subcode,
              fbtrace_id: data.error.fbtrace_id,
            }
          : data,
      });

      return NextResponse.json(
        {
          ok: false,
          test: "ad-insights",
          graphApiVersion: META_GRAPH_VERSION,
          metaApiStatus: response.status,
          error: data?.error
            ? {
                message: data.error.message,
                type: data.error.type,
                code: data.error.code,
                error_subcode: data.error.error_subcode ?? null,
              }
            : {
                message: "Erro desconhecido retornado pela Meta.",
              },
        },
        { status: response.status }
      );
    }

    const insights = Array.isArray(data?.data) ? data.data : [];

    /*
     * IDs que já foram capturados pelo CRM através
     * do referral do WhatsApp.
     *
     * Servem somente para este teste de correspondência.
     * Depois isso será feito pelo banco de dados.
     */
    const knownCrmAdIds = new Set([
      "120244289312790024",
      "120251913670130024",
      "120251913667320024",
      "120251804652050024",
    ]);

    const returnedAdIds = new Set<string>();

    for (const row of insights) {
      if (row?.ad_id) {
        returnedAdIds.add(String(row.ad_id));
      }
    }

    const matchedCrmAdIds = Array.from(returnedAdIds).filter((adId) =>
      knownCrmAdIds.has(adId)
    );

    /*
     * Soma o investimento dos últimos 30 dias por anúncio.
     *
     * Como a Meta retorna uma linha por anúncio/dia,
     * fazemos a agregação apenas para facilitar a validação.
     */
    const aggregatedByAd = new Map<
      string,
      {
        ad_id: string;
        ad_name: string | null;
        adset_id: string | null;
        adset_name: string | null;
        campaign_id: string | null;
        campaign_name: string | null;
        spend: number;
        impressions: number;
        reach: number;
        clicks: number;
        days: number;
        crmMatch: boolean;
      }
    >();

    for (const row of insights) {
      const adId = String(row?.ad_id ?? "");

      if (!adId) {
        continue;
      }

      const existing = aggregatedByAd.get(adId);

      if (existing) {
        existing.spend += Number(row?.spend ?? 0);
        existing.impressions += Number(row?.impressions ?? 0);
        existing.reach += Number(row?.reach ?? 0);
        existing.clicks += Number(row?.clicks ?? 0);
        existing.days += 1;
      } else {
        aggregatedByAd.set(adId, {
          ad_id: adId,
          ad_name: row?.ad_name ?? null,
          adset_id: row?.adset_id ?? null,
          adset_name: row?.adset_name ?? null,
          campaign_id: row?.campaign_id ?? null,
          campaign_name: row?.campaign_name ?? null,
          spend: Number(row?.spend ?? 0),
          impressions: Number(row?.impressions ?? 0),
          reach: Number(row?.reach ?? 0),
          clicks: Number(row?.clicks ?? 0),
          days: 1,
          crmMatch: knownCrmAdIds.has(adId),
        });
      }
    }

    const aggregatedAds = Array.from(aggregatedByAd.values())
      .map((ad) => ({
        ...ad,
        spend: Number(ad.spend.toFixed(2)),
      }))
      .sort((a, b) => b.spend - a.spend);

    const totalSpend = aggregatedAds.reduce(
      (total, ad) => total + ad.spend,
      0
    );

    return NextResponse.json({
      ok: true,
      test: "ad-insights",
      graphApiVersion: META_GRAPH_VERSION,

      account: {
        account_id: adAccountId,
      },

      period: {
        preset: "last_30d",
        time_increment: 1,
      },

      summary: {
        dailyInsightRows: insights.length,
        uniqueAds: aggregatedAds.length,
        totalSpend: Number(totalSpend.toFixed(2)),
        matchedCrmAds: matchedCrmAdIds.length,
      },

      matchedCrmAdIds,

      ads: aggregatedAds,

      paging: {
        hasNextPage: Boolean(data?.paging?.next),
      },
    });
  } catch (error) {
    console.error("Meta Ads insights unexpected error:", error);

    return NextResponse.json(
      {
        ok: false,
        test: "ad-insights",
        error: "Erro interno ao consultar os Insights da Meta Ads API.",
      },
      { status: 500 }
    );
  }
}