# Arquitectura de Tools del Agente — Lecciones Aprendidas

Documento clave sobre que poner dentro del toolkit del agente y que dejar como procesamiento automatico fuera del agente.

---

## El Problema

El bot estaba inventando informacion (precios falsos, plazos de tramite, monedas equivocadas, ofertas que no existen) y entrando en bucles llamando la misma herramienta 8-10 veces seguidas.

### Sintomas observados
- `analizar_mensaje_lead` se llamaba 8-10 veces por cada mensaje del lead, con el mismo payload
- `consultar_informacion_rag` casi nunca se llamaba (1 vez por conversacion completa)
- El bot inventaba precios genericos ($50,000 a $500,000, $200,000 MXN, etc.)
- Llegaba al `recursion_limit` (25 → 50) y devolvia "Hubo un problema al procesar tu solicitud"
- Mensajes a Meta retornaban status 400 por estar mal formados

### Causa raiz
La herramienta `analizar_mensaje_lead` estaba incluida en el toolkit del agente. Su retorno era un `reply` listo para WhatsApp generado por GPT-mini interno. Esto causaba 2 problemas:

1. **El agente la interpretaba como "respuesta lista"** y respondia sin consultar el RAG, repitiendo la info inventada del reply interno
2. **Loops de tool calling** porque el modelo no tenia una señal clara de cuando parar de llamarla

---

## El Insight

Buscando best practices en internet (abril 2026), encontre que:

> El system prompt es para definir COMO se comporta el agente (rol, logica, guardrails). El RAG es para informacion factual. Las herramientas del toolkit deben ser acciones que el agente DECIDE cuando llamar.
>
> Procesamiento interno automatico (que SIEMPRE debe correr con cada mensaje) NO debe estar en el toolkit. Eso confunde al agente y desperdicia tokens.

Aplicado al caso:

`analizar_mensaje_lead` hace 4 cosas internas:
1. Analisis NLP del mensaje (sentimiento, interes, intencion)
2. Calculo de scoring con EMA
3. Persistencia en BD (hist_scoring, hist_conversaciones)
4. Evaluacion de descarte automatico

**Ninguna de estas cosas debe ser controlada por el agente.** Todas deben correr automaticamente con cada mensaje, antes de invocar al agente.

---

## La Solucion

### 1. Convertir la tool en funcion automatica

```python
# ANTES: era una tool dentro del toolkit del agente
@tool("analizar_mensaje_lead", description="...")
def analizar_mensaje_lead(payload: str) -> str:
    ...
    return reply  # devolvia un mensaje listo para WhatsApp

# DESPUES: es funcion normal que se ejecuta automaticamente en el webhook
def analizar_mensaje_lead_auto(payload: str, sender: str):
    """Procesamiento interno. NO es tool. Se ejecuta antes del agente."""
    ...
    # No retorna nada, solo persiste en BD
```

### 2. Sacarla del toolkit

```python
# ANTES
toolkit = [
    consultar_informacion_rag,
    analizar_mensaje_lead,  # ❌ confundia al agente
    enviar_imagen_auto,
]

# DESPUES
toolkit = [
    consultar_informacion_rag,
    enviar_imagen_auto,
]
```

### 3. Llamarla automaticamente en el webhook

```python
# En el handler del webhook de Meta, ANTES de invocar al agente:

# Analisis NLP + scoring automatico (no depende del agente)
if lead and incoming_msg:
    try:
        analizar_mensaje_lead_auto(incoming_msg, sender)
    except Exception as e:
        print(f"⚠️ [ANALIZAR-AUTO] error: {e}", flush=True)

# Captura automatica de datos (tambien automatica, ya estaba asi)
# ...

# Recien aqui invocar al agente
result = agent_executor.invoke({"messages": [agent_message]}, config=config)
```

### 4. Actualizar el prompt del agente

```
== HERRAMIENTAS ==

Solo tienes 2 herramientas disponibles:

1) `consultar_informacion_rag`: USALA SOLO cuando el lead pregunte algo
   especifico que NO esta en tu conocimiento base.
2) `enviar_imagen_auto`: usala cuando el lead pida ver fotos.

NOTA: El analisis de sentimiento, scoring y captura de datos personales se hacen
automaticamente fuera de tu control. Tu solo te enfocas en conversar con el lead.
```

---

## El Resultado

