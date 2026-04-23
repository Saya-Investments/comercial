# Cambios y estado del piloto — semana del 14-17 Abril 2026

Snapshot operacional al final de la primera semana del piloto. Consolidado de cambios, bugs conocidos y decisiones tomadas. Complementa a `cambios_daniel_13_04_2026.md` (arranque) y `ARQUITECTURA_ROUTING.md` (arquitectura general).

---

## Estado actual del piloto

### Asesores

| Cod | Nombre | Estado | Notas |
|---|---|---|---|
| FC003133 | VELA NAVARRO MARGARITA | **no disponible** | Era asesora de prueba, no en piloto real. Sin fila en `cuotas_semanales`. |
| FC015475 | INGA QUINTANA CRUZ ANGELICA | disponible | Veterana, top performer |
| FC019910 | REATEGUI SAMGAMA PIERO ANTONIO | **no disponible** | **Renunció mid-piloto** (16-Abr). Sus 6 leads fueron reasignados manualmente a Lorenzo por Yomira. |
| FC020536 | LORENZO SANCHEZ EDUARDO | disponible | **Asesor nuevo agregado 16-Abr** para reemplazar a Reategui. |
| FC020664 | ARANCIBIA PRIALE STEFANIA BELINDA | disponible | |
| FC020843 | HUAYHUAS COZ NERI VIANNEY | disponible | |
| FC021532 | CRUZADO VASQUEZ CARLA MARYLIN DEL ROSARIO | disponible | |
| FC021963 | RODRIGUEZ VALENCIA KAROL INGRID | disponible | |

**6 activos en el piloto** (Vela y Reategui excluidos).

### Cuotas semanales actuales

Arrancaron en `(10, 6, 4)` el lunes. Se multiplicaron **dos veces** durante la semana por volumen mayor al esperado:

- Primera alza (lunes): **x3** → (30, 18, 12)
- Segunda alza (más tarde): **x5 sobre el actual** → **(150, 90, 60)** por asesor
- Total comprometido por asesor: **300 leads/semana**
- Total del piloto: 6 × 300 = **1,800 leads/semana** de capacidad

### Volumen observado

- 14-Abr (lunes): 5 leads (preview)
- 15-Abr (martes): 113 leads
- 16-Abr (miércoles): 90 leads
- 17-Abr (jueves): sigue corriendo
- Total al 17-Abr: ~208+ leads
- Promedio: ~100 leads/día en días hábiles

---

## Cambios aplicados esta semana (por dia)

### Lunes 14 Abr — Arranque
- Deploy de `comercial-routing` con Regla 1 (cuota semanal)
- Deploy del bot con `nivel_al_asignar` en matching
- BD: `cuotas_semanales` creada, `matching.nivel_al_asignar` agregada, `capacidad_maxima` droppeada
- Ver detalles en `cambios_daniel_13_04_2026.md`

### Martes 15 Abr — Publicación de app en Meta
- App de Meta Developers publicada → leads reales empezaron a llegar
- Token permanente de WhatsApp reemplazado (ya no expira cada 24h)
- Cuota inicial subida x3: (30, 18, 12)
- Parche temporal: mensaje del bot decía "mañana te contactará un asesor" (revertido después)

### Miércoles 16 Abr — Ajustes operativos
- **Reategui renunció**: marcado `no disponible`, sus 6 leads sin gestión pasaron manualmente a Lorenzo por Yomira vía CRM
- **Lorenzo agregado** a `bd_asesores`. Inicialmente sin fila en `cuotas_semanales` (bug operacional: recibió un lead con progreso 0.0 → ganaba todos los routings hasta que se insertó manualmente su fila)
- Cuota subida x5 por volumen alto: **(150, 90, 60)**

### Jueves 17 Abr — Mejoras en la vista admin del CRM

Cambios al componente `advisors-activity-module.tsx` y endpoints de `app/api/advisors/*`:

1. **Filtro global de asesores activos**: 5 endpoints (`ranking`, `leads-enrutados`, `estado-distribution`, `funnels`, `advisors`) ahora filtran por `disponibilidad = 'disponible'`. Excluye a Vela y Reategui.
2. Nuevos helpers en `lib/supervisor.ts`:
   - `getActiveAsesorIds` — activos (excluye inactivos)
   - `getPilotAsesorIds` — del piloto, incluye inactivos pero excluye asesores de prueba (Vela, cod FC003133)
3. **Funnel del bot corregido**: círculo "En Gestión" ahora suma `en_gestion + asignados` (ambos son estados de gestión activa). La tasa de conversión muestra `asignados / (en_gestion + asignados)`, que es la tasa real del bot.
4. **Ranking de Actividad con filtro por día**:
   - Toggle "Por día / Acumulado"
   - Date picker
   - Modo día = **Opción B** (cohorte): recibidos ese día, gestionados = de esos recibidos, cuántos tienen ≥1 acción cuando sea
   - Mensaje: *"Asignados ese día · gestionados (cuando sea)"*
