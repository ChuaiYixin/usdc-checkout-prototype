import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libsql ships a native binary; keep it out of the server bundle.
  serverExternalPackages: ["@libsql/client", "libsql"],
  devIndicators: false,
};

export default nextConfig;
