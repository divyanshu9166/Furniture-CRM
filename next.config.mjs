import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  // @xenova/transformers loads ONNX native bindings — must NOT be bundled.
  // Next.js server-side bundling breaks native .node addons; marking these
  // as external makes them loaded via require() at runtime instead.
  serverExternalPackages: ['@xenova/transformers', 'onnxruntime-node'],
  // Enable gzip/brotli compression for all responses (reduces payload 60-80%)
  compress: true,
  // Remove X-Powered-By header (minor security + bandwidth saving)
  poweredByHeader: false,
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', '*.github.dev', 'crm.kosmicfurniture.com']
    }
  },
  // Rewrite /uploads/* → /api/uploads/* so images stored with old paths still work
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: '/api/uploads/:path*',
      },
    ];
  },
  // Aggressive caching for static assets (_next/static)
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/api/uploads/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
