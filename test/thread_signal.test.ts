import assert from "node:assert/strict";
import test from "node:test";
import { assetUpdateSchema, planThreadSignal } from "../src/thread_signal.js";

test("an opened delivery becomes a read receipt", () => {
  const update = assetUpdateSchema.parse({
    threadId: "edit-42",
    assetId: "cut-7",
    creatorId: "creator-9",
    requestId: "eb729b98-c023-46ab-9551-8b21fdca82d7",
    state: "opened"
  });

  assert.deepEqual(planThreadSignal(update), {
    event: "receipt.updated",
    data: { asset_id: "cut-7", status: "read" }
  });
});

test("ingestion alone stays quiet while processing emits typing", () => {
  const base = {
    threadId: "edit-42",
    assetId: "cut-7",
    creatorId: "creator-9",
    requestId: "426b4300-89c9-46bf-ad43-c758bbc7951e"
  };

  assert.equal(planThreadSignal(assetUpdateSchema.parse({ ...base, state: "ingested" })), null);
  assert.deepEqual(planThreadSignal(assetUpdateSchema.parse({ ...base, state: "processing" })), {
    event: "typing.changed",
    data: { asset_id: "cut-7", stage: "processing", active: true }
  });
});
