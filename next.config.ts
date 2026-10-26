import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // نشانگر «N» توسعهٔ Next.js در گوشهٔ پایین، روی نوار وضعیت افتاده بود — غیرفعال شد
  devIndicators: false,
};

export default nextConfig;
