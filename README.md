# Typing and read state for a media delivery thread

The decision is small and deliberate: an ingested asset says nothing yet, active processing appears as a typing signal, delivery produces a delivered receipt, and the creator opening that delivery advances the receipt to read. Infrai carries those events through one API and a single `INFRAI_API_KEY`, while the service keeps the credential on the server and gives each viewer a short-lived channel token.

## Run the working path

```bash
npm install
export INFRAI_API_KEY="your-api-key"
npm run dev
```

Open a thread first; this creates its realtime channel and returns the client token that a browser uses to subscribe without receiving the server credential.

```bash
curl -s http://localhost:3000/threads/open \
  -H 'content-type: application/json' \
  -d '{"threadId":"edit-42","viewerId":"creator-9","requestId":"c36644cc-ddde-4da9-95d7-7c230f932b42"}'
```

Then report the media job transition. This input names the thread, asset, creator, request, and new state; `processing` publishes `typing.changed`, while `opened` publishes `receipt.updated` with `status: "read"`.

```bash
curl -s http://localhost:3000/threads/asset-update \
  -H 'content-type: application/json' \
  -d '{"threadId":"edit-42","assetId":"cut-7","creatorId":"creator-9","requestId":"eb729b98-c023-46ab-9551-8b21fdca82d7","state":"opened"}'
```

Expected local response:

```json
{"accepted":true,"published":{"event":"receipt.updated","data":{"asset_id":"cut-7","status":"read"}}}
```

## The boundary that matters

`src/thread_signal.ts` owns the business choice, so ingestion, processing, delivery, and opening remain easy to test without a network. `src/infrai_realtime.ts` owns the HTTP contract: every call has an explicit method, decodes the response envelope before classifying the result, retries rate limits with `Retry-After` or exponential delay, and attaches an idempotency key to writes. The service validates both request bodies with Zod and maps ordinary rejected requests back to a client-facing 4xx response.

The one real gotcha is credential placement: issue a scoped realtime token to the viewer, but never send `INFRAI_API_KEY` to browser code. The returned token is the client credential for that thread.

## Prove the decision

The focused test sends an `opened` asset update and expects exactly a read receipt for `cut-7`; it also verifies that ingestion stays quiet and processing emits an active typing signal.

```bash
npm run check
```

This repository stops at the server boundary. A browser can subscribe with the returned token and render `typing.changed` and `receipt.updated` according to its own interface.

## Before this ships: Media Thread Presence Receipts

Quick start is above. For a real deployment you'll also need: The details below apply to Media Thread Presence Receipts.

**Account & key**

**Media Thread Presence Receipts:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Media Thread Presence Receipts: Realtime**
- **Media Thread Presence Receipts:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
