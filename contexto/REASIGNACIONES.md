# Reasignaciones de Leads

## Contexto

Cuando un lead es enrutado, el modelo de 3 factores genera un ranking completo de asesores. El top 10 se guarda en la tabla `ranking_routing` para soportar reasignaciones. El asesor asignado se registra en `matching` y `hist_asignaciones`.

## Regla de Reasignacion

- Si un asesor no gestiona a un lead asignado en **24 horas**, el lead se reasigna al **2do puesto** del ranking original
- Si el 2do tampoco gestiona en 24h, pasa al 3ro, y asi sucesivamente
- Se necesita tener guardado al menos el **top 10** del ranking para cada lead

## Tablas Involucradas

### Nueva tabla: `ranking_routing`

Guarda el top 10 de asesores del modelo de 3 factores para cada lead enrutado.

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `id` | SERIAL (PK) | Identificador unico |
| `id_lead` | UUID (FK) | Lead evaluado |
| `id_asesor` | UUID (FK) | Asesor en el ranking |
| `posicion` | INTEGER | Posicion en el ranking (1 a 10) |
| `score_total` | NUMERIC(5,4) | Score del modelo 3 factores |
| `score_c` | NUMERIC(5,4) | Probabilidad de contacto |
| `score_v` | NUMERIC(5,4) | Probabilidad de conversion |
| `score_p` | NUMERIC(5,4) | Score de persistencia |
| `asignado` | BOOLEAN (default false) | Si este asesor fue o esta asignado al lead |
| `fecha_evaluacion` | TIMESTAMPTZ | Cuando se genero el ranking |

**Indices:**
- `idx_ranking_lead` en `id_lead`
- `idx_ranking_lead_pos` en (`id_lead`, `posicion`)

**Relaciones:**
- `id_lead` → `bd_leads.id_lead` (ON DELETE CASCADE)
- `id_asesor` → `bd_asesores.id_asesor`

### Tabla existente: `matching`

- **Sin cambios** — sigue guardando el match final (el asesor que fue asignado)
- `ranking_routing` complementa a `matching`: ranking guarda las opciones, matching guarda la decision

### Tabla existente: `hist_asignaciones`

- **Sin cambios estructurales**
- Ya tiene `id_asesor_anterior` y `reasignado` (boolean) y `motivo_reasignacion` que soportan reasignaciones
- Cuando el CRM reasigna, crea una nueva fila en hist_asignaciones con `reasignado = true` y `id_asesor_anterior` apuntando al asesor que no gestiono

### Tabla existente: `bd_leads`

- **Sin cambios** — `ultimo_asesor_asignado` se actualiza al nuevo asesor cuando se reasigna

### Tabla existente: `bd_asesores`

- **Sin cambios** — `leads_en_cola` se decrementa para el asesor anterior y se incrementa para el nuevo (logica del CRM)

## Flujo de Reasignacion

```
1. Routing ejecuta modelo 3 factores → genera ranking de N asesores
2. Se guarda el top 10 en `ranking_routing`
3. Se asigna al #1 → se marca posicion 1 como asignado=true en ranking_routing
4. Se crea matching + hist_asignaciones
5. Se incrementa `cuotas_semanales.recibidos_<nivel>` del asesor #1 (Regla 1)

--- 24 horas despues (logica del CRM) ---

6. CRM detecta que el lead lleva 24h sin gestion
7. CRM consulta `ranking_routing` para ese lead
8. Para cada posicion siguiente (>= 2), verifica:
   - El asesor esta disponible (`disponibilidad = 'disponible'`)
   - El asesor no ha cumplido cuota del nivel del lead (`recibidos_<nivel> < cuota_<nivel>`)
9. Encuentra el primero que cumple ambos requisitos. Si no hay, fallback al primer disponible (sin filtro de cuota).
10. Reasigna en transaccion:
    - Nueva fila en hist_asignaciones (reasignado=true, id_asesor_anterior)
    - Actualiza bd_leads.ultimo_asesor_asignado
    - Actualiza leads_en_cola de ambos asesores
    - Marca posicion N como asignado=true en ranking_routing
    - **Decrementa `cuotas_semanales.recibidos_<nivel>` del asesor original**
    - **Incrementa `cuotas_semanales.recibidos_<nivel>` del nuevo asesor**
```

> El nivel del lead se calcula desde `bd_leads.scoring` actual con los umbrales 0.70 (alto) y 0.40 (medio). Asume que el nivel no cambio entre la asignacion original y la reasignacion (caso comun: 24h sin gestion = lead inactivo).

## Responsabilidades

| Accion | Responsable |
|--------|-------------|
| Generar ranking y guardar top 10 en `ranking_routing` | Routing (comercial-routing) |
| Asignar al #1 + incrementar `cuotas_semanales` (Regla 1) | Routing (comercial-routing) |
| Detectar 24h sin gestion | CRM |
| Consultar ranking_routing y reasignar al siguiente | CRM |
| Actualizar leads_en_cola, hist_asignaciones, bd_leads | CRM |
| Decrementar/Incrementar `cuotas_semanales` en reasignacion | CRM |

## Estado de Implementacion

| Componente | Estado |
|------------|--------|
| Tabla `ranking_routing` creada en BD | Hecho |
| Routing guarda top 10 despues de cada enrutamiento | Hecho |
| Marca posicion asignada como `asignado = true` | Hecho |
| CRM detecta 24h sin gestion y reasigna | Pendiente (equipo CRM) |
| CRM actualiza leads_en_cola, hist_asignaciones, bd_leads | Pendiente (equipo CRM) |

No se necesitan cambios en el bot comercial.
