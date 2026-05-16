import { withSentryConfig } from '@sentry/nextjs';
/** @type {import('next').NextConfig} */
const nextConfig = {
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

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "global-ministries",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
