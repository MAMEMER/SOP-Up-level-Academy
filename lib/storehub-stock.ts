import type { HighValueCard, StockItem } from "./admin-dashboard-data.ts";

export type StoreHubStockPayload = Record<string, unknown>;

function stringField(row: StoreHubStockPayload, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function numberField(row: StoreHubStockPayload, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

function rowsFromPayload(payload: unknown): StoreHubStockPayload[] {
  if (Array.isArray(payload)) return payload.filter((item): item is StoreHubStockPayload => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];

  const objectPayload = payload as Record<string, unknown>;
  const candidates = [objectPayload["products"], objectPayload["items"], objectPayload["data"], objectPayload["inventory"]];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return rowsFromPayload(candidate);
  }
  return [];
}

export function stockStatusFromQuantity(quantity: number, reorderPoint = 5): StockItem["status"] {
  if (quantity <= 0) return "out";
  if (quantity <= reorderPoint) return "low";
  return "normal";
}

function isHighValueCard(name: string, category: string, estimatedValue: number) {
  const text = `${name} ${category}`.toLowerCase();
  return estimatedValue >= 10000 || text.includes("single") || text.includes("graded") || text.includes("psa") || text.includes("high value");
}

export function mapStoreHubStockItems(payload: unknown): StockItem[] {
  return rowsFromPayload(payload).map((row) => {
    const rawId = stringField(row, ["id", "productId", "product_id", "sku", "barcode"], stringField(row, ["name", "productName"], "unknown"));
    const name = stringField(row, ["productName", "name", "title", "product_name"], "Unnamed StoreHub Product");
    const category = stringField(row, ["categoryName", "category", "category_name", "collection"], "StoreHub");
    const remaining = numberField(row, ["stockOnHand", "quantity", "availableQuantity", "inventoryQty", "qty", "stock"], 0);
    const reorderPoint = numberField(row, ["reorderPoint", "lowStockAlert", "minStock", "minimumStock"], 5);
    const unitValue = numberField(row, ["sellingPrice", "price", "retailPrice", "unitPrice"], 0);
    const updatedAt = stringField(row, ["updatedAt", "lastUpdated", "modifiedAt", "updated_at"], new Date().toISOString());
    const note = stringField(row, ["note", "remarks", "description"], "ดึงจาก StoreHub");

    return {
      id: `storehub-${rawId}`,
      name,
      category,
      remaining,
      status: stockStatusFromQuantity(remaining, reorderPoint),
      estimatedValue: Math.round(remaining * unitValue * 100) / 100,
      lastCheckedBy: "StoreHub",
      updatedAt,
      note
    };
  });
}

export function splitStoreHubStockForDashboard(payload: unknown) {
  const mapped = mapStoreHubStockItems(payload);
  const highValueCards: HighValueCard[] = [];
  const stockItems: StockItem[] = [];

  mapped.forEach((item) => {
    if (isHighValueCard(item.name, item.category, item.estimatedValue)) {
      highValueCards.push({
        id: item.id,
        name: item.name,
        category: item.category,
        status: item.remaining > 0 ? "showcase" : "missing_review",
        estimatedValue: item.estimatedValue,
        lastCheckedBy: item.lastCheckedBy,
        updatedAt: item.updatedAt,
        note: item.note
      });
      return;
    }

    stockItems.push(item);
  });

  return { stockItems, highValueCards };
}
