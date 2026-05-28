import React from "react"
import type { Metadata } from 'next'
import { AuthProvider } from '@/contexts/auth-context'

import './globals.css'

export const metadata: Metadata = {
  title: 'maqui+ CRM | Gestión de Leads Comerciales',
  description: 'CRM profesional para gestionar leads, campañas y estrategia comercial',
  generator: 'v0.app',
  // Bloquea Google Translate (toolbar/plugin). El atributo translate="no" del
  // <html> cubre la traduccion built-in de Chrome/Edge/Safari.
  other: { google: 'notranslate' },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // lang="es": la UI esta en espanol — antes decia "en" y eso confundia al
    // traductor del navegador. translate="no": desactiva la traduccion
    // automatica para todo el CRM (los nombres de estado del asesor se
    // mistraducian, p.ej. "No contesta" -> "Sin oposicion").
    <html lang="es" translate="no">
      <body className="notranslate font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
