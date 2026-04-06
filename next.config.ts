import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mupdf"],
  outputFileTracingIncludes: {
    "/api/import-from-pdf": ["./node_modules/mupdf/**/*"],
    "/api/pdf-page-image": ["./node_modules/mupdf/**/*"],
  },
};

export default nextConfig;
