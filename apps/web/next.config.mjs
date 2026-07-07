/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@ai-home-designer/types', '@ai-home-designer/bim-engine'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: 'assets.vallorai.com' },
    ],
  },
}

export default nextConfig
