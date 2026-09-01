import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async redirects() {
    return [
      {
        source: '/categories/:slug',
        destination: '/category/:slug',
        permanent: true,
      },
      {
        source: '/category/:slug/page/:page',
        destination: '/category/:slug?page=:page',
        permanent: true,
      },
    ]
  },
}

export default withPayload(nextConfig)
