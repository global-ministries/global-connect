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
  // T10 (odd/tasks/talleres-consolidar-pantallas.md) — every old talleres
  // URL that has a static (no-lookup) new destination. The single source
  // of truth is lib/platform/talleres/rutas.ts's TALLERES_RUTAS_ANTIGUAS
  // (`puente: false` entries only — the 4 `puente: true` entries have no
  // entry here on purpose: their own page.tsx resolves the redirect at
  // request time, because the old id alone can't build the new path with
  // a static source/destination pair — see lib/platform/talleres/
  // bridges.ts). __tests__/lib/platform/talleres/rutas.test.ts's "T10 —
  // every origen actually resolves" suite cross-checks this list against
  // that inventory in both directions (nothing missing, nothing extra),
  // so this array and rutas.ts can never drift apart silently.
  //
  // Order matters for the 2 `/admin/talleres/abstracto/...` entries: the
  // exact-path `/nuevo` redirect must come before the `:slug` wildcard,
  // or `nuevo` itself would match `:slug` and redirect to `/talleres/nuevo`.
  //
  // `permanent: true` (308) throughout: this is each route's FINAL
  // destination, not a stopgap, so it's safe for browsers to cache.
  async redirects() {
    return [
      { source: '/talleres/grupos', destination: '/talleres', permanent: true },
      { source: '/talleres/sesiones', destination: '/talleres', permanent: true },

      { source: '/talleres/direccion', destination: '/talleres', permanent: true },
      { source: '/talleres/direccion/talleres', destination: '/talleres', permanent: true },
      { source: '/talleres/direccion/periodos', destination: '/talleres', permanent: true },
      { source: '/talleres/direccion/equipos', destination: '/talleres', permanent: true },
      { source: '/talleres/direccion/solicitudes', destination: '/talleres/pendientes', permanent: true },
      { source: '/talleres/direccion/metricas', destination: '/talleres', permanent: true },
      { source: '/talleres/direccion/reportes', destination: '/talleres/reportes', permanent: true },

      { source: '/talleres/coordinacion', destination: '/talleres', permanent: true },
      { source: '/talleres/coordinacion/inscripciones', destination: '/talleres/pendientes', permanent: true },
      { source: '/talleres/coordinacion/talleres', destination: '/talleres', permanent: true },
      { source: '/talleres/coordinacion/equipos', destination: '/talleres', permanent: true },
      { source: '/talleres/coordinacion/reportes', destination: '/talleres/reportes', permanent: true },
      { source: '/talleres/coordinacion/solicitudes', destination: '/talleres/pendientes', permanent: true },

      { source: '/talleres/equipo/mis-grupos', destination: '/talleres', permanent: true },
      { source: '/talleres/equipo/proximas-sesiones', destination: '/talleres', permanent: true },
      { source: '/talleres/equipo/recursos', destination: '/talleres', permanent: true },

      { source: '/talleres/mis-talleres', destination: '/talleres/mi-recorrido', permanent: true },
      { source: '/talleres/historial', destination: '/talleres/mi-recorrido?tab=historial', permanent: true },
      { source: '/talleres/certificados', destination: '/talleres/mi-recorrido?tab=certificados', permanent: true },
      { source: '/talleres/certificados/:id', destination: '/talleres/mi-recorrido/certificados/:id', permanent: true },

      { source: '/admin/talleres/abstracto', destination: '/talleres', permanent: true },
      { source: '/admin/talleres/abstracto/nuevo', destination: '/talleres', permanent: true },
      { source: '/admin/talleres/abstracto/:slug', destination: '/talleres/:slug', permanent: true },
      { source: '/admin/talleres/inscripciones', destination: '/talleres/pendientes', permanent: true },
      { source: '/admin/talleres/temporadas', destination: '/talleres/temporadas', permanent: true },
      { source: '/admin/talleres/temporadas/:id', destination: '/talleres/temporadas/:id', permanent: true },
      { source: '/admin/talleres/temporadas/crear', destination: '/talleres/temporadas/crear', permanent: true },
    ]
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
