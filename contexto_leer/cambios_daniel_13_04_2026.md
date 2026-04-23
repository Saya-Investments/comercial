# Cambios — 13 Abril 2026

Implementacion de **Regla 1 (progreso en cuota semanal)** en el routing, siguiendo el plan de arquitectura de 2 capas con Patron A + Opcion X documentado en `ARQUITECTURA_ROUTING.md`.

---

## Contexto

El routing actual del piloto solo usaba el score 3 factores + filtro binario de capacidad (`leads_en_cola >= capacidad_maxima`). Se decidio:

1. Eliminar el filtro binario de capacidad — era un parche temporal, no parte del diseno.
2. Implementar Regla 1 (cuota semanal) como driver primario de la capa operativa.
3. Mantener Regla 3 (modelo 3 factores) como segundo criterio de ordenamiento.
4. Arrancar con cuota estatica (sin rebalanceo batch aun).
5. Split por calidad desde semana 1, priorizando calientes: **10 high + 6 medium + 4 low** por asesor = 20 leads prometidos.

---

## Cambios en BD (PostgreSQL `bdMaqui.comercial`)

### 1. `bd_asesores` — drop metadata muerta

```sql
ALTER TABLE bd_asesores DROP COLUMN capacidad_maxima;
```

La columna `capacidad_maxima` era metadata del filtro binario eliminado. Se borra porque nadie la usa (verificado con grep sobre `comercial/` y `comercial_routing/`).

`leads_en_cola` se deja porque el CRM probablemente lo usa como metrica visual. El routing lo sigue incrementando al crear asignacion pero ya no lo usa como filtro.

### 2. `cuotas_semanales` — tabla nueva

```sql
CREATE TABLE cuotas_semanales (
    id_cuota         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_asesor        UUID NOT NULL REFERENCES bd_asesores(id_asesor),
    semana_inicio    DATE NOT NULL,  -- lunes ISO de la semana

    cuota_high       INTEGER NOT NULL DEFAULT 0 CHECK (cuota_high >= 0),
    cuota_medium     INTEGER NOT NULL DEFAULT 0 CHECK (cuota_medium >= 0),
    cuota_low        INTEGER NOT NULL DEFAULT 0 CHECK (cuota_low >= 0),

    recibidos_high   INTEGER NOT NULL DEFAULT 0 CHECK (recibidos_high >= 0),
    recibidos_medium INTEGER NOT NULL DEFAULT 0 CHECK (recibidos_medium >= 0),
    recibidos_low    INTEGER NOT NULL DEFAULT 0 CHECK (recibidos_low >= 0),

    fecha_creacion   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (id_asesor, semana_inicio)
);
CREATE INDEX idx_cuotas_semana ON cuotas_semanales(semana_inicio, id_asesor);
```

**Diseno**:
- Una fila por `(asesor, semana)`. Las semanas viejas quedan como historico (util para auditar y para el rebalanceo batch futuro).
- Split en 3 niveles (high/medium/low) para soportar cuotas separadas por calidad del lead.
- `recibidos_*` se incrementa cuando el routing asigna un lead al asesor, atomicamente (en funcion separada por ahora).

### 3. `config_modelo` — umbrales de clasificacion de niveles

```sql
INSERT INTO config_modelo (parametro, valor, tipo_dato, categoria, descripcion) VALUES
('score_umbral_alto',  '0.70', 'float', 'routing', 'Score minimo para clasificar lead como alto (cuota high)'),
('score_umbral_medio', '0.40', 'float', 'routing', 'Score minimo para clasificar lead como medio (cuota medium)');
```

Los umbrales coinciden con los que usa el CRM para el modulo de tareas por prioridad (ver `FUNCIONALIDADES_ASESOR.md`): `>= 0.70` es alto, `0.40 - 0.69` medio, `< 0.40` bajo.

`score_umbral_caliente` (0.7) existente no se toca — es para el split 30/70 del call center, es una config conceptualmente distinta.

### 4. Seed semana 1 (lunes `2026-04-13`)

```sql
INSERT INTO cuotas_semanales (id_asesor, semana_inicio, cuota_high, cuota_medium, cuota_low)
SELECT id_asesor, date_trunc('week', CURRENT_DATE)::date, 10, 6, 4
FROM bd_asesores;
```

