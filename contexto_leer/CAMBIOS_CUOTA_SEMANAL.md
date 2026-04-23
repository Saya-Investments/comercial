# Cambios — Regla 1 (cuota semanal) + nivel_al_asignar

> **Handoff para Yomira / su sesion de Claude.**
> Este documento describe los cambios aplicados al CRM y a la BD el 13 de Abril 2026.
> Commits asociados: `f09fa60` (cuota semanal + nivel_al_asignar) y posteriores.

---

## Resumen ejecutivo

El piloto comercial tiene **7 asesores** que reciben leads enrutados por `comercial-routing` (un servicio separado en Cloud Run). Antes, el routing y el cron de reasignaciones usaban un filtro binario de capacidad basado en `bd_asesores.capacidad_maxima`. Ese filtro **fue eliminado** y reemplazado por un sistema de **cuota semanal prometida** con split por nivel de calidad del lead (high/medium/low).

**Cambios clave:**

1. `bd_asesores.capacidad_maxima` **eliminado** definitivamente de la BD.
2. Nueva tabla `cuotas_semanales` con 6 contadores por asesor/semana: `cuota_high`, `cuota_medium`, `cuota_low`, `recibidos_high`, `recibidos_medium`, `recibidos_low`.
3. Nueva columna `matching.nivel_al_asignar` (VARCHAR(10), nullable) que persiste el nivel del lead al momento de la asignacion.
4. Cron `/api/cron/reasignaciones` y endpoint `/api/asesores-leads/reasignar-todos` ahora:
   - NO usan filtro binario de capacidad.
   - Decrementan/incrementan `cuotas_semanales.recibidos_<nivel>` en cada reasignacion.
   - Usan `matching.nivel_al_asignar` como fuente de verdad para el decremento del asesor anterior.
5. Endpoint `/api/asesores-leads` ya no expone `capacidadMaxima`.
6. Componentes `reassignment-module.tsx` y `bulk-reassign-modal.tsx` ya no muestran "Cola: X/Y" (ahora solo "Cola: X") ni validan "sinCapacidad".

---

## Setup local tras el pull

```bash
# 1. Pull la nueva version
git pull origin main

# 2. Instalar dependencias (si faltan)
npm install --legacy-peer-deps

# 3. Regenerar el cliente Prisma con el nuevo schema
npx prisma generate
```

**No se requiere migracion SQL**: la BD ya tiene los cambios aplicados en produccion (schema `comercial` en `34.82.84.15:5432`). `prisma generate` solo regenera los tipos TypeScript.

---

## Archivos modificados en este commit

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | Drop `capacidad_maxima` de `bd_asesores`. Add modelo `cuotas_semanales` con relacion a `bd_asesores`. Add `nivel_al_asignar String? @db.VarChar(10)` al modelo `matching`. |
| `app/api/cron/reasignaciones/route.ts` | Cron de 24h sin gestion. Ver seccion "Logica del cron" abajo. |
| `app/api/asesores-leads/reasignar-todos/route.ts` | Reasignacion masiva manual. Misma logica de dec/inc que el cron. |
| `app/api/asesores-leads/route.ts` | Quitado `capacidad_maxima` del select y del mapping al frontend. |
| `components/modules/reassignment-module.tsx` | Quitado `capacidadMaxima` de la interface `AsesorWithLeads` y del display (ahora solo `Cola: {leadsEnCola}`). |
| `components/modules/modals/bulk-reassign-modal.tsx` | Quitado `capacidadMaxima` de la interface `AsesorOption`, quitada validacion `sinCapacidad` y el badge "Excede capacidad". |
| `REASIGNACIONES.md` | Doc actualizada con el nuevo flujo de dec/inc de cuotas. |

---

## Cambios en BD (ya aplicados en produccion)

Estos cambios ya estan en produccion. Los documento aqui para que tu sesion de Claude entienda el estado. **NO ejecutar otra vez**.

