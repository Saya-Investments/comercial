import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createMetaTemplate } from '@/lib/meta-template-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ============================================================================
// GET /api/templates
// Lista plantillas desde la BD. Por default excluye las marcadas como
// 'DELETED_IN_META' (ya no existen en Meta y no se deberian usar en campanas
// nuevas). Para traer todas, pasar ?includeDeleted=true.
// ============================================================================
export async function GET(request: NextRequest) {
  try {
    const includeDeleted =
      new URL(request.url).searchParams.get('includeDeleted') === 'true'

    const where = includeDeleted
      ? {}
      : { NOT: { estado_meta: 'DELETED_IN_META' } }

    const plantillas = await prisma.crm_plantillas.findMany({
      where,
      orderBy: { fecha_creacion: 'desc' },
    })

    // Shape compatible con el modulo. Incluye campos Meta para la UI nueva.
    const mapped = plantillas.map((p) => ({
      id: p.id_plantilla,
      name: p.nombre,
      content: p.contenido,
      metaId: p.meta_id,
      estadoMeta: p.estado_meta,
      categoria: p.categoria,
      idioma: p.idioma,
      header: p.header,
      footer: p.footer,
      botones: p.botones,
      headerType: p.header_type,
      createdDate: p.fecha_creacion.toISOString().split('T')[0],
      createdAt: p.fecha_creacion.toISOString(),
    }))

    return NextResponse.json(mapped)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ============================================================================
// POST /api/templates
// Crea la plantilla en Meta + guarda en BD.
// Body JSON esperado:
// {
//   nombre:      string (requerido)
//   mensaje:     string (requerido, puede tener {{1}}, {{2}}, ...)
//   categoria:   'MARKETING' | 'UTILITY' | 'AUTHENTICATION' (default MARKETING)
//   idioma:      string (default 'es_PE')
//   header:      string | null (texto plano, opcional)
//   footer:      string | null (opcional)
//   botones:     Array<{ type?: string; text: string }> | null (opcional)
//   ejemplos_mensaje: string[] (requerido si hay {{N}} en mensaje)
//   ejemplos_header:  string[] (requerido si hay {{N}} en header)
//   guardar_en_bd:    boolean (default true)
// }
// ============================================================================
type TemplateBody = {
  nombre: string
  mensaje: string
  descripcion?: string
  categoria?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  idioma?: string
  header?: string | null
  footer?: string | null
  botones?: Array<{ type?: string; text: string }> | null
  ejemplos_mensaje?: string[]
  ejemplos_header?: string[]
  guardar_en_bd?: boolean
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TemplateBody

    if (!body.nombre?.trim()) {
      return NextResponse.json({ success: false, error: 'nombre es requerido' }, { status: 400 })
    }
    if (!body.mensaje?.trim()) {
      return NextResponse.json({ success: false, error: 'mensaje es requerido' }, { status: 400 })
    }

    // 1. Crear la plantilla en Meta
    const metaResult = await createMetaTemplate({
      nombre: body.nombre,
      mensaje: body.mensaje,
      categoria: body.categoria ?? 'MARKETING',
      idioma: body.idioma ?? 'es_PE',
      header: body.header ?? null,
      headerFormat: 'TEXT',
      footer: body.footer,
      botones: body.botones,
      ejemplos_mensaje: body.ejemplos_mensaje,
      ejemplos_header: body.ejemplos_header,
    })

    // 2. Guardar en BD (por default si)
    let bdPlantilla = null
    if (body.guardar_en_bd !== false) {
      bdPlantilla = await prisma.crm_plantillas.create({
        data: {
          nombre: metaResult.nombreMeta,
          contenido: body.mensaje,
          tipo: 'whatsapp',
          meta_id: metaResult.metaId,
          estado_meta: metaResult.estadoMeta,
          categoria: body.categoria ?? 'MARKETING',
          idioma: body.idioma ?? 'es_PE',
          header: body.header ?? null,
          footer: body.footer ?? null,
          botones: body.botones ? (body.botones as object) : undefined,
          header_type: body.header ? 'TEXT' : null,
        },
      })
    }

    return NextResponse.json({
      success: true,
      meta: metaResult,
      bd: bdPlantilla,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const httpStatus = (error as { httpStatus?: number }).httpStatus ?? 500
    return NextResponse.json({ success: false, error: message }, { status: httpStatus })
  }
}

// ============================================================================
// DELETE /api/templates?id=...
// Alias del /api/templates/[id] para compatibilidad con el flujo viejo.
// Borra en Meta (best-effort) + BD.
// ============================================================================
export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const plantilla = await prisma.crm_plantillas.findUnique({
      where: { id_plantilla: id },
    })
    if (!plantilla) {
      return NextResponse.json({ success: false, error: 'Plantilla no encontrada' }, { status: 404 })
    }

    const { deleteMetaTemplate } = await import('@/lib/meta-template-service')
    let metaDeleted = false
    try {
      await deleteMetaTemplate(plantilla.nombre)
      metaDeleted = true
    } catch (error) {
      console.warn(
        `[templates/delete] No se pudo borrar '${plantilla.nombre}' de Meta:`,
        (error as Error).message,
      )
    }

    await prisma.crm_plantillas.delete({ where: { id_plantilla: id } })

    return NextResponse.json({ success: true, metaDeleted, ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
