import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'GCP Monitor — RaceStreamPro',
}

export default function MonitorLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta name="viewport" content="width=320, initial-scale=1" />
      </head>
      <body className="bg-transparent overflow-hidden">
        {children}
      </body>
    </html>
  )
}
