import { NextResponse } from "next/server";
import { mockAdminDashboardState } from "../../../../lib/admin-dashboard-data.ts";
import { splitStoreHubStockForDashboard } from "../../../../lib/storehub-stock.ts";

export async function GET() {
  const url = process.env.STOREHUB_STOCK_URL;
  const token = process.env.STOREHUB_API_TOKEN;

  if (!url) {
    return NextResponse.json({
      source: "mock",
      reason: "STOREHUB_STOCK_URL is not configured",
      stockItems: mockAdminDashboardState.stockItems,
      highValueCards: mockAdminDashboardState.highValueCards
    });
  }

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          source: "mock",
          reason: `StoreHub responded ${response.status}`,
          stockItems: mockAdminDashboardState.stockItems,
          highValueCards: mockAdminDashboardState.highValueCards
        },
        { status: 200 }
      );
    }

    const payload = await response.json();
    const mapped = splitStoreHubStockForDashboard(payload);

    return NextResponse.json({
      source: "storehub",
      fetchedAt: new Date().toISOString(),
      ...mapped
    });
  } catch (error) {
    return NextResponse.json({
      source: "mock",
      reason: error instanceof Error ? error.message : "StoreHub fetch failed",
      stockItems: mockAdminDashboardState.stockItems,
      highValueCards: mockAdminDashboardState.highValueCards
    });
  }
}