5. **Sección nueva "Reasignaciones"** debajo del ranking:
   - Tabs: Quitados / Asignados
   - Mismo filtro por día
   - Muestra los 7 asesores del piloto (excluye Vela) con contadores de leads perdidos/ganados por reasignación
6. **Pie chart ajustado**:
   - `Contactado` + `Seguimiento` fusionados bajo "Seguimiento" (fusion UI-only; los estados siguen separados en BD)
   - Orden canónico en las tajadas para que `Llamada_agendada` y `Cita_agendada` queden adyacentes

### Viernes 17 Abr — Análisis de descartados (no hay fix aplicado aún)

Se revisaron las 6 conversaciones de leads con `estado_de_lead = 'descartado'`. Hallazgos importantes:

- **Bug del extractor de datos**: caso Mauro (057e37f8) — dio DNI válido "43921952" y el bot no lo registró. Dijo "ICA" 3 veces y el bot siguió pidiendo ciudad. Afecta conversiones reales.
- **Bug crítico**: bot confirma asignación ("un asesor te contactará pronto") aunque faltan datos mínimos. Desinforma al lead.
- **Bot loop en "pide DNI"**: el bot repite *"me compartes tu nombre y DNI?"* sin importar lo que diga el lead. Ignora preguntas razonables y objeciones.
- **Bot no maneja desconfianza**: 4 de 6 leads dijeron "estafa" / "no te conozco". El bot responde con pitch genérico y sigue pidiendo DNI.
- **Bot no respeta "no"**: ante "no quiero asesor", sigue insistiendo.

Mejoras propuestas (pendientes de implementar, priorizadas):

1. Fix del extractor — revisar `extraer_datos_personales` en `component_openai.py` + prompt de extracción
2. Check `datos_minimos_completos()` antes de confirmar asignación — regla explícita al LLM en `help_prompt.py`
3. Responder preguntas del lead antes de pedir datos
4. Cap de insistencia (tras N pedidos sin data, cambiar de estrategia)
5. Flow de confianza ante objeciones
6. Respetar objeciones explícitas ("no quiero")

---

## Bugs conocidos al cierre de la semana

### 1. Cron de reasignación NO ejecuta ✗

**Síntoma**: cero reasignaciones automáticas desde el arranque del piloto. Hay leads con >24h sin gestión y cero acciones que DEBERÍAN reasignarse y no se tocan.

**Hipótesis principal**: env var `CRON_SECRET` no configurada en Vercel → el cron responde 401 en cada tick y ninguno se entera (no hay dashboard de errores monitoreado).

**Estado**: NO FIXED. Acordamos con el usuario dejarlo así porque el fin de semana los asesores no están disponibles — el cron roto "evita" reasignar a asesores ausentes. Se va a arreglar después con 2 fixes simultáneos:

- a) Fix de autenticación (CRON_SECRET o cambiar a `x-vercel-cron-signature`)
- b) **Weekend awareness**: que el cron no cuente sábado/domingo como horas del plazo de 24h. Se implementa modificando cómo se calcula `limite` en `app/api/cron/reasignaciones/route.ts`.

### 2. Bot extractor tiene bug con datos del lead ✗

Ver sección anterior. Hay leads que fueron descartados por culpa del bot, no por falta de interés real.

### 3. Bot confirma asignación sin tener datos ✗

Ver sección anterior. Causa mala UX y potencialmente leads frustrados.

---

## Decisiones de producto tomadas esta semana

1. **Patrón A + Opción X** confirmado (ya decidido lunes): routing usa cuota_semanal como primer driver, score 3F como secundario, reglas 4/5/6 quedan como desempates casi nunca activos.
2. **Cuotas se ajustan en caliente** cuando el volumen lo requiere. No hay problema en cambiar cuotas a mitad de semana — no afecta compromisos porque no se comunican a los asesores.
3. **Ranking de Actividad usa cohorte** (Opción B): mide velocidad de respuesta del asesor a su carga del día, no actividad total.
4. **Reasignaciones del piloto incluyen asesores inactivos** (ej. Reategui con 6 quitados). Vela se excluye porque nunca estuvo activa.
5. **Fusion Contactado + Seguimiento es solo UI por ahora**. Unificación interna queda para después.

---

## Pendientes no urgentes (para retomar)

| Pendiente | Prioridad | Notas |
|---|---|---|
| Fix cron reasignación + weekend awareness | Alta (antes del lunes ideal) | 2 fixes en el mismo pase |
| Fix extractor de datos del bot (DNI, zona) | Alta | Afecta conversiones reales |
| Bot: no confirmar asignación sin datos | Alta | Regla explícita en prompt |
| Bot: responder preguntas antes de pedir DNI | Media | Ajuste de prompt |
| Bot: respetar objeciones ("no quiero") | Media | Ajuste de prompt |
| Seed automático semanal de `cuotas_semanales` | Baja | Ahora se seedea a mano cada lunes |
| Rebalanceo dinámico de cuotas viernes noche | Baja | Idea del diseño original, sin plazo |
| Trigger o script que inserte `cuotas_semanales` al agregar asesor nuevo | Media | Sin esto, el próximo asesor nuevo puede tener el mismo bug que Lorenzo |
