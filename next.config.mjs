/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001'

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Generate unique build IDs using timestamp to prevent build mismatch errors
  generateBuildId: async () => {
    return `build-${Date.now()}`
  },
  // Allow cross-origin requests from network IPs during development
  // This fixes the warning about cross-origin requests to /_next/* resources
  experimental: {
    allowedDevOrigins: ['108.181.203.106'],
  },
  // Proxy M-Pesa payment API to Express backend
  async rewrites() {
    return [
      {
        source: '/api/payments/:path*',
        destination: `${backendUrl}/api/payments/:path*`,
      },
      {
        source: '/api/webhooks/:path*',
        destination: `${backendUrl}/api/webhooks/:path*`,
      },
      {
        source: '/api/system/:path*',
        destination: `${backendUrl}/api/system/:path*`,
      },
    ]
  },
  // Note: Cache-control headers are handled by middleware.ts
  // This ensures dynamic routes don't get cached aggressively
}

export default nextConfig