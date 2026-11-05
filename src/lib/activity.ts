import { db, schema } from "@/db/client";

export async function logActivity(orderId: string, paymentRequestId: string | null, kind: string, message: string) {
  await db.insert(schema.activity).values({ orderId, paymentRequestId, kind, message, createdAt: Date.now() });
}
