import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAllMetaTemplates } from '@/lib/meta-template-service'

export const runtime = 'nodejs'

// POST /api/templates/sync — espeja las plantillas de Meta en la BD:
// - Crea las que existen en Meta pero no en BD (match por nombre).
// - Actualiza las existentes (preserva UUIDs para no romper campanas).
// - Para las que estan en BD pero ya NO en Meta (huerfanas):
//     - Intenta borrarlas.
//     - Si el borrado falla (tienen campanas asociadas via FK), las marca
//       con estado_meta = 'DELETED_IN_META' para preservar historico + evitar
//       que se usen en campanas nuevas.
export async function POST() {
  try {
    const metaTemplates = await getAllMetaTemplates()

    const bdPlantillas = await prisma.crm_plantillas.findMany({
      select: { id_plantilla: true, nombre: true, estado_meta: true, meta_id: true },
    })
    const bdByName = new Map(bdPlantillas.map((t) => [t.nombre, t]))
    const metaNames = new Set(metaTemplates.map((m) => m.nombre))

    let creadas = 0
    let actualizadas = 0
    let borradas = 0
    let marcadasComoEliminadas = 0
    const errores: Array<{ nombre: string; error: string }> = []

    // Crear / actualizar las que vinieron de Meta
    for (const mt of metaTemplates) {
      try {
        const existing = bdByName.get(mt.nombre)
        if (existing) {
          await prisma.crm_plantillas.update({
            where: { id_plantilla: existing.id_plantilla },
            data: {
              estado_meta: mt.estadoMeta,
              meta_id: mt.id,
              categoria: mt.categoria,
              idioma: mt.idioma,
              contenido: mt.contenido,
              header: mt.header,
              footer: mt.footer,
              botones: mt.botones ? (mt.botones as object) : undefined,
              header_type: mt.headerFormat ?? null,
              fecha_actualizacion: new Date(),
            },
          })
          actualizadas++
        } else {
          await prisma.crm_plantillas.create({
            data: {
              nombre: mt.nombre,
              contenido: mt.contenido,
              tipo: 'whatsapp',
              meta_id: mt.id,
              estado_meta: mt.estadoMeta,
              categoria: mt.categoria,
              idioma: mt.idioma,
              header: mt.header,
              footer: mt.footer,
              botones: mt.botones ? (mt.botones as object) : undefined,
              header_type: mt.headerFormat ?? null,
            },
          })
          creadas++
        }
      } catch (error) {
        errores.push({ nombre: mt.nombre, error: (error as Error).message })
      }
    }

    // Manejar huerfanas (existen en BD pero no en Meta)
    const orphans = bdPlantillas.filter((t) => !metaNames.has(t.nombre))
    for (const orphan of orphans) {
      try {
        // Intento #1: borrar completamente
        await prisma.crm_plantillas.delete({ where: { id_plantilla: orphan.id_plantilla } })
        borradas++
      } catch {
        // Falla tipicamente por FK (crm_campanas.id_plantilla apunta a esta).
        // Fallback: soft-flag. Preservamos la fila para mantener el historico
        // de campanas que la usaron, y la marcamos como eliminada en Meta
        // para que la UI la filtre del flujo de crear nueva campana.
        try {
          await prisma.crm_plantillas.update({
            where: { id_plantilla: orphan.id_plantilla },
            data: { estado_meta: 'DELETED_IN_META' },
          })
          marcadasComoEliminadas++
        } catch (updateError) {
          errores.push({
            nombre: orphan.nombre,
            error: `No se pudo borrar ni marcar como eliminada: ${(updateError as Error).message}`,
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      resumen: {
        totalMeta: metaTemplates.length,
        totalBdAntes: bdPlantillas.length,
        creadas,
        actualizadas,
        borradas,
        marcadasComoEliminadas,
        errores: errores.length,
      },
      errores,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