Los 7 asesores del piloto quedan con `(10, 6, 4)` = 20 leads prometidos para la semana del `2026-04-13`. Razon del split: priorizar leads calientes en la primera semana para que los asesores perciban que el piloto les entrega leads de buena calidad.

---

## Cambios en codigo — `comercial_routing/app.py`

### 1. Imports

Agregado:
```python
from datetime import date, timedelta
```

### 2. Nuevos helpers (seccion `HELPERS CUOTA SEMANAL`)

- `lunes_de_la_semana(ref=None) -> date` — retorna el lunes ISO de la semana de la fecha dada (default hoy). Equivalente a `date_trunc('week', ...)` de Postgres.
- `cargar_umbrales_nivel() -> dict` — lee `score_umbral_alto` y `score_umbral_medio` desde `config_modelo`, con fallback a (0.70, 0.40) si hay error.
- `clasificar_nivel(score, umbrales) -> str` — retorna `'high' | 'medium' | 'low'` segun el score del lead.
- `leer_cuota_asesor(id_asesor, semana, nivel) -> (cuota, recibidos, progreso)`:
  - Si no hay fila para ese asesor/semana: retorna `(None, 0, 0.0)` — se trata como cuota no definida, deja pasar.
  - Si `cuota == 0`: retorna `(0, recibidos, 1.0)` — tratado como cumplido desde el inicio (no se le prometieron leads de este nivel).
  - Si hay fila valida: retorna `(cuota, recibidos, recibidos/cuota)`.
- `incrementar_cuota_asesor(id_asesor, semana, nivel) -> bool` — ejecuta `UPDATE cuotas_semanales SET recibidos_<nivel> = recibidos_<nivel> + 1`.

### 3. Nueva logica en `ejecutar_routing`

Reemplazada la iteracion-con-filtro-binario por el flujo:

```
1. Computar ranking 3F (sin cambios — llama a obtener_mejor_asesor)
2. Clasificar el lead en nivel (high/medium/low) con cargar_umbrales_nivel + clasificar_nivel
3. Calcular semana = lunes_de_la_semana()
4. Enriquecer cada candidato del ranking con:
   - Existencia en bd_asesores (skip si no)
   - Disponibilidad == 'disponible' (skip si no)
   - Progreso de cuota para ese (asesor, semana, nivel)
5. Regla 1: filtrar candidatos con progreso >= 1.0 (cuota cumplida)
6. Si quedan candidatos vivos:
     sort estable por (progreso asc, score_3f desc)
     pick = vivos[0]
   Si no (todos cumplieron cuota del nivel):
     fallback: sort solo por score_3f desc
     pick = candidatos[0]
7. Crear matching + hist_asignaciones + ranking_routing (sin cambios)
8. NUEVO: incrementar_cuota_asesor(id_asesor, semana, nivel)
9. Evaluar call center 30/70 (sin cambios)
```

### 4. Removido

- Check `if leads_en_cola >= capacidad: continue` (filtro binario de capacidad).
- Uso de `db.get("capacidad_maxima")` — columna borrada de BD.

### 5. Mantenido

- Check `if disponibilidad != "disponible": continue` — sirve para flag explicito de ausencia (vacaciones, enfermedad, etc.), no es Regla 4.
- Increment de `bd_asesores.leads_en_cola` en `crear_asignacion` — puede ser usado por CRM como metrica visual. No se usa para filtro.

---

## Notas de atomicidad

El incremento de cuota en `incrementar_cuota_asesor` es una transaccion separada de la creacion de `matching` / `hist_asignaciones`. Si algo falla entre medio (ej. se crea la asignacion pero el incremento falla), el asesor termina con "un lead mas del que dice su cuota" — bug menor en caso de fallo raro.

Es el mismo patron que el resto del codigo (cada funcion abre su propia conexion del pool). Si se quiere atomicidad real, hay que refactorear `ejecutar_routing` para compartir una sola conexion/transaccion entre `crear_matching`, `crear_asignacion`, `guardar_ranking_top10` e `incrementar_cuota_asesor`. Queda como mejora futura.

---

## Pendiente (no bloqueante para arrancar piloto)

