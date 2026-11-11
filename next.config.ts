import type { NextConfig } from 'next'

// Nothing to configure. Every image is drawn `unoptimized` straight off the bucket's public
// origin — the stored file already is the compressed one, and a second pass through the Next
// optimizer would only re-encode it — so there is no `images.remotePatterns` to allow.
const nextConfig: NextConfig = {}

export default nextConfig
