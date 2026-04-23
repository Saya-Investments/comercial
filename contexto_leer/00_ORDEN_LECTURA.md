# Orden de lectura sugerido

Documentos de contexto del proyecto **Comercial Maqui+** (bot + CRM + routing).

El orden esta pensado para onboarding: del concepto de negocio a los detalles tecnicos, con las capas criticas primero. Los items marcados **(imprescindible)** son los que deberia leer cualquier persona/sesion nueva que vaya a trabajar sobre el proyecto. El resto se puede consultar on-demand segun el topico.

---

## Fase 1 — Imprescindibles (primer contexto)

Empezar por estos 5. Con esto alcanza para entender el proyecto de punta a punta y trabajar en la mayoria de tareas.

### 1. `MEMORY.md` *(imprescindible — contexto de entorno)*
Auto-memoria del proyecto. Tiene: comandos de deploy, project IDs de GCP, datos de PostgreSQL, bugs resueltos, estado del piloto, referencias a otros docs. Se auto-carga en sesiones de Claude Code que usen el mismo profile; si es otro entorno, pasarlo explicito.

### 2. `CONTEXTO_NEGOCIO.md` *(imprescindible — el "por que")*
Caso de negocio de Maqui+ (empresa peruana de fondos colectivos para vehiculos e inmuebles). Explica que es un fondo colectivo, tipos de leads (campaña vs stock), sistema de scoring dual (previo vs post conversacion). **Sin esto no se entiende el proyecto.**

### 3. `EXPLICACION_BOT_COMERCIAL.md` *(imprescindible — el "que")*
Arquitectura del bot: flujo del webhook de WhatsApp, herramientas del agente LangGraph, formulas de scoring, tablas de BD. Equivalente a un README tecnico.

### 4. `ARQUITECTURA_ROUTING.md` *(imprescindible — el "como")*
Diseño del routing de leads: modelo de 3 factores (contacto, conversion, persistencia), Patron A + Opcion X, reglas 1-6 del negocio, arquitectura de 2 capas (historica + operativa). Tambien explica la distribucion dinamica de cuotas semanales.

### 5. `ESTADO_Y_PENDIENTES.md` *(imprescindible — el "ahora")*
Foto actual: asesores activos, cuotas vigentes, bugs conocidos, pendientes ordenados por prioridad. Es el documento "live" — actualizar cuando se cierren pendientes o se agreguen nuevos.

---

## Fase 2 — Contexto del CRM

Cuando se vaya a trabajar sobre el lado del asesor/admin en el CRM.

### 6. `Manual_Asesor_CRM.md`
Manual de usuario para el asesor: login, modulos, flujo diario en el CRM.

### 7. `FUNCIONALIDADES_ASESOR.md`
Las 11 secciones del rol asesor (dashboard, leads, acciones comerciales, tareas, calendario, etc.).

### 8. `REASIGNACIONES.md`
Flujo completo de reasignacion automatica con cuota: ranking_routing top 10, cron de 24h, dec/inc de cuotas_semanales al reasignar. **Version actualizada** con la logica de cuotas.

---

## Fase 3 — Modelos y estrategia

Para decisiones de producto y entender los parametros que mueven el sistema.

### 9. `MODELO_SCORING.md`
Especificacion de los dos scorings:
- **Previo** (LightGBM): filtra leads stock de 120k antes del bot.
- **Post** (formula ponderada): 5 variables (sentimiento, interes, tiempo, intencion, datos), con EMA para suavizar. Umbrales de derivacion (0.75) y descarte (0.30).

### 10. `ESTRATEGIA_CALL_CENTER.md`
Distribucion 30/70 (ahora 45/55) entre Call Center y asesores para leads calientes. 3 casos de derivacion del CC al asesor: manual, timeout 4h, cola llena.

---

## Fase 4 — Historico de cambios

Para entender por que las cosas son como son. Leer on-demand cuando se necesite contexto de una decision.

### 11. `cambios_daniel_13_04_2026.md`
Arranque del piloto: implementacion de Regla 1 (cuota semanal), tabla `cuotas_semanales`, columna `matching.nivel_al_asignar`.

### 12. `cambios_daniel_17_04_2026.md`
Snapshot de la semana 1 del piloto: vista admin de asesores, ranking con filtro por dia (cohorte Opcion B), seccion Reasignaciones, fusion Contactado+Seguimiento en pie chart.

### 13. `CAMBIOS_CUOTA_SEMANAL.md`
Handoff hecho para el equipo CRM sobre los cambios de cuota semanal: archivos tocados, nueva logica de dec/inc.

### 14. `CAMBIOS_CAMPANAS.md`
Refactor reciente de creacion de campañas: filtro por `Bucket`, nuevas columnas `bd_leads.Bucket` y `bd_leads.Base`, batch inserts, transaccion atomica con timeout 120s.

---

## Fase 5 — Referencia tecnica

Consultar cuando se toque un area especifica. No hace falta leerlos al principio.

### 15. `DEDUPLICACION_Y_REINTENTOS.md`
Protecciones contra duplicados en los 4 frentes: Meta reintentando webhook, Eventarc reintentando routing, bot escribiendo en routing_queue dos veces, reintentos por bot caido con umbral de timestamp.

### 16. `TIMEOUTS.md`
Los 8 timeouts del sistema: Meta webhook, Gunicorn, Cloud Run, Eventarc, PostgreSQL, OpenAI API. Util para debugging de requests colgados.

### 17. `LIMPIEZA_DATOS_LEAD.md`
Procedimiento SQL/Python para borrar todos los rastros de un lead (PostgreSQL + checkpointer de LangGraph + Firestore). Util para probar conversaciones desde cero.

### 18. `ARQUITECTURA_TOOLS_AGENTE.md`
Leccion aprendida sobre que va al toolkit del agente LangGraph vs procesamiento automatico antes del agente. Explica por que `analizar_mensaje_lead` se saco del toolkit y se puso como funcion automatica en el webhook.

### 19. `OPTIMIZACIONES.md`
Fix del singleton Prisma en production (el cliente no se cacheaba globalmente, causaba "Transaction not found" y perdidas de performance). Explica el tradeoff del Proxy lazy + HMR en Next.js.

---

## Resumen de prioridades

| Prioridad | Docs | Cuando leer |
|---|---|---|
| **Alta** (imprescindibles) | 1-5 | Siempre al arrancar |
| **Media** (CRM + estrategia) | 6-10 | Si se trabaja en CRM o decisiones de producto |
| **Baja** (historico) | 11-14 | Cuando se necesite contexto de por que algo esta como esta |
| **Referencia** | 15-19 | On-demand al tocar un area especifica |

---

*Este archivo es una guia de lectura, no un indice oficial. Si en el futuro se crean nuevos docs relevantes, agregarlos a la fase correspondiente.*