1. ~~**Coordinacion con CRM**~~ → ✅ Implementado el mismo dia. Ver seccion siguiente "Cambios en el CRM".
2. **Rebalanceo batch viernes noche** — recalcular cuotas semanales segun rendimiento de la semana anterior. Para semana 2+ del piloto. Actualmente las cuotas son estaticas.
3. **Seed automatico de nuevas semanas** — hoy se seedeo semana 1 manualmente. Cada lunes hay que insertar las filas nuevas en `cuotas_semanales`. Puede ser un cron o el batch del viernes.

---

## Verificaciones hechas

- `py_compile` sobre `app.py` → OK sintaxis.
- `grep capacidad_maxima` en `comercial_routing/` → solo referencias legitimas (`capacidad_maxima_call_center` en config del call center, que es otro sistema).
- `grep capacidad_maxima` en `comercial/` (el bot) → 0 matches.
- Seed de 7 filas en `cuotas_semanales` verificado con SELECT.
- `score_umbral_alto` y `score_umbral_medio` visibles en `config_modelo`.

---

## Deploy pendiente — comercial-routing

El codigo esta modificado en `/home/admin_/comercial_routing/app.py` pero aun no esta desplegado. Para desplegar a Cloud Run:

```
cd /home/admin_/comercial_routing
gcloud builds submit --tag gcr.io/codigopagomaquisistema/comercial-routing:latest .
gcloud run deploy comercial-routing \
  --image gcr.io/codigopagomaquisistema/comercial-routing:latest \
  --platform managed \
  --region us-west4 \
  --allow-unauthenticated \
  --memory=1Gi
```

---

## Cambios en el CRM (`comercial_front`)

> **Estado**: codigo modificado en `/home/admin_/comercial_front/`. **No se ha pusheado** porque falta credenciales del dueno del repositorio.

Para que la Regla 1 funcione consistentemente, el CRM tambien tiene que decrementar/incrementar `cuotas_semanales.recibidos_<nivel>` cuando reasigne un lead. Adicionalmente, hubo que limpiar todas las referencias a `capacidad_maxima` (la columna que se borro de `bd_asesores`) para que el build no rompa.

### Archivos modificados (7)

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | Drop `capacidad_maxima` del modelo `bd_asesores`. Add modelo `cuotas_semanales`. |
| `app/api/cron/reasignaciones/route.ts` | Cron principal de 24h. Dec/Inc cuotas + sin filtro de capacidad. |
| `app/api/asesores-leads/reasignar-todos/route.ts` | Reasignacion masiva (manual). Dec/Inc cuotas + sin filtro de capacidad. |
| `app/api/asesores-leads/route.ts` | Listado de asesores. Quitado `capacidad_maxima` del select y del mapping. |
| `components/modules/reassignment-module.tsx` | UI del modulo de reasignacion. Quitado display `Cola: X/Y` → `Cola: X`. |
| `components/modules/modals/bulk-reassign-modal.tsx` | Modal de reasignacion masiva. Quitado validacion `sinCapacidad` y display `/capacidadMaxima`. |
| `REASIGNACIONES.md` | Doc actualizada con la nueva logica de cuota en reasignacion. |

### Logica nueva en el cron `app/api/cron/reasignaciones/route.ts`

**Helper agregado al inicio del archivo**:
```typescript
type Nivel = 'high' | 'medium' | 'low'

function clasificarNivel(score: number): Nivel {
  if (score >= 0.70) return 'high'
  if (score >= 0.40) return 'medium'
  return 'low'
}
```

**Cambios en el flujo del cron** (por cada matching vencido):
1. Se incluye `scoring` del lead en el query inicial de matchings vencidos.
2. Se quita `capacidad_maxima` del select de `siguientes` (era el filtro binario).
3. Se calcula `nivel = clasificarNivel(scoreLead)` desde `bd_leads.scoring` actual.
4. Para cada candidato del `siguientes`:
   - Se filtra disponibilidad (skip si no disponible).
   - Se hace `$queryRaw` a `cuotas_semanales` para leer `cuota_<nivel>` y `recibidos_<nivel>` del asesor en la semana actual (`date_trunc('week', CURRENT_DATE)`).
   - Se calcula progreso. Si no hay fila → `progreso = 0` (deja pasar).
