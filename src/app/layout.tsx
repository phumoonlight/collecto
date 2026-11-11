import type { Metadata, Viewport } from 'next'
import { Geist_Mono, Lexend } from 'next/font/google'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import { Analytics } from '@/components/analytics'
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/config'

// A variable font, so the whole 100-900 range is one file.
const lexendSans = Lexend({
  variable: '--font-lexend-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0a',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${lexendSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Navigation lives in the sticky SiteHeader each page renders */}
        <main className="flex-1 pb-8">{children}</main>
        {/* Both no-op off Vercel, so a local run stays silent */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
