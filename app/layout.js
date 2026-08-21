import './globals.css'

export const metadata = {
  title: 'KargoSkor — Kargonu Puanla',
  description: 'Türkiye\'nin kargo değerlendirme platformu. Takip numaranla kargo deneyimini puanla.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