5. Se elige el primer candidato con `progreso < 1.0`. Si ninguno → fallback al primer disponible (sin filtro de cuota).
6. La transaccion se refactoriza al **callback form** `prisma.$transaction(async (tx) => {...})` para poder usar `$executeRaw` en su interior.
7. Dentro de la transaccion se agregan dos `$executeRaw`:
   ```typescript
   // Decrementar recibidos_<nivel> del asesor anterior
   await tx.$executeRaw`
     UPDATE comercial.cuotas_semanales
     SET ${Prisma.raw(colRecib)} = GREATEST(${Prisma.raw(colRecib)} - 1, 0)
     WHERE id_asesor = ${asesorActualId}::uuid
       AND semana_inicio = date_trunc('week', CURRENT_DATE)::date
   `
   // Incrementar recibidos_<nivel> del nuevo asesor
   await tx.$executeRaw`
     UPDATE comercial.cuotas_semanales
     SET ${Prisma.raw(colRecib)} = ${Prisma.raw(colRecib)} + 1
     WHERE id_asesor = ${nuevoAsesorId}::uuid
       AND semana_inicio = date_trunc('week', CURRENT_DATE)::date
   `
   ```

### Mismos cambios en `reasignar-todos/route.ts`

La route de reasignacion masiva manual aplica la **misma logica de dec/inc** porque conceptualmente es el mismo evento (un lead pasa de un asesor a otro). Sin esto, los contadores quedarian desincronizados cada vez que un admin reasigna manualmente.

### Asunciones importantes

1. ~~**Nivel del lead**: se calcula desde `bd_leads.scoring` actual (no se persiste el nivel "al asignar")~~. → ✅ **Resuelto** el mismo dia. Ver seccion "Fix: persistir nivel_al_asignar" mas abajo.
2. **GREATEST(.. - 1, 0)** en el decremento: protege contra contadores negativos por si hay algun bug previo o desfase. Si en un caso raro el decremento intentara bajar de 0, se queda en 0.
3. **Disponibilidad como filtro**: se mantiene `disponibilidad === 'disponible'` como check de exclusion. No es Regla 4 — es flag de ausencia (vacaciones, enfermedad, etc.).

### Verificaciones hechas

- `npm install --legacy-peer-deps` → OK.
- `npx prisma generate` → OK. Cliente regenerado con `cuotas_semanales` y sin `capacidad_maxima`.
- `npx tsc --noEmit` → 3 errores preexistentes (`leads-module.tsx`, `tasks-module.tsx`, `firebase.ts`), **ninguno de los archivos modificados**. Mis 7 archivos compilan limpio.
- `git status -s` → confirma los 7 archivos modificados.

### Pendientes en el CRM

1. **Push al repositorio** — falta credenciales del dueno del repo. El usuario las pasara despues.
2. **`vercel deploy` automatico** — al pushear a la rama conectada, Vercel hace deploy. Para evitar tocar prod, recomendable trabajar en branch feature primero y usar Preview Deployment.
3. **Variable de entorno `CRON_SECRET`** — el cron requiere autorizacion via header. Asegurar que esta seteada en Vercel (probablemente ya lo esta).
4. **Validacion en preview**: probar el cron manualmente con `curl` despues del deploy de preview, verificando que decremente/incremente correctamente.

### Riesgos

- ~~**Build de Vercel rompera si se pushea sin antes mergear estos cambios**~~ → Resuelto: `capacidad_maxima` se restauro temporalmente en BD para no romper el codigo viejo del CRM en prod. Cuando se mergee el codigo nuevo del CRM, se vuelve a dropear.
- ~~**Cron corre cada cierta frecuencia (vercel.json)**~~ → Verificado: corre cada **10 minutos** (`*/10 * * * *`). Estuvo fallando entre el drop de la columna y la restauracion. Esta funcionando otra vez.

---

## Fix: persistir `nivel_al_asignar` en `matching`

> **Estado**: aplicado el mismo dia. BD modificada, codigo en routing y CRM actualizado, typecheck OK. **No pusheado** todavia.

### Problema que resolvia

