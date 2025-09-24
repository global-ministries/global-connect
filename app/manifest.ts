import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  const name = 'Global Barquisimeto'
  const short_name = 'Global'
  const description = 'Sistema para los miembros de Global Barquisimeto.'
  const iconUrl = 'https://wcnqocyqtksxhthnquta.supabase.co/storage/v1/object/public/logos/favicon%20global.webp'

  return {
    name,
    short_name,
    description,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      {
        src: iconUrl,
        sizes: '512x512',
        type: 'image/webp',
  purpose: 'maskable',
      },
    ],
  }
}
