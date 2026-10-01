import type {MetadataRoute} from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'THSR Booking Clone — 非官方期末專題',
    short_name: 'THSR Booking',
    description: 'A non-official course project that recreates a Taiwan high-speed rail booking flow.',
    start_url: '/zh',
    display: 'standalone',
    background_color: '#f7fafc',
    theme_color: '#ffffff',
    lang: 'zh-TW',
    icons: [
      {
        src: '/brand/thsr-logo.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any'
      }
    ]
  };
}