La primera version del CRM calculaba el nivel del lead desde `bd_leads.scoring` actual al momento de la reasignacion. Pero `bd_leads.scoring` puede haber cambiado entre la asignacion original y la reasignacion (si el lead conversó con el bot en el intervalo). Si el score cruzo una banda, el nivel calculado en la reasignacion no coincidia con el nivel usado en la asignacion original → se decrementaba un contador (ej. `recibidos_medium`) que nunca se habia incrementado.

### Solucion

Persistir el nivel del lead al momento de la asignacion en una nueva columna `matching.nivel_al_asignar`. Al reasignar, leer ese campo en vez de recalcularlo desde el score actual. Asi el decremento siempre es del nivel correcto (el que se uso al incrementar).

### Cambios en BD

```sql
ALTER TABLE comercial.matching ADD COLUMN nivel_al_asignar VARCHAR(10);
ALTER TABLE comercial.matching ADD CONSTRAINT matching_nivel_al_asignar_check
  CHECK (nivel_al_asignar IS NULL OR nivel_al_asignar IN ('high', 'medium', 'low'));
```

NULL es permitido para que las filas existentes (creadas antes de esta migracion) sigan siendo validas. El CRM hace fallback al score actual cuando lee NULL.

### Cambios en `comercial_routing/app.py`

- `crear_matching(id_lead, id_asesor, scores, nivel=None)` ahora acepta el parametro `nivel` y lo persiste en la columna nueva al hacer el INSERT.
- `ejecutar_routing` pasa el nivel calculado: `crear_matching(..., nivel=nivel)`.

### Cambios en `comercial_front`

**`prisma/schema.prisma`**: agregada `nivel_al_asignar String? @db.VarChar(10)` al modelo `matching`.

**`app/api/cron/reasignaciones/route.ts`**: la logica de la dec/inc ahora usa dos niveles distintos:
- `nivelAnterior = match.nivel_al_asignar ?? clasificarNivel(scoreLeadActual)` → para el **decremento** del asesor anterior. Lee la columna persistida; fallback al score actual si la columna es NULL (filas viejas).
- `nivelNuevo = clasificarNivel(scoreLeadActual)` → para el **incremento** del nuevo asesor (su contador del nivel actual del lead) Y para el filtro de cuota disponible al elegir candidato.
- Al hacer `tx.matching.updateMany` para activar el matching del nuevo asesor, se incluye `nivel_al_asignar: nivelNuevo` en el `data`. Asi futuras reasignaciones de este lead sabran qué nivel decrementar.

**`app/api/asesores-leads/reasignar-todos/route.ts`**: misma logica. Ademas se hace una query extra para leer `match.nivel_al_asignar` (porque el query original no lo selecciona). Tanto el `update` como el `create` del matching del nuevo asesor incluyen `nivel_al_asignar: nivelNuevo`.

### Comportamiento despues del fix

| Escenario | Score asignacion | Score reasignacion | Antes (bug) | Despues (correcto) |
|-----------|------------------|--------------------|-------------|---------------------|
| Lead silencioso 24h | 0.82 (high) | 0.82 (high) | dec high, inc high | dec high, inc high |
| Score sube en banda | 0.82 (high) | 0.85 (high) | dec high, inc high | dec high, inc high |
| Score cruza banda | 0.82 (high) | 0.65 (medium) | dec medium ❌, inc medium | **dec high ✓**, inc medium |
| Bouncing (A → B → A) | high | medium (volvio a A) | nivel se recalcula desde score → desincronizado | matching(A).nivel_al_asignar se actualiza a "medium" en cada activacion → consistente |

### Compatibilidad hacia atras

- Filas viejas en `matching` (creadas antes del ALTER) tienen `nivel_al_asignar = NULL`. Cuando el cron las procese, el operador `??` hace fallback al score actual del lead. No es 100% preciso para esos casos, pero es la mejor aproximacion posible sin haber persistido el nivel original.
- Despues del primer paso del routing nuevo, todas las filas creadas tendran el campo poblado y la precision sera total.

### Verificaciones

- `ALTER TABLE` ejecutado en BD sin errores.
- `\d matching` confirma la columna y el CHECK constraint.
- `prisma generate` regenera el cliente con el nuevo campo.
- `tsc --noEmit` → solo los 3 errores preexistentes, mis archivos compilan limpio.
- `python -m py_compile app.py` (routing) → OK.