```sql
-- 1. Drop metadata muerta
ALTER TABLE comercial.bd_asesores DROP COLUMN capacidad_maxima;

-- 2. Tabla nueva de cuotas semanales con split por nivel
CREATE TABLE comercial.cuotas_semanales (
    id_cuota         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_asesor        UUID NOT NULL REFERENCES comercial.bd_asesores(id_asesor),
    semana_inicio    DATE NOT NULL,
    cuota_high       INTEGER NOT NULL DEFAULT 0 CHECK (cuota_high >= 0),
    cuota_medium     INTEGER NOT NULL DEFAULT 0 CHECK (cuota_medium >= 0),
    cuota_low        INTEGER NOT NULL DEFAULT 0 CHECK (cuota_low >= 0),
    recibidos_high   INTEGER NOT NULL DEFAULT 0 CHECK (recibidos_high >= 0),
    recibidos_medium INTEGER NOT NULL DEFAULT 0 CHECK (recibidos_medium >= 0),
    recibidos_low    INTEGER NOT NULL DEFAULT 0 CHECK (recibidos_low >= 0),
    fecha_creacion   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (id_asesor, semana_inicio)
);
CREATE INDEX idx_cuotas_semana ON comercial.cuotas_semanales(semana_inicio, id_asesor);

-- 3. Nueva columna para persistir el nivel del lead al momento de la asignacion
ALTER TABLE comercial.matching ADD COLUMN nivel_al_asignar VARCHAR(10);
ALTER TABLE comercial.matching ADD CONSTRAINT matching_nivel_al_asignar_check
  CHECK (nivel_al_asignar IS NULL OR nivel_al_asignar IN ('high', 'medium', 'low'));

-- 4. Umbrales de clasificacion de niveles en config_modelo
INSERT INTO comercial.config_modelo (parametro, valor, tipo_dato, categoria, descripcion) VALUES
('score_umbral_alto',  '0.70', 'float', 'routing', 'Score minimo para clasificar lead como alto (cuota high)'),
('score_umbral_medio', '0.40', 'float', 'routing', 'Score minimo para clasificar lead como medio (cuota medium)');

-- 5. Seed semana 1 del piloto: los 7 asesores con 10 high + 6 medium + 4 low
INSERT INTO comercial.cuotas_semanales (id_asesor, semana_inicio, cuota_high, cuota_medium, cuota_low)
SELECT id_asesor, date_trunc('week', CURRENT_DATE)::date, 10, 6, 4
FROM comercial.bd_asesores;
```

---

## Como funciona el cron `api/cron/reasignaciones`

Corre cada 10 minutos via `vercel.json`:
```json
{ "path": "/api/cron/reasignaciones", "schedule": "*/10 * * * *" }
```

### Flujo

1. Busca matchings activos con `asignado=true AND fecha_asignacion < NOW() - 24h` (vencidos).
2. Para cada uno, verifica si existe una `crm_acciones_comerciales` posterior a `matching.fecha_asignacion`. Si existe, el asesor ya gestiono → se salta.
3. Si no gestiono, clasifica el lead en un nivel (`high`/`medium`/`low`) segun `bd_leads.scoring` **actual**.
4. Busca el siguiente asesor del `ranking_routing` (posicion mayor que la actual, `asignado=false`) que esté disponible y cuya cuota del nivel actual aun no este cumplida.
5. Si ninguno del ranking pasa el filtro de cuota, fallback al primer disponible sin filtro de cuota.
6. Ejecuta reasignacion en transaccion `prisma.$transaction(async (tx) => {...})`:
   - Desactiva el matching del asesor anterior (`asignado: false`).
   - Activa el matching del nuevo asesor con `asignado: true, fecha_asignacion: NOW(), nivel_al_asignar: nivelNuevo`.
   - Marca la posicion del ranking como `asignado: true`.
   - Actualiza `bd_leads.ultimo_asesor_asignado`.
   - Decrementa `bd_asesores.leads_en_cola` del anterior, incrementa el del nuevo.
   - **Decrementa `cuotas_semanales.recibidos_<nivelAnterior>`** del asesor anterior. `nivelAnterior` se lee de `match.nivel_al_asignar` (con fallback al score actual si la columna es NULL para matchings viejos).
   - **Incrementa `cuotas_semanales.recibidos_<nivelNuevo>`** del nuevo asesor.
   - Crea fila nueva en `hist_asignaciones` con `reasignado=true`, `id_asesor_anterior`, `motivo_reasignacion='Sin gestion en 24h'`.
   - Envia email al nuevo asesor.

