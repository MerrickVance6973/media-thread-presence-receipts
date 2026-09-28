import { z } from "zod";

export const assetUpdateSchema = z.object({
  threadId: z.string().min(1),
  assetId: z.string().min(1),
  creatorId: z.string().min(1),
  requestId: z.string().uuid(),
  state: z.enum(["ingested", "processing", "delivered", "opened"])
});

export type AssetUpdate = z.infer<typeof assetUpdateSchema>;

export type ThreadSignal = {
  event: "typing.changed" | "receipt.updated";
  data: {
    asset_id: string;
    stage?: "processing";
    active?: boolean;
    status?: "delivered" | "read";
  };
};

export function planThreadSignal(update: AssetUpdate): ThreadSignal | null {
  switch (update.state) {
    case "ingested":
      return null;
    case "processing":
      return {
        event: "typing.changed",
        data: { asset_id: update.assetId, stage: "processing", active: true }
      };
    case "delivered":
      return {
        event: "receipt.updated",
        data: { asset_id: update.assetId, status: "delivered" }
      };
    case "opened":
      return {
        event: "receipt.updated",
        data: { asset_id: update.assetId, status: "read" }
      };
  }
}
