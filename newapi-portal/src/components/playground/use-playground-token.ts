"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/client/api";

type PlaygroundTokenResponse = {
  tokenId: number;
};

export function usePlaygroundToken() {
  const [tokenId, setTokenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<PlaygroundTokenResponse>(
          "/api/playground/token",
        );
        if (!cancelled) {
          setTokenId(data.tokenId);
        }
      } catch (loadError) {
        if (!cancelled) {
          setTokenId(null);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "操练场初始化失败",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { tokenId, error, loading };
}
