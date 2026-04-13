import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mott/db"],
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
