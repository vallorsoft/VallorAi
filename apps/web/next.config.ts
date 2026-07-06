import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@ai-home-designer/types'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: 'assets.vallorai.com' },
    ],
  },
  experimental: {
    typedRoutes: true,
  },
}

export default nextConfig
