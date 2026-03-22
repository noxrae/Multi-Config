import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nova Suite | Unified Mission Control',
  description: 'Galaxy-Scale Data Transformation',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="deep-space">{children}</body>
    </html>
  )
}