### Antes
```
🟢 analizar_mensaje_lead | payload='Hola...'
🟢 analizar_mensaje_lead | payload='Hola...'
🟢 analizar_mensaje_lead | payload='Hola...'
🟢 analizar_mensaje_lead | payload='Hola...'
🟢 analizar_mensaje_lead | payload='Hola...'
🟢 analizar_mensaje_lead | payload='Hola...'  ← loop
🟢 analizar_mensaje_lead | payload='Hola...'
🟢 analizar_mensaje_lead | payload='Hola...'
❌ Recursion limit reached
```

### Despues
```
🟢 [ANALIZAR-AUTO] payload='Hola...'  ← una sola llamada automatica
📊 [ANALIZAR-AUTO] OK score=0.33 sent=positivo int=alto
🔍 [TOOL] consultar_informacion_rag | query: precios planes autos
💬 [WEBHOOK] OUT: Para SemiNuevos, la cuota va desde $185 hasta $431.66...
```

- **Sin loops**: cada mensaje dispara exactamente 1 llamada a analizar (automatica) + N llamadas a herramientas que el agente decida (normalmente 0-1 al RAG)
- **Sin invenciones**: el bot ahora consulta el RAG cuando corresponde y reconoce cuando no tiene info
- **Mas barato**: ya no se gastan 8-10x tokens en loops de tools innecesarias
- **Mas rapido**: respuestas en ~5-10s en vez de 30s+ por timeouts

---

## Principio General

### Que SI debe estar en el toolkit del agente

- Acciones que el agente DECIDE cuando ejecutar segun el contexto
- Acciones que afectan la respuesta al usuario
- Acciones con efectos secundarios visibles que el agente debe conocer
- Ejemplos: `consultar_informacion_rag`, `enviar_imagen_auto`, `agendar_cita`, `crear_ticket`

### Que NO debe estar en el toolkit del agente

- Procesamiento interno que SIEMPRE corre con cada mensaje
- Logica de scoring, analytics, telemetria, persistencia automatica
- Validaciones automaticas de datos
- Captura automatica de datos del mensaje
- Ejemplos: analisis NLP automatico, captura de datos personales, deduplicacion, logging

**Regla simple**: Si la respuesta a "¿debe correr siempre con cada mensaje sin importar lo que pase?" es SI, NO va en el toolkit. Va en el webhook handler ANTES de invocar al agente.

---

## Patron de Webhook con Procesamiento Pre-Agente

```python
@app.route("/hello", methods=["POST"])
def webhook():
    # 1. Recibir y validar mensaje
    msg = parse_meta_payload(request.json)
    sender = msg["from"]
    text = msg["text"]
    lead = obtener_o_crear_lead(sender)

    # 2. Procesamiento PRE-agente (automatico, sin tools)
    #    Todo esto corre SIEMPRE con cada mensaje
    analizar_mensaje_lead_auto(text, sender)       # NLP + scoring + persist
    capturar_datos_personales_auto(text, lead)     # extraer DNI, nombre, etc.
    persistir_inbound_en_firestore(text, lead)
    escribir_routing_queue_si_corresponde(lead)

    # 3. Invocar al agente con un toolkit minimo
    #    Solo herramientas que el agente debe decidir
    result = agent_executor.invoke(
        {"messages": [HumanMessage(content=text)]},
        config={"thread_id": f"com-{sender}", "recursion_limit": 50}
    )
    response_text = result["messages"][-1].content

    # 4. Procesamiento POST-agente
    persistir_outbound_en_firestore(response_text, lead)
    send_whatsapp(sender, response_text)
    return jsonify({"reply": response_text}), 200
```

Este patron deja al agente enfocado SOLO en la conversacion, sin contaminarse con logica interna.

---

## Por Que Importa

1. **Confiabilidad**: El bot deja de inventar informacion porque el agente se enfoca en lo que debe hacer (conversar y consultar RAG)
2. **Costo**: Menos tokens gastados en loops y tools innecesarias
3. **Latencia**: Menos pasos = respuestas mas rapidas
4. **Mantenibilidad**: La logica interna esta separada de la logica conversacional
5. **Debugging**: Mas facil entender que paso (los logs muestran flujo lineal en vez de loops)

---

## Fecha del Cambio
2026-04-09

## Modelo Usado
`gpt-5.4-mini` con `recursion_limit=50` (LangChain + LangGraph)
