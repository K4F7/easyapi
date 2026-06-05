export type SSEUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type SSEDelta = {
  type: "delta";
  content: string;
} | {
  type: "usage";
  usage: SSEUsage;
} | {
  type: "done";
};

export async function* parseSSE(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseFrame(frame);
        if (parsed) {
          yield parsed;
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(frame: string): SSEDelta | null {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");

  if (!data) return null;
  if (data === "[DONE]") return { type: "done" };

  try {
    const json = JSON.parse(data);
    const choice = json?.choices?.[0];
    const content = choice?.delta?.content ?? choice?.message?.content;
    if (typeof content === "string" && content.length > 0) {
      return { type: "delta", content };
    }
    if (json?.usage) {
      return { type: "usage", usage: json.usage };
    }
    if (choice?.finish_reason != null) {
      return { type: "done" };
    }
    return null;
  } catch {
    return { type: "delta", content: data };
  }
}
