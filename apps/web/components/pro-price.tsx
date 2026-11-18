"use client";

import { useQuery } from "@tanstack/react-query";
import { getPaddle } from "@/lib/paddle";
import { useApi } from "@/lib/use-api";

/**
 * The Pro price as Paddle formats it for this visitor (local currency + tax rules, detected from
 * their IP). No hard-coded prices in our code: change the price in Paddle, the page follows.
 */
export function ProPrice({ fallback = "" }: { fallback?: string }) {
  const api = useApi();
  const price = useQuery({
    queryKey: ["pro-price"],
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const [{ plans }, paddle] = await Promise.all([api.getBillingPlans(), getPaddle()]);
      const priceId = plans[0]?.priceId;
      if (!paddle || !priceId) return null;
      const preview = await paddle.PricePreview({ items: [{ priceId, quantity: 1 }] });
      return preview.data.details.lineItems[0]?.formattedTotals.total ?? null;
    },
  });
  return <>{price.data ?? fallback}</>;
}
