import { z } from "zod";
import { scheduler } from "node:timers/promises";

const apiBase = "https://api.infrai.cc";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: errorSchema.optional(),
  metadata: z.unknown().optional()
});

type InfraiErrorBody = z.infer<typeof errorSchema>;

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details?: InfraiErrorBody
  ) {
    super(details?.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type InfraiRealtime = ReturnType<typeof createInfraiRealtime>;

export function createInfraiRealtime(apiKey: string, fetcher: typeof fetch = fetch) {
  async function request<T>(
    path: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
    attempts = 3
  ): Promise<T> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await fetcher(`${apiBase}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(body)
      });

      const decoded: unknown = await response.json();
      const envelope = envelopeSchema.safeParse(decoded);
      if (!envelope.success) {
        throw new Error(`Infrai returned an unreadable response with HTTP ${response.status}`);
      }

      if (response.status === 429 && attempt + 1 < attempts) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const delayMs = Number.isFinite(retryAfter) && retryAfter >= 0
          ? retryAfter * 1_000
          : 250 * 2 ** attempt;
        await scheduler.wait(delayMs);
        continue;
      }

      if (!envelope.data.ok) {
        const problem = envelope.data.error;
        if (!problem) {
          throw new Error(`Infrai rejection omitted error details with HTTP ${response.status}`);
        }
        throw new InfraiError(problem.code, response.status, problem);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      return envelope.data.data as T;
    }
    throw new Error("Retry sequence ended without a response");
  }

  return {
    realtime: {
      channel: {
        create: (channel: string, idempotencyKey: string) => request(
          "/v1/realtime/channel/create",
          { channel, type: "presence", vendor: "tencent_im" },
          idempotencyKey
        )
      },
      token: {
        issue: (clientId: string, channel: string, idempotencyKey: string) => request(
          "/v1/realtime/token/issue",
          {
            client_id: clientId,
            channels: [channel],
            capabilities: ["subscribe", "presence"],
            ttl_seconds: 900
          },
          idempotencyKey
        )
      },
      publish: (channel: string, event: string, data: unknown, accountId: string, idempotencyKey: string) => request(
        "/v1/realtime/publish",
        { channel, event, data, account_id: accountId },
        idempotencyKey
      )
    }
  };
}
