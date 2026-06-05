"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/client/api";

type PlaygroundTokenResponse = {
  chatTokenId?: number;
  imageTokenId?: number;
  tokenId?: number;
};

export function usePlaygroundToken() {
  const [chatTokenId, setChatTokenId] = useState<number | null>(null);
  const [imageTokenId, setImageTokenId] = useState<number | null>(null);
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
          const chatId = data.chatTokenId ?? data.tokenId ?? null;
          const imageId = data.imageTokenId ?? data.tokenId ?? null;

          if (chatId === null || imageId === null) {
            throw new Error("操练场初始化失败");
          }

          setChatTokenId(chatId);
          setImageTokenId(imageId);
        }
      } catch (loadError) {
        if (!cancelled) {
          setChatTokenId(null);
          setImageTokenId(null);
          setError(
            loadError instanceof Error ? loadError.message : "操练场初始化失败",
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

  return { chatTokenId, imageTokenId, tokenId: chatTokenId, error, loading };
}
