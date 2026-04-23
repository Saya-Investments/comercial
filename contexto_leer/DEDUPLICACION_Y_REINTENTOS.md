# Deduplicacion y Reintentos

Referencia de los casos de mensajes duplicados o reintentos que maneja el proyecto, y como se protege contra cada uno.

---

## 1. Meta reintenta porque el bot tarda en responder (bot funcionando)

- **Cuando pasa**: El bot esta funcionando pero tarda mas de ~15-20s en responder 200 a Meta.
- **Que hace Meta**: Reenvia el mismo webhook con el mismo `wamid`.
- **Proteccion**: Deduplicacion por `wamid`. El bot guarda el `wamid` al inicio del procesamiento. Cuando llega el reintento, detecta que el `wamid` ya existe y lo ignora.
- **Sin proteccion**: El lead recibiria dos respuestas al mismo mensaje.

## 2. Meta reintenta porque el bot esta caido (bot crasheando)

- **Cuando pasa**: El bot tiene un error de codigo (syntax error, import fallido, etc.) y no puede procesar ningun request.
- **Que hace Meta**: No recibe 200, reintenta el webhook varias veces (backoff: 1s, 5s, 30s, 1min, 5min, 15min, 1h... hasta 7 dias).
- **Proteccion**: Umbral de 3 minutos por timestamp. El payload de Meta incluye el `timestamp` del momento en que el lead envio el mensaje. Al recibir un webhook, el bot compara ese timestamp con la hora actual. Si tiene mas de 180 segundos de antiguedad, guarda el `wamid` (para que futuros reintentos sean ignorados por deduplicacion), responde 200 a Meta (para que deje de reintentar), pero NO procesa el mensaje ni responde al lead.
- **Casuisticas cubiertas**:
  - **Caso A**: Lead envio 1 mensaje, bot caido poco tiempo (<3 min), bot vuelve → reintento llega con timestamp reciente → se procesa normal, lead recibe respuesta.
  - **Caso B**: Lead envio 1 mensaje, bot caido mucho tiempo (>3 min), bot vuelve → reintento llega con timestamp viejo → se ignora, se guarda wamid, 200 a Meta. El lead no recibe respuesta a un mensaje que ya quedo fuera de contexto.
  - **Caso C**: Lead envio 1 mensaje viejo, bot vuelve, lead escribe otro nuevo → mensaje viejo se ignora, mensaje nuevo se procesa normal.
  - **Caso D**: Lead envio 5 mensajes mientras bot caido → los 5 llegan con timestamps viejos → todos se ignoran, se guardan wamids, 200 a Meta. Cuando el lead escriba de nuevo, se procesa normal. Se evita el caos de responder 5 mensajes de golpe.
- **Nota sobre el timestamp**: El `timestamp` de Meta es la hora en que el lead envio el mensaje, NO la hora en que el bot lo recibe. Por eso sirve para distinguir mensajes viejos de nuevos.

## 3. Eventarc reintenta porque el routing tarda (primera carga de cache)

- **Cuando pasa**: El servicio `comercial-routing` tarda mas de ~30s en responder (timeout de Eventarc). Ocurre en la primera ejecucion cuando carga los excels en cache (~85s).
- **Que hace Eventarc**: Marca como fallido y reenvia el evento (backoff exponencial, hasta 24h).
- **Proteccion**: Antes de ejecutar el routing, `comercial-routing` verifica en Firestore si el doc `routing_queue/{id_lead}` ya tiene `estado: completado` o `descartado`. Si ya fue procesado, responde 200 sin hacer nada.
- **Sin proteccion**: El lead seria enrutado multiples veces, generando asignaciones y matchings duplicados en PostgreSQL.

## 4. Bot escribe routing_queue duplicado (lead envia mas datos despues de enrutado)

- **Cuando pasa**: El lead ya fue enrutado pero sigue enviando mensajes que contienen datos (ej. su correo).
- **Proteccion doble**:
  1. El bot verifica si el lead ya tiene `ultimo_asesor_asignado` antes de escribir en `routing_queue`.
  2. Firestore verifica si ya existe un doc reciente (<24h) para ese `id_lead`.
- **Sin proteccion**: Se crearia un nuevo doc en `routing_queue`, disparando otro routing innecesario.
