import { NextRequest, NextResponse } from 'next/server'
import { getOAuth2Client } from '@/lib/google-calendar'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const userId = req.nextUrl.searchParams.get('state')

  if (!code || !userId) {
    return NextResponse.redirect(new URL('/?google=error', req.url))
  }

  try {
    const oauth2Client = getOAuth2Client()
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL('/?google=error&reason=no_refresh_token', req.url))
    }

    await prisma.crm_usuarios.update({
      where: { id_usuario: userId },
      data: {
        google_refresh_token: tokens.refresh_token,
        fecha_actualizacion: new Date(),
      },
    })

    return NextResponse.redirect(new URL('/?google=success', req.url))
  } catch (error) {
    console.error('Google Calendar OAuth error:', error)
    return NextResponse.redirect(new URL('/?google=error', req.url))
  }
}
