import {
  PILOTO_RETADORA_DESDE,
  SCORE_OLA_1,
  SCORE_OLA_2,
} from '@/lib/no-enrutada-constants'

// Segmentacion X1-X7 de la base Retadora no enrutada, con las olas de X1 y X2.
//
// Traduccion literal del SQL de scripts/_refresh_slides_3_4_actionable.mjs
// (el mismo que genera el slide 3 de cambios_yomira/Mapa_base_piloto.html).
// La metodologia esta escrita en cambios_yomira/METODOLOGIA_MAPA_BASES_ACTUALIZADO.md
// secciones 7 y 8.
//
// Poblacion = bd_leads "Caliente" creados desde el inicio del piloto, NO
// enrutados (sin asignacion efectiva en `matching`), menos los que ya se
// inscribieron o estan estancados en el funnel NSV.
//
// La cascada X6 -> X7 -> X5 -> X1 -> X2 -> X3 -> X4 se calcula SIEMPRE
// completa aunque solo se filtren algunos grupos: cada lead cae en el PRIMER
// criterio que cumple, asi que calcular X4 por separado traeria leads que en
// realidad son X6 o X7 (ej. uno de provincia tambien respondio una frase).
//
// Unica diferencia con el script de analisis: aqui se exige `numero IS NOT NULL`
// porque una campana se envia por WhatsApp y un lead sin telefono no es
// contactable. Los criterios de segmentacion no cambian.
//
// No lleva parametros: los consumidores pueden numerar los suyos desde $1.
// Expone la CTE final `no_enrutada` con (id_lead, numero, grupo, score).
export const NO_ENRUTADA_CTE = `
WITH ne_enr AS (
  SELECT id_lead
  FROM comercial.matching
  WHERE asignado = true
  GROUP BY id_lead
),
ne_conv AS (
  SELECT id_lead, COUNT(*) FILTER (WHERE direccion = 'inbound')::int AS msgs_in
  FROM comercial.hist_conversaciones
  GROUP BY id_lead
),
ne_base AS (
  SELECT l.id_lead, l.numero,
    COALESCE(l.ultimo_scoring, l.scoring, l.probabilidad_de_conversion) AS score,
    COALESCE(cv.msgs_in, 0) AS msgs_in,
    (l.dni IS NOT NULL AND TRIM(l.dni) <> '') AS tiene_dni,
    -- Minimos operativos para poder enrutar: nombre + DNI + linea.
    ((l.nombre IS NULL OR TRIM(l.nombre) = '')::int
      + (l.dni IS NULL OR TRIM(l.dni) = '')::int
      + (l.linea IS NULL OR TRIM(l.linea) = '')::int) AS faltan_urgentes,
    (l.zona IS NOT NULL AND TRIM(l.zona) <> '' AND TRIM(l.zona) <> 'null'
      AND UPPER(TRIM(l.zona)) NOT IN ('LIMA','CALLAO')) AS es_provincia,
    (l.estado_de_lead = 'descartado' OR l.motivo_descarte IS NOT NULL) AS descartado,
    (p.fecha_inscrito IS NOT NULL) AS inscrito,
    (p.estado_documento IS NOT NULL AND p.fecha_inscrito IS NULL
      AND TRIM(p.estado_documento) NOT IN ('Anulado','Rechazado','Devuelto')
      AND p.fecha_estado < NOW() - INTERVAL '4 days') AS estancado
  FROM comercial.bd_leads l
  LEFT JOIN ne_enr e ON e.id_lead = l.id_lead
  LEFT JOIN ne_conv cv ON cv.id_lead = l.id_lead
  LEFT JOIN LATERAL (
    SELECT np.estado_documento, np.fecha_inscrito, np.fecha_estado
    FROM comercial.nsv_prospectos np
    WHERE np.telefono_norm = RIGHT(REGEXP_REPLACE(COALESCE(l.numero,''),'[^0-9]','','g'), 9)
      AND np.fecha_registro > l.fecha_creacion
    ORDER BY np.fecha_registro DESC
    LIMIT 1
  ) p ON true
  WHERE l."Base" = 'Caliente'
    AND l.fecha_creacion >= '${PILOTO_RETADORA_DESDE}'::timestamptz
    AND l.numero IS NOT NULL
    AND e.id_lead IS NULL
),
ne_seg AS (
  SELECT id_lead, numero, score, faltan_urgentes,
    CASE
      WHEN es_provincia   THEN 'X6'
      WHEN descartado     THEN 'X7'
      WHEN msgs_in = 0    THEN 'X5'
      WHEN tiene_dni      THEN 'X1'
      WHEN msgs_in >= 7   THEN 'X2'
      WHEN msgs_in BETWEEN 3 AND 6 THEN 'X3'
      ELSE 'X4'
    END AS segmento
  FROM ne_base
  WHERE NOT inscrito AND NOT estancado
),
no_enrutada AS (
  SELECT id_lead, numero, score, grupo
  FROM (
    SELECT id_lead, numero, score,
      CASE
        -- X1: minimos completos = nombre + DNI + linea (faltan_urgentes = 0).
        -- Ola 1 score >= 0,50 y ola 2 score 0,30-0,49 van a asesor directo;
        -- la ola 3 es todo lo demas (falta un minimo, o score < 0,30).
        WHEN segmento = 'X1' THEN
          CASE WHEN faltan_urgentes = 0 AND score >= ${SCORE_OLA_1} THEN 'X1_OLA1'
               WHEN faltan_urgentes = 0 AND score >= ${SCORE_OLA_2} THEN 'X1_OLA2'
               ELSE 'X1_OLA3' END
        -- X2 nunca tiene DNI, asi que faltan_urgentes = 1 significa
        -- exactamente "solo falta el DNI" (lo captura el asesor en el CRM).
        WHEN segmento = 'X2' THEN
          CASE WHEN faltan_urgentes = 1 AND score >= ${SCORE_OLA_1} THEN 'X2_OLA1'
               WHEN faltan_urgentes = 1 AND score >= ${SCORE_OLA_2} THEN 'X2_OLA2'
               ELSE 'X2_OLA3' END
        ELSE segmento
      END AS grupo
    FROM ne_seg
  ) g
)`