### Por que dos niveles distintos (`nivelAnterior` vs `nivelNuevo`)

Cuando se asigna un lead a un asesor, el contador del asesor se incrementa con el nivel del lead EN ESE MOMENTO. Ese nivel queda persistido en `matching.nivel_al_asignar`. Si el lead sigue conversando con el bot y su score cruza una banda (ej. de high a medium), al reasignar 24h despues:

- El **decremento** del asesor anterior tiene que usar el nivel **que se uso al incrementar** — es decir, `matching.nivel_al_asignar` (el original).
- El **incremento** del nuevo asesor usa el nivel **actual** del lead — porque ahora el lead es medium, no high.

Asi los contadores quedan siempre consistentes, incluso cuando el nivel cambia entre la asignacion original y la reasignacion.

Los matchings creados antes de esta migracion tienen `nivel_al_asignar = NULL`. En esos casos el cron hace fallback al score actual para calcular el nivel anterior tambien (aproximacion razonable pero no exacta).

---

## Test manual del cron

Si quieres disparar el cron manualmente sin esperar a que Vercel lo llame, puedes:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://[tu-dominio-vercel]/api/cron/reasignaciones
```

Donde `$CRON_SECRET` es la variable de entorno configurada en Vercel (preguntar a Daniel si es necesaria).

La respuesta es JSON:
```json
{
  "ok": true,
  "timestamp": "2026-04-13T...",
  "matchingsRevisados": 0,
  "reasignados": 0,
  "sinCapacidad": 0
}
```

Si ves `matchingsRevisados > 0` significa que hay matchings vencidos siendo procesados. `reasignados` es cuantos efectivamente se reasignaron.

---

## Queries utiles para verificar el estado

Conectarse a `postgres://maquisistema:***@34.82.84.15:5432/bdMaqui` schema `comercial`:

```sql
-- Estado semanal de los 7 asesores del piloto
SELECT a.cod_asesor, a.nombre_asesor,
       c.cuota_high || '/' || c.recibidos_high AS high,
       c.cuota_medium || '/' || c.recibidos_medium AS medium,
       c.cuota_low || '/' || c.recibidos_low AS low
FROM comercial.cuotas_semanales c
JOIN comercial.bd_asesores a ON c.id_asesor = a.id_asesor
WHERE c.semana_inicio = date_trunc('week', CURRENT_DATE)::date
ORDER BY a.cod_asesor;

-- Matchings recientes con nivel_al_asignar poblado (deberia estar lleno post-deploy)
SELECT m.id_matching, a.cod_asesor, m.fecha_asignacion,
       m.nivel_al_asignar, m.score_total, m.asignado
FROM comercial.matching m
JOIN comercial.bd_asesores a ON m.id_asesor = a.id_asesor
WHERE m.fecha_evaluacion > NOW() - INTERVAL '1 day'
ORDER BY m.fecha_evaluacion DESC LIMIT 20;

-- Reasignaciones hechas por el cron en las ultimas 24h
SELECT h.fecha_asignacion, a_nuevo.cod_asesor AS nuevo,
       a_anterior.cod_asesor AS anterior, h.motivo_reasignacion
FROM comercial.hist_asignaciones h
JOIN comercial.bd_asesores a_nuevo ON h.id_asesor = a_nuevo.id_asesor
LEFT JOIN comercial.bd_asesores a_anterior ON h.id_asesor_anterior = a_anterior.id_asesor
WHERE h.reasignado = true
  AND h.fecha_asignacion > NOW() - INTERVAL '24 hours'
ORDER BY h.fecha_asignacion DESC;
```

