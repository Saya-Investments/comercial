# Timeouts del Proyecto Comercial

Referencia de todos los timeouts que intervienen en la arquitectura del bot comercial y el servicio de routing.

### Principio clave

Subir el timeout no cobra mas **si todo funciona bien**, pero si algo falla, el problema dura mas y cobra mas. Un timeout alto significa que un request colgado (loop infinito, conexion muerta, bug) consume CPU y memoria durante todo ese tiempo sin hacer nada util. Los defaults bajos existen para **fallar rapido** y no desperdiciar recursos en requests muertos. El objetivo es encontrar el balance: suficiente para que los procesos legitimos terminen, pero no tanto como para que un bug colgado bloquee el servidor por horas.

---

## 1. Meta Webhook (WhatsApp -> Bot)
- **Timeout default**: ~15-20s
- **Timeout actual**: ~15-20s
- **Configurable**: No. Lo define Meta.
- **Que pasa si se excede**: Meta reenvia el mismo webhook (con el mismo `wamid`)
- **Proteccion**: Deduplicacion por `wamid` en el bot

## 2. Gunicorn del Bot (`cloudcomercial`)
- **Timeout default**: 30s
- **Timeout actual**: 120s
- **Configurable**: Si. `--timeout X` en Dockerfile
- **Que pasa si se excede**: Gunicorn mata el worker, el request no se completa

## 3. Cloud Run del Bot (`cloudcomercial`)
- **Timeout default**: 300s
- **Timeout actual**: 300s (no se modifico)
- **Configurable**: Si. `gcloud run services update --timeout=Xs` (maximo 3600s)
- **Que pasa si se excede**: Cloud Run corta la conexion

## 4. Eventarc (Firestore -> comercial-routing)
- **Timeout default**: ~30s
- **Timeout actual**: ~30s (no se modifico)
- **Configurable**: Parcialmente. Se puede ajustar retry policy pero el timeout HTTP depende del destino
- **Que pasa si se excede**: Eventarc reintenta (backoff exponencial, hasta 24h)
- **Proteccion**: Verificacion de `estado: completado/descartado` en comercial-routing antes de procesar
- **Nota**: En nuestro caso los 30s generan falsos positivos. La primera carga de cache (~85s) es un proceso legitimo, no un error, pero Eventarc lo interpreta como fallo porque no recibe 200 a tiempo. El primer request si completa el routing, pero Eventarc reintenta innecesariamente. La proteccion de idempotencia evita que el reintento cause duplicados, pero igual se levanta una instancia extra para nada.

## 5. Gunicorn del Routing (`comercial-routing`)
- **Timeout default**: 30s
- **Timeout actual**: 120s
- **Configurable**: Si. `--timeout X` en Dockerfile
- **Que pasa si se excede**: Gunicorn mata el worker mid-routing
- **Riesgo**: Primera carga de cache ~85s, cerca del limite

## 6. Cloud Run del Routing (`comercial-routing`)
- **Timeout default**: 300s
- **Timeout actual**: 300s (no se modifico)
- **Configurable**: Si. `gcloud run services update --timeout=Xs` (maximo 3600s)
- **Que pasa si se excede**: Cloud Run corta la conexion

## 7. PostgreSQL (conexiones)
- **max_idle default**: sin limite (conexion vive indefinidamente)
- **max_idle actual**: 300s
- **Configurable**: Si. Parametro del `ConnectionPool` en el codigo
- **check**: `ConnectionPool.check_connection`
- **Que pasa si se excede**: Conexion muerta -> error `server closed the connection unexpectedly`
- **Proteccion**: Health check del pool

## 8. OpenAI API (LLM calls)
- **Timeout default**: 600s (SDK de OpenAI)
- **Timeout actual**: 600s (no se modifico)
- **Configurable**: Si. `ChatOpenAI(timeout=X)` o `request_timeout=X`
- **Que pasa si se excede**: Timeout error, el bot no genera respuesta
