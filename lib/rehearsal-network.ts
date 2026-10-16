export async function rehearsalFetch(...args: Parameters<typeof fetch>): Promise<Response> {
 if(typeof window !== "undefined" && typeof args[0] === "string" && args[0].startsWith("/") && !args[0].startsWith("//")) return fetch(...args);
 throw new Error("rehearsal-outbound-disabled");
}
