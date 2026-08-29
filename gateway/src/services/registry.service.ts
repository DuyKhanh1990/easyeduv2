import { eq, and } from "drizzle-orm";
import { bidvDb } from "../bidv-db.js";
import { gatewayRegistry, GatewayRegistry, InsertGatewayRegistry } from "../bidv-schema.js";

/** Tìm backend theo provider + routingKey (chỉ trả về entry đang active) */
export async function lookupBackend(
  provider: string,
  routingKey: string,
): Promise<GatewayRegistry | null> {
  const rows = await bidvDb
    .select()
    .from(gatewayRegistry)
    .where(
      and(
        eq(gatewayRegistry.provider, provider),
        eq(gatewayRegistry.routingKey, routingKey),
        eq(gatewayRegistry.isActive, true),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Thêm hoặc cập nhật một registry entry */
export async function upsertRegistry(
  data: InsertGatewayRegistry,
): Promise<GatewayRegistry> {
  const rows = await bidvDb
    .insert(gatewayRegistry)
    .values(data)
    .onConflictDoUpdate({
      target: [gatewayRegistry.provider, gatewayRegistry.routingKey],
      set: {
        centerId: data.centerId,
        name: data.name ?? null,
        baseUrl: data.baseUrl,
        isActive: data.isActive ?? true,
        updatedAt: new Date(),
      },
    })
    .returning();
  return rows[0];
}

/** Vô hiệu hoá một entry theo provider + routingKey */
export async function deactivateRegistry(
  provider: string,
  routingKey: string,
): Promise<void> {
  await bidvDb
    .update(gatewayRegistry)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(gatewayRegistry.provider, provider),
        eq(gatewayRegistry.routingKey, routingKey),
      ),
    );
}

/** Liệt kê tất cả entries, tuỳ chọn lọc theo provider */
export async function listRegistry(
  provider?: string,
): Promise<GatewayRegistry[]> {
  if (provider) {
    return bidvDb
      .select()
      .from(gatewayRegistry)
      .where(eq(gatewayRegistry.provider, provider));
  }
  return bidvDb.select().from(gatewayRegistry);
}
