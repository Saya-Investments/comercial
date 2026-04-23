# Memoria del Proyecto Comercial

## Deploy Commands

### Bot comercial (cloudcomercial)
- Servicio: `cloudcomercial` (tipo contenedor)
- Region: `us-west4`
- Comandos:
  ```
  cd /home/admin_/comercial
  gcloud builds submit --tag gcr.io/codigopagomaquisistema/comercial:latest .
  gcloud run deploy cloudcomercial --image gcr.io/codigopagomaquisistema/comercial:latest --platform managed --region us-west4 --allow-unauthenticated
  ```
- NUNCA usar `--source .` (crea servicios tipo fuente)
- NUNCA desplegar en us-central1

### Servicio routing (comercial-routing)
- Servicio: `comercial-routing` (tipo contenedor)
- Region: `us-west4`
- Codigo fuente: `/home/admin_/comercial_routing/`
- Comandos:
  ```
  cd /home/admin_/comercial_routing
  gcloud builds submit --tag gcr.io/codigopagomaquisistema/comercial-routing:latest .
  gcloud run deploy comercial-routing --image gcr.io/codigopagomaquisistema/comercial-routing:latest --platform managed --region us-west4 --allow-unauthenticated --memory=1Gi
  ```

## Proyecto GCP
- Project ID: `codigopagomaquisistema`
- Project Number: `763512810578`
- Firestore DB: `(default)` en region `nam5`

## Arquitectura
- Bot comercial escribe en Firestore `routing_queue/{id_lead}` cuando datos minimos completos
- Eventarc trigger (`routing-queue-trigger` en nam5) detecta documento created
- `comercial-routing` Cloud Run recibe el evento y ejecuta modelo 3 factores
- PostgreSQL: `bdMaqui` schema `comercial` en `34.82.84.15:5432`

## BD
- `bd_leads`: columna de numero es `numero` (no `celular`), formato `+51XXXXXXXXX`
- Thread ID checkpoints LangGraph: `com-51XXXXXXXXX` (SIN `+`, en schema `public`, no `comercial`)
- Tablas con FK a bd_leads (12 total): listar dinamico con `SELECT conrelid::regclass FROM pg_constraint WHERE confrelid = 'comercial.bd_leads'::regclass`. Las que NO son CASCADE (requieren DELETE explicito): `matching`, `hist_asignaciones`, `hist_conversaciones`, `hist_scoring`, `hist_clientes`. Las CASCADE: `crm_acciones_comerciales`, `crm_notas`, `crm_tareas`, `crm_campana_leads`, `hist_estado_asesor`, `ranking_routing`. `crm_citas` es SET NULL.
- `mensaje_status_event`: usa `recipient_id` (sin +51), no tiene `id_lead`

## Otros
- El usuario es Daniel Castillo, numero +51941729891
- gcloud auth expira frecuentemente en Cloud Shell, se resuelve refrescando la pagina

## Procedimientos guardados
- [Limpiar datos de prueba de Daniel](cleanup_daniel_test_data.md) — Borrar todos los rastros (PG + checkpointer + Firestore) para probar conversacion desde cero

## Estado del piloto (snapshot al 17-Abr-2026)
- **6 asesores activos**: Inga (FC015475), Lorenzo (FC020536), Arancibia (FC020664), Huayhuas (FC020843), Cruzado (FC021532), Rodriguez (FC021963)
- **2 inactivos**: Vela (FC003133, era de prueba) y Reategui (FC019910, renuncio 16-Abr)
- Cuotas actuales: **150 high / 90 medium / 60 low** por asesor por semana (se subieron de 10/6/4 iniciales → x3 → x5 por volumen alto)
- Rutas deploy: `comercial-routing` esta operacional con Regla 1 (cuota semanal) + Opcion X implementada
- CRM admin view: filtra por asesores activos en 5 endpoints; tiene seccion Reasignaciones (tabs Quitados/Asignados), ranking con filtro por dia (cohorte-based), pie chart con fusion Contactado+Seguimiento UI-only
- Ver [cambios_daniel_17_04_2026.md](../../../comercial/contexto/cambios_daniel_17_04_2026.md) en `/home/admin_/comercial/contexto/` para detalle completo

## Bugs conocidos (al 20-Abr-2026, NO fixeados)
- **Bot extractor de datos con bug**: casos reales donde el bot no registra DNI/ciudad aun cuando el lead los da explicitamente. Ver analisis de conversaciones de descartados en cambios_daniel_17_04_2026.md.
- **Bot confirma asignacion sin datos completos**: dice "un asesor te contactara" aun cuando faltan datos minimos. Desinforma al lead.
- **Bot loop pidiendo DNI**: ignora preguntas del lead y objeciones, solo repite pedido de DNI.
- **Weekend awareness del cron de reasignaciones**: pendiente. Sin esto, leads asignados viernes tarde pueden ser reasignados sabado a un asesor ausente.
- **Seed automatico de `cuotas_semanales` cada lunes**: pendiente. Sin esto, cada lunes la Regla 1 queda desactivada hasta que alguien seedee manualmente.

## Bugs resueltos el 20-Abr-2026
- **Cron de reasignacion del CRM**: eran 5 bugs apilados (auth con header fantasma, `CRON_SECRET` debil, Prisma sin cache en production, `updateMany` en lugar de upsert, `cuotas_semanales` sin filas). Detalle en `ESTADO_Y_PENDIENTES.md`. CRM en Vercel: `https://comercial-smoky.vercel.app/`.
