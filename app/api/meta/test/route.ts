import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const META_GRAPH_VERSION = "v26.0";

export async function GET() {
  try {
    const accessToken = process.env.META_ADS_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "META_ADS_ACCESS_TOKEN não está configurado.",
        },
        { status: 500 }
      );
    }

    if (!adAccountId) {
      return NextResponse.json(
        {
          ok: false,
          error: "META_AD_ACCOUNT_ID não está configurado.",
        },
        { status: 500 }
      );
    }

    const cleanAdAccountId = adAccountId.replace(/^act_/, "");

    const url = new URL(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${cleanAdAccountId}`
    );

    url.searchParams.set(
      "fields",
      "id,name,account_id,account_status,currency,timezone_name"
    );

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Meta Ads API test error:", {
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

    return NextResponse.json({
      ok: true,
      graphApiVersion: META_GRAPH_VERSION,
      account: {
        id: data.id ?? null,
        account_id: data.account_id ?? null,
        name: data.name ?? null,
        account_status: data.account_status ?? null,
        currency: data.currency ?? null,
        timezone_name: data.timezone_name ?? null,
      },
    });
  } catch (error) {
    console.error("Meta Ads API test unexpected error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Erro interno ao testar a conexão com a Meta Ads API.",
      },
      { status: 500 }
    );
  }
}