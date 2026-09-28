import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { createInfraiRealtime, InfraiError } from "./infrai_realtime.js";
import { assetUpdateSchema, planThreadSignal } from "./thread_signal.js";

const openThreadSchema = z.object({
  threadId: z.string().min(1),
  viewerId: z.string().min(1),
  requestId: z.string().uuid()
});

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const infrai = createInfraiRealtime(apiKey);

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/threads/open") {
      const input = openThreadSchema.parse(await readJson(request));
      const channel = `media-thread:${input.threadId}`;
      await infrai.realtime.channel.create(channel, `${input.requestId}:channel`);
      const token = await infrai.realtime.token.issue(input.viewerId, channel, `${input.requestId}:token`);
      send(response, 201, { channel, token });
      return;
    }

    if (request.method === "POST" && request.url === "/threads/asset-update") {
      const input = assetUpdateSchema.parse(await readJson(request));
      const signal = planThreadSignal(input);
      if (signal) {
        await infrai.realtime.publish(
          `media-thread:${input.threadId}`,
          signal.event,
          signal.data,
          input.creatorId,
          input.requestId
        );
      }
      send(response, 202, { accepted: true, published: signal });
      return;
    }

    send(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      send(response, 400, { error: "invalid_request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, message: error.message });
      return;
    }
    send(response, 502, { error: "upstream_request_failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Media thread service listening on http://localhost:${port}`);
});