---

## Componente sibling: `comercial-routing` (Cloud Run, repo separado)

Hay un servicio paralelo en GCP Cloud Run llamado `comercial-routing` (region `us-west4`, proyecto `codigopagomaquisistema`). Ese servicio dispara el **routing inicial** cuando llega un lead nuevo al bot. El codigo vive en `/home/admin_/comercial_routing/` en el entorno de Daniel, **no en este repo**.

Ese servicio tambien fue modificado el mismo dia para:

1. **Aplicar Regla 1 al asignar**: ordenar candidatos por `(progreso_cuota asc, score_3f desc)` y filtrar los que ya cumplieron `cuota_<nivel>`.
2. **Persistir `nivel_al_asignar`** al crear el matching (para que el cron del CRM pueda decrementar el nivel correcto).
3. **Setear `matching.fecha_asignacion = NOW()`** al crear el matching (antes quedaba NULL, lo que bloqueaba al cron del CRM porque el filtro `fecha_asignacion < NOW() - 24h` nunca matcheaba).
4. **Incrementar `cuotas_semanales.recibidos_<nivel>`** del asesor elegido en la misma operacion.
5. **Guardar en `ranking_routing` hasta 10 asesores del piloto** (antes guardaba el top 10 del ranking global de ~800 vendedores, y la mayoria no estaban en `bd_asesores`, dejando al ranking_routing casi vacio y al cascade de reasignacion sin candidatos).

Ese servicio ya esta desplegado en Cloud Run (revision `comercial-routing-00011-4j9`) y funcional. **No requiere accion desde este repo.**

---

## Pendientes / futuro

1. **Rebalanceo semanal batch** (Pendiente): cada viernes noche, recalcular las cuotas de la proxima semana segun rendimiento de la anterior (mas leads al que mas convierte). Hoy las cuotas son estaticas (fijas en 10/6/4 para todos). Esto se hace fuera del CRM, probablemente en un cron separado que actualice la tabla `cuotas_semanales` al cierre de la semana.

2. **Seed automatico semanal** (Pendiente): cada lunes, crear filas nuevas en `cuotas_semanales` para la semana actual con los valores del batch del viernes. Hoy se seedeo manualmente para la semana `2026-04-13`. Se puede hacer como parte del batch del viernes que insera directamente para la siguiente semana.

3. **Matchings historicos con `nivel_al_asignar = NULL`** (Aceptable): los matchings creados antes del deploy no tienen la columna poblada. Cuando se reasignen, el cron hace fallback al score actual. Es aproximado pero no es un bug — el codigo lo maneja con `??`.

4. **Persistir el nivel en `hist_asignaciones`** (Mejora futura opcional): si se quiere rastrear historicamente el nivel de cada evento de asignacion (no solo el estado actual), se puede agregar una columna similar a `hist_asignaciones`. No es necesario para el piloto.

---

## Decisiones de diseno (contexto para tu Claude)

- **Disponibilidad**: se mantiene el check `disponibilidad === 'disponible'` como filtro. NO es Regla 4 — es un flag de ausencia explicita (vacaciones, enfermedad). No se debe confundir con el filtro de cuota.
- **`GREATEST(x - 1, 0)` en decrementos**: protege contra contadores negativos si hay algun desfase. Si intentas bajar de 0, se queda en 0.
- **Fallback en `leer_cuota`**: si no hay fila en `cuotas_semanales` para esa semana, se trata como cuota no definida (progreso = 0, deja pasar al asesor). Evita que asesores sin cuota definida queden bloqueados si por alguna razon el seed semanal no corrio.
- **Sort estable Python/TypeScript**: tanto en el routing (Python) como en el CRM (TypeScript) el sort por `(progreso_cuota asc, score_3f desc)` explota la estabilidad del sort. En JavaScript, `Array.prototype.sort` es estable desde ES2019.

---

*Documento generado el 2026-04-13 tras el despliegue de los cambios del commit `f09fa60`.*
