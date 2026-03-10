import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import SupabaseKeyCheck from '@/components/SupabaseKeyCheck'

export const metadata: Metadata = {
  title: 'Atlas — AI-Powered Adaptive Learning',
  description: 'Transforming how teachers create lessons and students learn through intelligent, personalized education.',
  icons: { icon: '/favicon.ico' }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-atlas-bg text-atlas-text font-body antialiased min-h-screen" suppressHydrationWarning>
        {children}
        <SupabaseKeyCheck />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#111827',
              color: '#E8EDF5',
              border: '1px solid #1F2937',
              borderRadius: '12px',
              fontFamily: 'Instrument Sans, sans-serif',
            },
            success: { iconTheme: { primary: '#23D18B', secondary: '#111827' } },
            error: { iconTheme: { primary: '#F14C4C', secondary: '#111827' } },
          }}
        />
      </body>
    </html>
  )
}
