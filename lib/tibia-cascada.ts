import { VENTANA_TIBIA_DESDE, VENTANA_TIBIA_HASTA } from '@/lib/tibia-constants'

// Cascada de priorizacion P1-P7 sobre la base tibia.
// Traduccion literal del SQL de cambios_yomira/RECONSTRUCCION_CASCADA_P1P7.md (seccion 4).
//
// Poblacion = base tibia (Caliente + LIMA + no descartado/venta_cerrada + ultima accion
// dentro de la ventana) MENOS los que ya tienen cruce NSV en estado 'Inscrito'.
//
// La cascada se calcula SIEMPRE completa aunque solo se filtren algunos escalones:
// cada lead cae en el PRIMER escalon que cumple, asi que calcular P5 por separado
// traeria leads que en realidad son P1-P4 (ej. uno con proforma tambien esta 'Contactado').
//
// No lleva parametros: los consumidores pueden numerar los suyos desde $1.
// Expone la CTE final `cascada` con (id_lead, numero, escalon).
export const TIBIA_CASCADA_CTE = `
WITH ult_accion AS (
  SELECT id_lead, MAX(fecha_creacion) AS ultima_accion
  FROM comercial.crm_acciones_comerciales
  GROUP BY id_lead
),
base AS (
  SELECT l.id_lead, l.numero, l.fecha_creacion,
         EXISTS (
           SELECT 1 FROM comercial.nsv_prospectos_completos n
           WHERE n.telefono_norm = RIGHT(REGEXP_REPLACE(COALESCE(l.numero,''),'[^0-9]','','g'),9)
             AND n.fecha_registro > l.fecha_creacion
             AND TRIM(n.estado_documento) = 'Inscrito'
         ) AS inscrito
  FROM comercial.bd_leads l
  JOIN ult_accion ua ON ua.id_lead = l.id_lead
  WHERE l."Base" = 'Caliente'
    AND l.zona = 'LIMA'
    AND l.estado_de_lead NOT IN ('descartado','venta_cerrada')
    AND l.numero IS NOT NULL
    AND ua.ultima_accion >= '${VENTANA_TIBIA_DESDE}'::timestamptz
    AND ua.ultima_accion <  '${VENTANA_TIBIA_HASTA}'::timestamptz
),
acc AS (
  SELECT id_lead, numero, fecha_creacion FROM base WHERE NOT inscrito
),
nsv AS (
  SELECT a.id_lead, TRIM(p.estado_documento) AS estado
  FROM acc a
  JOIN LATERAL (
    SELECT np.estado_documento
    FROM comercial.nsv_prospectos_completos np
    WHERE np.telefono_norm = RIGHT(REGEXP_REPLACE(COALESCE(a.numero,''),'[^0-9]','','g'),9)
      AND np.fecha_registro > a.fecha_creacion
    ORDER BY np.fecha_registro DESC
    LIMIT 1
  ) p ON true
),
flags AS (
  SELECT a.id_lead, a.numero,
    EXISTS(SELECT 1 FROM nsv n WHERE n.id_lead = a.id_lead
           AND n.estado = ANY(ARRAY['Con proforma','Proforma aprobada','Firmado','Firmando',
               'Firmado Parcialmente','Firmas en Revision','Firmas en Revisión','Pago parcial',
               'Pago completo','Inscrito','Inscrito Parcialmente'])) AS proforma_plus,
    EXISTS(SELECT 1 FROM nsv n WHERE n.id_lead = a.id_lead
           AND n.estado NOT IN ('Anulado','Rechazado','Devuelto')) AS nsv_activo,
    EXISTS(SELECT 1 FROM comercial.crm_campana_leads c
           WHERE c.id_lead = a.id_lead AND c.respondio IS TRUE) AS respondio_bot,
    EXISTS(SELECT 1 FROM comercial.crm_acciones_comerciales x WHERE x.id_lead = a.id_lead
           AND x.estado_asesor IN ('Interesado','Seguimiento','Cita_agendada','Prospecto','Llamada_agendada')) AS viva,
    EXISTS(SELECT 1 FROM comercial.crm_acciones_comerciales x
           WHERE x.id_lead = a.id_lead AND x.estado_asesor = 'Contactado') AS contactado,
    EXISTS(SELECT 1 FROM comercial.crm_acciones_comerciales x
           WHERE x.id_lead = a.id_lead AND x.estado_asesor = 'No_interesado') AS dijo_no
  FROM acc a
),
cascada AS (
  SELECT id_lead, numero,
    CASE
      WHEN proforma_plus              THEN 'P1'
      WHEN respondio_bot              THEN 'P2'
      WHEN nsv_activo                 THEN 'P3'
      WHEN viva                       THEN 'P4'
      WHEN contactado AND NOT dijo_no THEN 'P5'
      WHEN dijo_no                    THEN 'P6'
      ELSE                                 'P7'
    END AS escalon
  FROM flags
)`
