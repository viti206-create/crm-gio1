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

    const cleanConfiguredAdAccountId = configuredAdAccountId.replace(
      /^act_/,
      ""
    );

    /*
     * TESTE:
     * Em vez de consultar diretamente act_<ID>,
     * perguntamos à Meta quais contas de anúncios este
     * System User consegue acessar.
     *
     * O token nunca é devolvido pela nossa API.
     */
    const url = new URL(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts`
    );

    url.searchParams.set(
      "fields",
      "id,account_id,name,account_status,currency,timezone_name"
    );

    url.searchParams.set("limit", "100");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Meta Ads /me/adaccounts test error:", {
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
          test: "me/adaccounts",
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

    const accounts = Array.isArray(data?.data) ? data.data : [];

    const configuredAccountFound = accounts.some(
      (account: { account_id?: string; id?: string }) =>
        account.account_id === cleanConfiguredAdAccountId ||
        account.id === `act_${cleanConfiguredAdAccountId}`
    );

    return NextResponse.json({
      ok: true,
      test: "me/adaccounts",
      graphApiVersion: META_GRAPH_VERSION,

      configuredAccount: {
        account_id: cleanConfiguredAdAccountId,
        found: configuredAccountFound,
      },

      accessibleAccountsCount: accounts.length,

      accessibleAccounts: accounts.map(
        (account: {
          id?: string;
          account_id?: string;
          name?: string;
          account_status?: number;
          currency?: string;
          timezone_name?: string;
        }) => ({
          id: account.id ?? null,
          account_id: account.account_id ?? null,
          name: account.name ?? null,
          account_status: account.account_status ?? null,
          currency: account.currency ?? null,
          timezone_name: account.timezone_name ?? null,
        })
      ),

      paging: {
        hasNextPage: Boolean(data?.paging?.next),
      },
    });
  } catch (error) {
    console.error("Meta Ads /me/adaccounts unexpected error:", error);

    return NextResponse.json(
      {
        ok: false,
        test: "me/adaccounts",
        error:
          "Erro interno ao consultar as contas de anúncios disponíveis para o token.",
      },
      { status: 500 }
    );
  }
}