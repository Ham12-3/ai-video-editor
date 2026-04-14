import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow large video uploads (500MB) through the proxy (middleware)
    proxyClientMaxBodySize: "500mb",

    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
};

export default nextConfig;
