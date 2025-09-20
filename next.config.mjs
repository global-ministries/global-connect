/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', '127.0.0.1:53793', '0.0.0.0:3000'],
      bodySizeLimit: '10mb', // Aumentar límite a 10MB para fotos
    },
  },
}

export default nextConfig
