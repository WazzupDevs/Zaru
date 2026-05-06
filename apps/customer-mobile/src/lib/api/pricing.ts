import { z } from "zod";

import {
  PriceQuoteResponseSchema,
  PricingRuleResponseSchema,
  type PriceQuoteResponse,
  type PricingRuleResponse,
  type RequestPriceQuoteInput,
} from "@event-fleet/shared-types";

import type { ApiClient } from "./client";

export type { PriceQuoteResponse, PricingRuleResponse, RequestPriceQuoteInput };

export interface ListAddonRulesQuery {
  categoryId: string;
  vehicleTypeId: string;
  eventStartAt?: string;
}

export function createPricingApi(client: ApiClient) {
  return {
    requestQuote(input: RequestPriceQuoteInput): Promise<PriceQuoteResponse> {
      return client
        .request<unknown>("/pricing/quotes", { method: "POST", body: input })
        .then((data) => PriceQuoteResponseSchema.parse(data));
    },

    getQuote(quoteId: string): Promise<PriceQuoteResponse> {
      return client
        .request<unknown>(`/pricing/quotes/${encodeURIComponent(quoteId)}`, { method: "GET" })
        .then((data) => PriceQuoteResponseSchema.parse(data));
    },

    /**
     * Lists active ADDON-type rules for a (category, vehicleType) pair.
     * Server requires both — passing only categoryId returns 400.
     */
    listAddonRules(query: ListAddonRulesQuery): Promise<PricingRuleResponse[]> {
      const params = new URLSearchParams({
        categoryId: query.categoryId,
        vehicleTypeId: query.vehicleTypeId,
      });
      if (query.eventStartAt !== undefined) params.set("eventStartAt", query.eventStartAt);
      return (
        client
          .request<unknown>(`/pricing/rules?${params.toString()}`, { method: "GET" })
          .then((data) => z.array(PricingRuleResponseSchema).parse(data))
          // ADDON-only filter — the API currently returns all rule types
          // (multipliers + addons) for the (cat, vt) pair; we pick only
          // ADDONs because the quote screen lets the user toggle them.
          .then((rules) => rules.filter((r) => r.type === "ADDON"))
      );
    },
  };
}

export type PricingApi = ReturnType<typeof createPricingApi>;
