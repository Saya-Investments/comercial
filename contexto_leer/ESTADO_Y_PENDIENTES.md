# Estado actual y pendientes del piloto comercial

> Documento de pickup rapido. Para detalle completo del historial ver `cambios_daniel_17_04_2026.md`.
> Actualizar este archivo cuando se cierren pendientes o se agreguen nuevos.

---

## Estado actual (snapshot)

**Piloto lanzado**: martes 14-Abr-2026, lleva ~5 dias corriendo (hoy lunes 20-Abr)

**6 asesores activos**:
- FC015475 — INGA QUINTANA CRUZ ANGELICA
- FC020536 — LORENZO SANCHEZ EDUARDO (nuevo, reemplazo de Reategui)
- FC020664 — ARANCIBIA PRIALE STEFANIA BELINDA
- FC020843 — HUAYHUAS COZ NERI VIANNEY
- FC021532 — CRUZADO VASQUEZ CARLA MARYLIN DEL ROSARIO
- FC021963 — RODRIGUEZ VALENCIA KAROL INGRID

**2 inactivos** (`disponibilidad = 'no disponible'`):
- FC003133 — VELA NAVARRO MARGARITA (era de prueba, no en piloto real)
- FC019910 — REATEGUI SAMGAMA PIERO ANTONIO (renuncio 16-Abr)

