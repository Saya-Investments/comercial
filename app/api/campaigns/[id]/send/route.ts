import { NextRequest, NextResponse } from 'next/server'

const ENVIOS_SERVICE_URL =
  process.env.ENVIOS_SERVICE_URL ||
  'https://envios-comercial-service-763512810578.us-west1.run.app'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const response = await fetch(`${ENVIOS_SERVICE_URL}/api/campaigns/${id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Error al enviar campaña', details: data },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error calling envios service:', error)
    return NextResponse.json(
      { error: 'No se pudo conectar con el servicio de envíos' },
      { status: 502 }
    )
  }
}
