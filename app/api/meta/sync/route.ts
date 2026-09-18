import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const META_GRAPH_VERSION = "v26.0";
const SYNC_DAYS = 7;
const META_PAGE_LIMIT = 500;

type MetaInsightRow = {
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  date_start?: string;
  date_stop?: string;
};

type MetaInsightsResponse = {
  data?: MetaInsightRow[];
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

type InsightUpsertRow = {
  insight_date: string;
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
  updated_at: string;
};

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getSyncDateRange(): {
  since: string;
  until: string;
} {
  const until = new Date();

  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (SYNC_DAYS - 1));

  return {
    since: formatDate(since),
    until: formatDate(until),
  };
}

function parseNonNegativeNumber(
  value: string | number | undefined
): number {
  const parsed = Number(value ?? 0);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function normalizeAdAccountId(value: string): string {
  return value.replace(/^act_/, "").trim();
}

function isAllowedMetaPagingUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.hostname === "graph.facebook.com"
    );
  } catch {
    return false;
  }
}

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization");

  return authorization === `Bearer ${cronSecret}`;
}

async function fetchMetaInsights(
  accessToken: string,
  adAccountId: string,
  since: string,
  until: string
): Promise<MetaInsightRow[]> {
  const firstUrl = new URL(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${adAccountId}/insights`
  );

  firstUrl.searchParams.set("level", "ad");

  firstUrl.searchParams.set(
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

  firstUrl.searchParams.set(
    "time_range",
    JSON.stringify({
      since,
      until,
    })
  );

  firstUrl.searchParams.set("time_increment", "1");
  firstUrl.searchParams.set("limit", String(META_PAGE_LIMIT));

  const allRows: MetaInsightRow[] = [];

  let nextUrl: string | null = firstUrl.toString();
  let pageCount = 0;

  while (nextUrl) {
    pageCount += 1;

    if (pageCount > 100) {
      throw new Error(
        "A paginação da Meta excedeu o limite de segurança."
      );
    }

    if (!isAllowedMetaPagingUrl(nextUrl)) {
      throw new Error(
        "A Meta retornou uma URL de paginação não permitida."
      );
    }

    const response = await fetch(nextUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const data = (await response.json()) as MetaInsightsResponse;

    if (!response.ok) {
      console.error("Meta Ads sync insights error:", {
        status: response.status,
        page: pageCount,
        error: data?.error
          ? {
              message: data.error.message,
              type: data.error.type,
              code: data.error.code,
              error_subcode: data.error.error_subcode,
              fbtrace_id: data.error.fbtrace_id,
            }
          : null,
      });

      throw new Error(
        data?.error?.message ||
          `Erro HTTP ${response.status} retornado pela Meta.`
      );
    }

    if (Array.isArray(data.data)) {
      allRows.push(...data.data);
    }

    const metaNext = data?.paging?.next;

    if (metaNext && isAllowedMetaPagingUrl(metaNext)) {
      nextUrl = metaNext;
    } else if (metaNext) {
      throw new Error(
        "A Meta retornou uma URL de próxima página não permitida."
      );
    } else {
      nextUrl = null;
    }
  }

  return allRows;
}

function prepareRowsForUpsert(
  insights: MetaInsightRow[]
): InsightUpsertRow[] {
  const now = new Date().toISOString();

  const rowsByKey = new Map<string, InsightUpsertRow>();

  for (const insight of insights) {
    const adId = String(insight.ad_id ?? "").trim();
    const insightDate = String(insight.date_start ?? "").trim();

    if (!adId || !insightDate) {
      continue;
    }

    const key = `${insightDate}:${adId}`;

    rowsByKey.set(key, {
      insight_date: insightDate,
      ad_id: adId,
      ad_name: insight.ad_name ?? null,
      adset_id: insight.adset_id ?? null,
      adset_name: insight.adset_name ?? null,
      campaign_id: insight.campaign_id ?? null,
      campaign_name: insight.campaign_name ?? null,
      spend: parseNonNegativeNumber(insight.spend),
      impressions: Math.trunc(
        parseNonNegativeNumber(insight.impressions)
      ),
      reach: Math.trunc(
        parseNonNegativeNumber(insight.reach)
      ),
      clicks: Math.trunc(
        parseNonNegativeNumber(insight.clicks)
      ),
      updated_at: now,
    });
  }

  return Array.from(rowsByKey.values());
}

export async function GET(request: NextRequest) {
  try {
    /*
     * A rota somente pode ser executada por uma requisição
     * que apresente o CRON_SECRET correto no Authorization.
     *
     * Isso impede que uma pessoa simplesmente abra
     * /api/meta/sync no navegador e execute a sincronização.
     */
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const accessToken = process.env.META_ADS_ACCESS_TOKEN;
    const configuredAdAccountId =
      process.env.META_AD_ACCOUNT_ID;

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "META_ADS_ACCESS_TOKEN não está configurado.",
        },
        { status: 500 }
      );
    }

    if (!configuredAdAccountId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "META_AD_ACCOUNT_ID não está configurado.",
        },
        { status: 500 }
      );
    }

    const adAccountId =
      normalizeAdAccountId(configuredAdAccountId);

    const { since, until } = getSyncDateRange();

    const insights = await fetchMetaInsights(
      accessToken,
      adAccountId,
      since,
      until
    );

    const rows = prepareRowsForUpsert(insights);

    if (rows.length > 0) {
      const supabase = createSupabaseServerClient();

      const { error } = await supabase
        .from("meta_ad_insights_daily")
        .upsert(rows, {
          onConflict: "insight_date,ad_id",
        });

      if (error) {
        console.error(
          "Meta Ads sync Supabase upsert error:",
          {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          }
        );

        return NextResponse.json(
          {
            ok: false,
            error:
              "A Meta respondeu corretamente, mas ocorreu um erro ao salvar os Insights no Supabase.",
          },
          { status: 500 }
        );
      }
    }

    const uniqueAdIds = new Set(
      rows.map((row) => row.ad_id)
    );

    const totalSpend = rows.reduce(
      (total, row) => total + row.spend,
      0
    );

    return NextResponse.json({
      ok: true,
      sync: "meta-ad-insights",

      account: {
        account_id: adAccountId,
      },

      period: {
        since,
        until,
        days: SYNC_DAYS,
      },

      result: {
        metaRowsReceived: insights.length,
        rowsUpserted: rows.length,
        uniqueAds: uniqueAdIds.size,
        totalSpend: Number(totalSpend.toFixed(2)),
      },
    });
  } catch (error) {
    console.error(
      "Meta Ads sync unexpected error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        sync: "meta-ad-insights",
        error:
          error instanceof Error
            ? error.message
            : "Erro interno durante a sincronização dos Insights da Meta.",
      },
      { status: 500 }
    );
  }
}