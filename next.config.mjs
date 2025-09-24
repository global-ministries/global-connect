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
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'wcnqocyqtksxhthnquta.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // Configuración para desarrollo con proxy
  allowedDevOrigins: [
    'http://localhost:3000',
    'http://localhost:3001', 
    'http://127.0.0.1:58303',
    'http://127.0.0.1:57901',
    'http://0.0.0.0:3000',
    'http://0.0.0.0:3001',
    'https://localhost:3000',
    'https://localhost:3001'
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        'http://localhost:3000', 
        'http://localhost:3001', 
        'http://127.0.0.1:58303',
        'http://127.0.0.1:57901',
        'http://0.0.0.0:3000',
        'http://0.0.0.0:3001',
        'localhost:3000', 
        'localhost:3001', 
        '127.0.0.1:58303',
        '127.0.0.1:57901'
      ],
      bodySizeLimit: '10mb', // Aumentar límite a 10MB para fotos
    },
  },
}

export default nextConfig