**Cuotas semanales actuales por asesor**: **150 high / 90 medium / 60 low** = 300 total. Seedeadas manualmente cada lunes (pendiente automatizar, ver pendiente #6).

**Volumen observado**: ~100 leads/dia en dias habiles, ~208+ acumulados

**Despliegues activos**:
- Bot: `cloudcomercial` Cloud Run (us-west4)
- Routing: `comercial-routing` Cloud Run (us-west4, revision 00013-f6n con Regla 1)
- CRM: Vercel, deploy continuo desde `Saya-Investments/comercial` rama `main` (ultimo commit relevante `c07811d` — fix reasignacion upsert)

---

## Cambios aplicados hoy (lunes 20-Abr)

### Fix del cron de reasignacion (incluia 5 bugs apilados)

1. **Auth rota en los 3 crons** (`reasignaciones`, `reminders`, `notificar-asignacion`): header fantasma `x-vercel-cron-secret` + fallback inseguro `|| 'cron-secret-key'`. Todos respondian 401 en cada tick desde el arranque.
2. **`CRON_SECRET` debil** (`saya-crm-cron-2026`, adivinable) → rotado a random de 32 bytes.
3. **Cliente Prisma sin cache en production** — el `lib/prisma.ts` solo cacheaba en dev, y el Proxy llamaba `getPrismaClient()` en cada acceso. Resultado: transacciones interactivas fallaban con "Transaction not found". Ver `comercial_front/contexto/OPTIMIZACIONES.md`.
4. **`updateMany` en lugar de upsert al reasignar** — el routing original solo crea 1 matching por lead (del top 1), entonces `updateMany` afectaba 0 filas y el nuevo asesor quedaba sin matching activo. Cambiado a `findFirst + update/create`.
5. **`cuotas_semanales` sin filas para 2026-04-20** — la Regla 1 se desactivaba cada lunes. Seedeado manualmente (150/90/60, clonado de 13-Abr).

### Intervenciones directas en BD

- **Reset de 44 matchings sin gestion** (`fecha_asignacion = NOW()`) para no reasignarlos injustamente tras el finde. Backup en `comercial._matching_reset_backup_20260420`.
- **3 matchings vencidos en horario habil preservados** → se reasignaron: Inga → Rodriguez, Huayhuas → Inga, Lorenzo → Huayhuas. Emails entregados.
- **3 matchings "huerfanos"** (creados en el primer intento fallido del cron): creados manualmente + cuota `recibidos_medium` incrementada en 1 para cada nuevo asesor.

### Commits relevantes en `comercial_front`

- `4f87058` — fix auth de los 3 crons
- `0c8367b` — fix timeout de tx (falso positivo, dejado como mejora defensiva)
- `d927d03` — fix Prisma singleton en production
- `c07811d` — fix reasignacion upsert

---

## Bugs conocidos (NO fixed)

### Bot: 8 problemas de conversacion (lista completa segun `documentos/mejoras.png`)

1. **Extractor de datos falla** — caso Mauro dio DNI `43921952` y ciudad "ICA" varias veces, el bot no los registro. Usar regex + validaciones reales.
2. **Confirma asignacion sin datos minimos** — dice "un asesor te contactara" aun cuando faltan datos. Chequear `datos_minimos_completos` antes de esa frase.
3. **No responde preguntas antes de pedir DNI** — si el lead pregunta ubicacion/marca/precio, responder primero, despues pedir los datos.
4. **No hay cap de insistencia** — si el bot ya pidio DNI 3 veces y el lead no lo da, cambiar de enfoque (info general, ofrecer otra via).
5. **Sin flow de confianza ante objeciones** — ante "estafa", "no conocemos", dar info publica de Maqui+ SIN pedir datos, luego callback voluntario.
6. **No respeta el "no"** — ante "no quiero" / "no necesito asesor", reconocer y ofrecer alternativa (web, tienda publica), no insistir.
7. **Mal manejo de audios/imagenes** — mejor copy tipo "hoy el bot aun no procesa audios, me lo escribes?" en vez de nada o pedir DNI.
8. **No detecta sarcasmo/frustracion** — ante "estas loco"/"no entiendes"/insulto, cambiar a tono humilde y escalar a asesor aun sin datos completos.

---

## Pendientes (ordenados por prioridad)

| # | Tema | Prioridad | Notas |
|---|---|---|---|
| 1 | Bot: fix del extractor de datos (DNI, ciudad) | Alta | Regex + validaciones. Caso Mauro como prueba. `component_openai.py` + `help_prompt.py`. |
| 2 | Bot: no confirmar asignacion sin datos minimos | Alta | Regla explicita al LLM. `help_prompt.py`. |
| 3 | Bot: responder preguntas antes de pedir DNI | Alta | Ajuste de prompt. `help_prompt.py`. |
| 4 | Bot: respetar el "no" del lead | Alta | Prompt + manejo de objecion explicita. `help_prompt.py`. |
| 5 | Bot: cap de insistencia (3 pedidos sin data → cambiar estrategia) | Media | Contador en state + prompt. `help_prompt.py`. |
| 6 | Bot: flow de confianza ante objeciones de desconfianza | Media | Info publica de Maqui+ sin pedir datos, callback voluntario. `help_prompt.py`. |
| 7 | Bot: deteccion de sarcasmo/frustracion + escalamiento humilde | Media-Baja | NLP + prompt. |
| 8 | Bot: manejo de audios/imagenes con copy apropiado | Baja | `app.py` rama msg_type=audio/image. |
| 9 | Weekend awareness en cron de reasignaciones | Media | Sin esto, leads asignados viernes tarde se pueden reasignar sabado |
| 10 | Seed automatico de `cuotas_semanales` cada lunes | Media | Hoy se seedeo manualmente. Sin fix, cada lunes se desactiva la Regla 1 hasta que alguien seedee. |
| 11 | Trigger SQL para crear fila en `cuotas_semanales` al agregar asesor nuevo | Media | Lorenzo tuvo el bug el 16-Abr |
| 12 | **Definir estrategia del call center (activar o descartar)** | Media | Ya activado el 22-Abr con Blanca y Johanna. Pendiente: vista dedicada CRM + botones de derivacion + registro historico del CC (columna `hist_asignaciones.id_call_center`). |
| 13 | Rotar token de GitHub de Yomira compartido en chat 20-Abr | Baja | github.com/settings/tokens → revoke y generar nuevo |
| 14 | Borrar fila de Reategui en `cuotas_semanales` 2026-04-20 | Baja | No causa bug (esta no disponible), solo ruido |
| 15 | Auditar y estandarizar `.md` del proyecto | Baja | Plan en `audit_md_2026-04-19.md` |
| 16 | Limpiar `Proxy` innecesario en `comercial_front/lib/prisma.ts` | Baja | Ver `OPTIMIZACIONES.md` |

---

## Siguiente accion recomendada

Empezar por **#1 y #2 juntos** (bugs del bot que estan matando conversiones ahora mismo).

- **#1** requiere investigar `extraer_datos_personales` en `comercial/component_openai.py` y el prompt en `comercial/help_prompt.py`. Agregar validacion de DNI (8 digitos numericos) que no se este capturando.
- **#2** es una regla explicita al LLM en el system prompt: antes de decir "un asesor te contactara", verificar que `datos_minimos_completos` sea true.

Ambos fixes viven en el bot (`comercial/`). Requieren rebuild + redeploy del contenedor `cloudcomercial` a Cloud Run. Comandos estandar en `MEMORY.md`.

---

## Referencias rapidas

- Detalle semana completa: `cambios_daniel_17_04_2026.md`
- Cambios del arranque lunes 13-Abr: `cambios_daniel_13_04_2026.md`
- Arquitectura del routing (Patron A + Opcion X): `ARQUITECTURA_ROUTING.md`
- Optimizaciones CRM (Prisma singleton): `/home/admin_/comercial_front/contexto/OPTIMIZACIONES.md`
- Handoff hecho para Yomira (CRM): `/home/admin_/comercial_front/contexto/CAMBIOS_CUOTA_SEMANAL.md`
- Auto-memoria (carga automatica): `/home/admin_/.claude/projects/-home-admin--comercial/memory/MEMORY.md`

---

*Ultima actualizacion: 20-Abr-2026 (lunes) — resuelto bug del cron de reasignaciones + 4 bugs asociados + trigger de desincronizacion matching/estado (caso Mauro). Documentado pendiente de estrategia del call center.*
