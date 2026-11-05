import { randomBytes } from "node:crypto";

export function randomId(prefix: string, bytes = 8) {
  return `${prefix}_${randomBytes(bytes).toString("hex")}`;
}

export function orderId() {
  // Human-friendly order number like a store would show, e.g. ORD-48213
  return `ORD-${Math.floor(10000 + Math.random() * 89999)}`;
}
