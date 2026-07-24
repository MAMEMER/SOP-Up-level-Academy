import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin uses dynamic requires / native deps that break when bundled by
  // Turbopack/webpack — keep it external so it's required at runtime on the server.
  serverExternalPackages: ["firebase-admin"]
};

export default nextConfig;
