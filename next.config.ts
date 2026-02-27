import type { NextConfig } from "next";

const isStaticExport = process.env.STATIC_EXPORT === '1';
const staticBasePath = process.env.STATIC_BASE_PATH || '';
const normalizedBasePath =
  staticBasePath && staticBasePath !== '/' ? (staticBasePath.startsWith('/') ? staticBasePath : `/${staticBasePath}`) : '';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BASE_PATH: normalizedBasePath,
  },
  ...(isStaticExport
    ? {
        output: 'export',
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
  ...(normalizedBasePath
    ? {
        basePath: normalizedBasePath,
        assetPrefix: normalizedBasePath,
      }
    : {}),
};

export default nextConfig;
