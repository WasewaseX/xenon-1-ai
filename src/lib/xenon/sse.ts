// Xenon 1 AI — SSE Response Helpers (server-only)
// کمکی‌های ساخت پاسخ Server-Sent Events برای جریان گفتگو

import type { StreamEvent } from "./types";

export function sseEvent(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function sseStream(
  producer: (emit: (event: StreamEvent) => void, signal: AbortSignal) => Promise<void>,
  signal?: AbortSignal
): Response {
  const encoder = new TextEncoder();
  const controllerRef = { controller: null as ReadableStreamDefaultController | null };
  const abort = new AbortController();

  // اگر کلاینت قطع شد، تولیدکننده را متوقف کن
  signal?.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef.controller = controller;
      const emit = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(sseEvent(event)));
        } catch {
          // جریان بسته شده
        }
      };
      // Keepalive: SSE comment pings are ignored by parsers but keep the TCP
      // connection warm so intermediate proxies (alb gateways) do not sever
      // the stream during long silent phases (research, agent tool loops).
      // This is the fix for client-side "Error in input stream" / 502 drops.
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // جریان بسته شده
        }
      }, 15_000);
      try {
        await producer(emit, abort.signal);
      } catch (err) {
        const message = err instanceof Error ? err.message : "خطای ناشناخته در جریان پاسخ";
        emit({ type: "error", message });
      } finally {
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          // noop
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
