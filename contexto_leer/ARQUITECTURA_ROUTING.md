# Arquitectura de Routing — Bot Comercial Maqui+

> **Nota de vigencia** (19-Abr-2026): este documento describe el **diseno y razonamiento** del routing. Las referencias a **"7 asesores"** o a **Vela / Reategui como activos** reflejan el estado al momento del diseno (arranque del piloto, 13-Abr). Las referencias a **cuotas 10/6/4** son valores iniciales — se elevaron x3 y luego x5 durante la primera semana.
>
> Para el **estado operacional actual** (asesores activos, cuotas vigentes, bugs conocidos) consultar `ESTADO_Y_PENDIENTES.md`.
>
> Las decisiones arquitectonicas documentadas aqui (Patron A + Opcion X, cuota semanal como driver primario, separacion 2 capas) **siguen vigentes**.

## Resumen

El routing es el proceso de asignar un lead calificado al mejor asesor disponible. El routing se ejecuta **fuera del bot**, en una Cloud Function disparada por Firestore.

---

## Arquitectura: Firestore como puente de eventos

```
Bot (Cloud Run)
    |
    |-- datos_minimos_completos()?
    |       |
    |       +-- Verificar routing_queue/{id_lead} en Firestore
    |               |
    |               +-- Doc existe y created_at reciente (<24h)? --> SKIP
    |               |
    |               +-- Doc no existe o es antiguo? --> Borrar viejo si existe
    |                       |
    |                       +-- Crear doc nuevo en routing_queue/{id_lead}
    |                       |
    |                       +-- Responder al lead: "un asesor te contactara"
    |
    +---> Firestore Trigger (created)
              |
              v
         Cloud Function (ejecutar_routing)
              |
              +-- Ejecuta obtener_mejor_asesor(linea, producto, zona)
              +-- Crea matching + asignacion en PostgreSQL
              +-- Actualiza doc en Firestore: estado = "completado"
```

---

## Estructura de Firestore

### Coleccion: `routing_queue`

Document ID: `{id_lead}` (UUID del lead)

```
routing_queue/{id_lead}
  - id_lead: string        (UUID)
  - celular: string        ("+51941729891")
  - linea: string          ("VEHICULOS" | "INMUEBLES")
  - producto: string       ("AUTOPRONTO" | "SEMINUEVOS" | etc.)
  - zona: string           ("LIMA" | "AREQUIPA" | etc.)
  - score: number          (score post conversacion)
  - tipo: string           ("campana" | "stock")
  - created_at: timestamp  (SERVER_TIMESTAMP)
  - estado: string         ("pendiente" | "completado" | "descartado")
```

### Por que id_lead como Document ID?

- **Deduplicacion natural**: si el bot intenta escribir dos veces el mismo lead, sobrescribe en vez de duplicar. Como el trigger es `created` (no `updated`), la sobrescritura no dispara la Cloud Function.
- **Re-enrutamiento**: cuando un lead stock necesita re-enrutarse meses despues, se borra el doc viejo y se crea uno nuevo → trigger `created` se dispara.

### Por que coleccion separada?

La coleccion `comercial` guarda mensajes in/out. Si el trigger estuviera ahi, se dispararia con cada mensaje. `routing_queue` solo recibe escrituras cuando hay que enrutar.

---

## Proteccion contra duplicados

La validacion ocurre **antes** de escribir en Firestore, no en la Cloud Function.

### Flujo de validacion en el bot (app.py)

```
datos_minimos_completos() = true
    |
    v
Leer routing_queue/{id_lead} en Firestore
    |
    +-- Doc existe Y created_at < 24 horas? --> NO escribir, skip
    |
    +-- Doc NO existe? --> Crear doc nuevo (trigger se dispara)
    |
    +-- Doc existe PERO created_at > 24 horas? --> Borrar doc viejo
    |                                              Crear doc nuevo (trigger se dispara)
```

### Por que funciona para ambos tipos de lead?

| Caso | Doc existe? | created_at reciente? | Accion |
|------|------------|---------------------|--------|
| Lead campana, primera vez | No | - | Crear doc → routing |
| Lead campana, sigue escribiendo 5min despues | Si | Si (5min) | Skip |
| Lead campana, sigue escribiendo 2h despues | Si | Si (2h) | Skip |
| Cloud Function completa routing | Si (estado=completado) | Si | - |
| Lead stock, vuelve 3 meses despues | Si (estado=completado) | No (3 meses) | Borrar viejo → crear nuevo → routing |

---

## Cloud Function: ejecutar_routing

### Trigger

- Evento: `google.cloud.firestore.document.v1.created`
- Coleccion: `routing_queue/{docId}`
- La Cloud Function **siempre ejecuta** cuando recibe un trigger. No valida duplicados — esa responsabilidad es del bot.

### Que hace

1. Lee datos del documento de Firestore (id_lead, linea, producto, zona)
2. Ejecuta `obtener_mejor_asesor(linea, producto, zona)` — modelo de 3 factores
3. Busca asesor en `bd_asesores` por cod_vendedor
4. Crea registro en tabla `matching` (scores)
5. Crea registro en tabla `hist_asignaciones`
6. Actualiza `bd_leads`: `ultimo_asesor_asignado`, `estado_de_lead = 'prospecto'`
7. Actualiza documento en Firestore: `estado = "completado"`, `completed_at = timestamp`

### Modelo de 3 factores

El routing usa el modelo existente en `routing/routing_engine.py`:

- **prob_contacto** (peso 0.25): probabilidad de que el asesor contacte al lead
- **prob_conversion** (peso 0.60): probabilidad de que el asesor convierta al lead en cliente
- **persistencia** (peso 0.15): tiempo de permanencia historico de los clientes que este asesor convirtio en el fondo colectivo. Para Maqui+ es valioso que los clientes se queden el mayor tiempo posible porque eso significa mas ingreso recurrente, entonces se premia a los asesores cuyos leads convertidos tienden a mantenerse mas tiempo en el sistema.

Formula: `score = prob_contacto * 0.25 + prob_conversion * 0.60 + persistencia * 0.15`

### Archivos de datos historicos

Los tres archivos en `routing/excels/` alimentan el modelo:

| Archivo | Tamano | Proposito |
|---|---|---|
| `dotacion.xlsx` | ~80 KB | Lista maestra de asesores activos (codigo, nombre, cargo, oficina). Filtro: cargo=VENDEDOR y sin fecha_fin |
| `bd_fondos.csv` | ~36 MB | Historial de clientes en fondos colectivos (Foja, Apellidos, Estado_Asociado, Fec_1raAsamb, Fec_Resolucion). **NO tiene columna de vendedor** |
| `SDV_Leads.csv` | ~40 MB | Historial de leads asignados a asesores, con info de contacto y conversion. Fuente para prob_contacto y prob_conversion |
| `ventas/*.xlsx` | varios MB | Excels mensuales de ventas inscritas (fronte), con Cod_Vendedor y datos del cliente (Foja + Apellidos). Fuente para persistencia |

### Como se calcula persistencia

Como `bd_fondos.csv` NO tiene vendedor, el join se hace indirectamente:

1. **Calcular dias de persistencia por cliente** (en `bd_fondos`):
   - Si `Estado_Asociado = RESUELTO`: dias = Fec_Resolucion - Fec_1raAsamb
   - Si `Estado_Asociado = ACTIVO`: dias = hoy - Fec_1raAsamb
2. **Crear lead_key del cliente** (como no hay vendedor): `lead_key = foja + ap_paterno + ap_materno`
3. **Joinear con el frente (ventas mensuales)**: el frente SI tiene vendedor_key + lead_key (mismo formato)
   - Inner join: `frente[lead_key, vendedor_key]` × `bd_fondos[lead_key, persistencia_dias]`
4. **Agregar por vendedor**:
   - `persistencia_promedio_dias` = promedio de dias por cliente convertido
   - `leads_con_persistencia` = cantidad de clientes unicos
5. **Suavizado Bayesiano con k=30**:
   ```
   score_persistencia = (N/(N+k)) * persistencia_vendedor + (k/(N+k)) * persistencia_global
   ```
   - N = leads_con_persistencia del vendedor
   - Si N es bajo, el score se mezcla con el promedio global para no ser extremo
   - Si N = 0, el score es directamente el promedio global

### Como se calculan prob_contacto y prob_conversion

- Se usan los datasets de SDV_Leads (una vista para contacto, otra para conversion)
- Se filtran por atributos del lead actual (linea, sit_laboral, producto, zona)
- Se agregan ratios historicos por vendedor con suavizado Bayesiano
- Los asesores sin historial reciben el promedio global como fallback

### Estructura de archivos

```
routing/
  routing_engine.py         (entrada principal)
  modelo_prob_conversion.py  (conversion + persistencia)
  modelo_contacto.py         (contacto)
  excels/
    dotacion.xlsx
    bd_fondos.csv
    SDV_Leads.csv
    ventas/
      Frente_Operaciones_..._202301.xlsx
      ...
```

### Situacion de los asesores del piloto

> **Nota**: esta seccion es de referencia historica con los datos al momento del arranque. Para estado actual (quien esta activo, cuotas vigentes), consultar `ESTADO_Y_PENDIENTES.md`.

**Estado actual resumen**: 6 asesores activos, 2 inactivos (Vela era de prueba, Reategui renuncio 16-Abr). Se agrego Lorenzo (FC020536) el 16-Abr como reemplazo de Reategui — no figura en la tabla historica porque no estaba en `dotacion.xlsx` al momento del entrenamiento.

| Codigo | Asesor | Leads SDV | Ventas frente | Calidad del score | Estado actual |
|---|---|---|---|---|---|
| FC003133 | VELA NAVARRO MARGARITA | 3,311 | 117 | Real y confiable | **Inactivo** (era de prueba) |
| FC015475 | INGA QUINTANA ANGELICA | 576 | 75 | Real y confiable | Activo |
| FC019910 | REATEGUI SAMGAMA PIERO | 298 | 10 | Parcial (Bayesian mix) | **Inactivo** (renuncio) |
| FC020843 | HUAYHUAS COZ NERI | 0 | 5 | Poco (Bayesian mix) | Activo |
| FC020664 | ARANCIBIA PRIALE STEFANIA | 267 | 4 | Poco (Bayesian mix) | Activo |
| FC021532 | CRUZADO VASQUEZ CARLA | 0 | 0 | Solo global (fallback total) | Activo |
| FC021963 | RODRIGUEZ VALENCIA KAROL | 1,903 | 0 | Solo global en persistencia | Activo |
| FC020536 | LORENZO SANCHEZ EDUARDO | — | — | Solo global (no estaba en dotacion.xlsx al entrenamiento) | Activo (agregado 16-Abr) |

**Notas importantes:**
- Los asesores sin ventas en `frente` van con score de persistencia = promedio global
- El modelo no se reentrena en tiempo real — usa los archivos estaticos
- Para mejorar los scores en el piloto, se recomienda **actualizar los archivos historicos periodicamente** (ej: cada mes) con nuevas ventas y leads. Asi el modelo afinara los scores de los asesores del piloto conforme vayan generando ventas reales con el bot.

---

## Distribucion semanal dinamica (cuotas prometidas)

> **Estado**: diseno ideal original. Pendiente de decidir si se aplica al piloto. Se documenta aqui para tenerlo presente pero no esta implementado todavia.

Independiente del routing per-lead, existe una capa superior que define **cuantos leads se le promete a cada asesor por semana**. Esta cuota se rebalancea semana a semana segun el rendimiento observado.

### Cuando se ejecuta el rebalanceo

Es un **proceso batch que corre fuera de horas operativas**, no en caliente durante el dia. El momento natural es al cierre de la semana (ej. viernes en la noche, cuando los asesores ya se fueron a sus casas). El lunes en la manana las cuotas ya estan recalculadas y listas para la nueva semana.

Esto implica que el rendimiento intrasemanal no altera las cuotas en vivo — solo se refleja en el rebalanceo del siguiente ciclo semanal.

### Logica

1. **Semana 1 (arranque del piloto)**: todos los asesores parten de un punto neutro. Se les promete la misma cantidad de leads, repartidos en niveles de calidad (High / Medium / Low segun score).

   Ejemplo conceptual con 40 leads y 2 asesores:
   ```
                Asesor 1   Asesor 2
   High            2          2
   Medium          6          6
   Low            12         12
   Total          20         20
   ```

   > **Nota**: estos son los valores usados en el arranque del 13-Abr (10/6/4 por asesor, 20 total). Durante la semana 1 se elevaron x3 (a 30/18/12) y luego x5 (a 150/90/60) por volumen de Meta mayor al esperado. Para valores vigentes consultar `ESTADO_Y_PENDIENTES.md`.

2. **Semana 2+ (rebalanceo por rendimiento)**: con data de la semana anterior, se recalcula la cuota proporcional al rendimiento de cada asesor. El que rindio mas recibe proporcionalmente mas leads en cada nivel de calidad.

   Ejemplo (si Rendimiento A1 > Rendimiento A2):
   ```
                Asesor 1   Asesor 2
   High            3          1
   Medium          9          3
   Low            18          6
   Total          30         10
   ```

### Por que esto tiene sentido en nuestro piloto

El filtro del bot + el score ya garantizan que los leads que llegan al routing son de calidad aceptable. Bajo esa premisa:

- **Mas leads → mas conversiones** para el asesor que ya demostro saber convertir.
- **Mas comisiones** para ese asesor, lo que alinea incentivos (el que rinde gana mas).
- **Proteccion del piloto**: leads valiosos no se "desperdician" en asesores que no estan convirtiendo.

### Relacion con el routing per-lead

- La **cuota semanal** define cuanto se promete entregar.
- El **routing per-lead** (modelo 3 factores) define a quien va cada lead individual cuando llega.
- Las dos capas deben ser consistentes: si la cuota semanal le promete 30 leads a Asesor 1 y 10 a Asesor 2, el routing per-lead no puede asignarle 20 y 20 en la practica.
- **Implicacion pendiente**: el routing per-lead necesita un componente de "progreso en cuota semanal" que incline las asignaciones hacia quien aun no ha recibido su cupo de la semana.

### Punto debil: no controlamos el volumen total

La principal debilidad de esta logica es que **no sabemos de antemano cuantos leads nos llegaran en la semana**, porque el volumen depende de campanas de Meta (presupuesto, saturacion de audiencia, creatividad, estacionalidad, competencia). No somos nosotros quienes "abrimos o cerramos el grifo" de leads.

Esto hace riesgoso prometerle a un asesor un numero absoluto exacto ("esta semana te tocan 30 leads"): si Meta entrega menos, incumplimos.

**Formas de mitigar la incertidumbre:**

1. **Promedio movil historico**: con 2-4 semanas de data del piloto ya tenemos un rango razonable de volumen esperado (ej. "entre 35 y 55 leads por semana"). Sirve para planificacion pero no como promesa rigida.
2. **Estimacion via CPL**: si el presupuesto de la campana es fijo y el costo por lead (CPL) es relativamente estable, `leads_estimados_semana = presupuesto_semanal / CPL`. Meta Ads Manager da forecasts que tambien se pueden usar como referencia.
3. **Comprometer porcentajes, no absolutos**: en vez de "te tocan 30 leads", prometer "te toca el 75% del flujo de esta semana". Asi el asesor entiende su *share* relativo y el riesgo de volumen absoluto queda del lado de la empresa, no del asesor. Es la forma mas robusta porque es invariante al volumen real.
4. **Rebalanceo a mitad de semana**: si el volumen real diverge mucho del estimado (ej. llego solo el 40% del esperado a mitad de semana), se pueden reajustar las cuotas restantes.

**Conclusion**: la logica de la cuota dinamica sigue siendo valida, pero conviene formularla como **porcentajes (shares) del flujo semanal**, no como numeros absolutos. Asi el mecanismo premia al que rinde independiente del volumen que Meta efectivamente entregue.

---

## Reglas de asignacion per-lead (diseno original del negocio)

> **Estado**: especificacion operativa del negocio tal como fue planeada originalmente. Define como se debe decidir a que asesor se le asigna CADA lead individual en caliente. Aun no esta implementada en el routing actual — hoy solo usamos el score 3 factores + filtro binario de capacidad. Este bloque es la referencia de "como lo queriamos" para decidir que partes incorporar al routing actual.

> **IMPORTANTE — intenciones originales, sujetas a cambio**: las razones de ser documentadas en cada regla corresponden al **diseno original** del enrutamiento. Algunas cambiaran una vez terminemos de debatir como integrar este diseno con el modelo 3 factores actual, con la logica de `prob_contacto`, y con lo que aterrice al revisar el codigo del CRM. Este bloque se debe releer y actualizar despues de esa discusion.

Cuando llega un lead, el routing evalua las reglas **en orden**. Cada regla filtra o desempata hasta quedar con un solo asesor ganador.

### Regla 1 — Progreso en cuota

Filtro primario para cumplir las cuotas semanales prometidas (ver seccion anterior).

```
progreso = leads_recibidos_en_la_semana / cuota_semanal_prometida
```

El lead se asigna al asesor con **menor progreso** (el que esta mas lejos de cumplir su cuota semanal).

**Razon de ser**: esta regla va PRIMERO intencionalmente. Si arrancaramos por probabilidad de conversion, el mejor asesor se llevaria casi todos los leads y se romperia la promesa de cuota. Priorizando progreso en cuota aseguramos que cada asesor del piloto reciba aproximadamente los leads que se le prometieron.

**Caso borde — todos cumplieron cuota**: si todos los asesores elegibles ya estan al 100% de su cuota semanal, la Regla 1 se **ignora** y el routing pasa directo a las siguientes reglas. No se deja al lead en espera.

Ejemplo (lead de tipo high):
- Asesor 1: 1 / 3 = 0.33 (33%) → menor progreso, gana
- Asesor 2: 1 / 1 = 1.00 (100%)

### Regla 2 — ~~Exclusion por probabilidad minima~~ **NO SE TOMA EN CUENTA**

~~Aparece en la imagen fuente como filtro duro que excluia asesores con prob_conversion < 30% para este lead.~~

**Razon de ser (intencion con la que fue dibujada)**: filtrar asesores que historicamente no saben convertir ESTE tipo de lead, para evitar "desperdiciar" leads buenos en asesores que no los aprovecharian. Buscaba poner un piso de calidad de conversion antes de entrar al ranking.

**Decision del negocio**: **Regla 2 no se toma en cuenta ni siquiera en el diseno original que estamos trabajando**. Aunque aparece en la imagen, el negocio la descarto porque no es una regla de asignacion sino de exclusion, y prefiere no aplicar un piso duro que pueda dejar leads sin asesor asignado. Las reglas siguientes conservan su numeracion (3, 4, 5, 6) para mantener consistencia con la imagen fuente, pero cuando hablemos del "diseno original del enrutamiento" debemos entender que son **solo 5 reglas activas: 1, 3, 4, 5 y 6**.

### Regla 3 — Modelo de enrutamiento

> **Pendiente de discutir**: el nombre y alcance de esta regla estan en revision. Originalmente era solo **prob_conversion** (un unico factor del modelo ML). Hoy nuestro modelo es de 3 factores (`0.25·contacto + 0.60·conversion + 0.15·persistencia`), y el factor `prob_contacto` ademas se esta repensando para que incorpore la carga actual del asesor — lo que se superpone con Regla 4. Esta discusion queda en pausa hasta revisar el codigo del CRM.

**Diseno original**: entre los asesores sobrevivientes de las reglas anteriores, se asigna al de **mayor probabilidad de conversion** para este lead (un solo numero del modelo ML, no el score 3 factores).

**Razon de ser (intencion original)**: una vez que ya filtramos por cuota (Regla 1), esta es la regla que aplica el criterio de negocio mas importante — **maxima probabilidad de cerrar venta**. Es el corazon del enrutamiento: dado que el lead ya tiene asesores candidatos legitimos, elegir al que mas probablemente lo convierta en cliente.

Ejemplo:
- Asesor 1: 65%
- Asesor 2: 57%
- Gana asesor 1.

### Regla 4 — Carga actual (desempate)

> **Pendiente de discutir**: entra en conflicto con el factor `prob_contacto` del modelo 3 factores si este ultimo llega a incorporar carga actual. Queda en pausa hasta revisar el codigo del CRM.

**Diseno original**: si dos o mas asesores empatan en la Regla 3, gana el que tenga **menor carga actual** de leads por gestionar.

**Definicion de "leads por gestionar"**: un lead por gestionar es un lead que ya fue enrutado hacia un asesor pero el asesor **aun no ha hecho nada con el** (no lo ha contactado, no le ha respondido, no lo ha marcado en ningun estado). Es un lead "en su bandeja" esperando accion. La definicion exacta se vera mejor cuando revisemos el codigo del CRM.

**Razon de ser**: si un asesor tiene muchos leads por gestionar y le llega otro mas por la campana de Meta, con esta regla ese lead se redirige a un asesor menos ocupado para no hacerlo esperar. Evita que el lead espere mientras el asesor "se desatasca".

Ejemplo:
- Asesor 1: 6 leads por gestionar
- Asesor 2: 3 leads por gestionar
- Gana asesor 2.

### Regla 5 — Tiempo desde la ultima asignacion (desempate siguiente)

Si el empate persiste tras Regla 4, gana el asesor que lleve **mas tiempo sin recibir un lead nuevo**.

**Razon de ser (intencion original)**: repartir con justicia. Cuando dos asesores estan igualados en todo lo anterior, el que lleva mas tiempo esperando un lead merece el siguiente. Evita que siempre gane el mismo en empates consecutivos y mantiene rotacion natural del flujo de leads dentro del equipo.

**Evento de referencia (decidido)**: el tiempo se mide desde el **ultimo lead asignado** al asesor, sin importar lo que haya hecho o no con el. En BD se deriva de `max(hist_asignaciones.fecha_asignacion)` por asesor — no requiere columna nueva.

Ejemplo:
- Asesor 1: 2h desde ultima asignacion
- Asesor 2: 4h desde ultima asignacion
- Gana asesor 2.

### Regla 6 — Aleatorio (ultimo recurso)

Si despues de aplicar las 5 reglas sigue habiendo mas de un asesor empatado, la asignacion se hace **aleatoriamente** entre los sobrevivientes.

**Razon de ser (intencion original)**: desempate final limpio y sin sesgo. Cuando ni siquiera el tiempo de espera distingue a los candidatos, cualquier decision deterministica introduciria un sesgo arbitrario (ej. orden alfabetico, orden de insercion en BD). El random es la forma mas honesta de cerrar el desempate sin favorecer a nadie.

**Cuando realmente se dispara**: un grupo de asesores llega a Regla 6 solo si tienen **exactamente igual** progreso en cuota, **exactamente igual** prob_conversion, **exactamente igual** cantidad de leads por gestionar y **exactamente igual** tiempo desde su ultima asignacion. Es un escenario raro pero posible, y la aleatorizacion es el desempate final limpio.

### Nota clave sobre las reglas 4, 5 y 6 como desempates

En el diseno original, **Regla 3 era SOLO `prob_conversion`** (un solo numero del modelo, no el score 3 factores). Por eso las reglas 4, 5 y 6 tienen sentido como desempate: dos asesores pueden compartir la misma `prob_conversion` si el modelo la cuantiza en bandas o si sus historiales son similares.

Al cambiar el modelo a 3 factores mezclados, los empates exactos en el score combinado son practicamente imposibles, lo que dejaria a las reglas 4-6 sin disparo real si quedaran como simple desempate del diseno original. La arquitectura de 2 capas (ver seccion siguiente) resuelve este problema tratando Reglas 1/4/5/6 como filtros/preferencias operativas separadas, no como desempates exactos de la Regla 3.

### Preguntas resueltas

- ✅ **Regla 1 direccion**: menor progreso gana.
- ✅ **Regla 1 caso borde**: si todos cumplieron cuota, se ignora y se pasa a la siguiente.
- ✅ **Regla 2**: eliminada, no se usa.
- ✅ **"Leads por gestionar"**: leads enrutados al asesor sobre los que aun no ha actuado. Concretamente: `hist_asignaciones.estado_gestion = 'en_espera'` o sin ninguna fila en `crm_acciones_comerciales`.
- ✅ **Reglas 4-5-6 como desempates**: en el diseno original son desempates exactos porque Regla 3 era solo prob_conversion.
- ✅ **Regla 3 alcance (alcance tecnico)**: se mantiene como score 3 factores. **No** se simplifica a solo `prob_conversion` — el historico de contactabilidad y persistencia aportan senal valiosa. Ver arquitectura de 2 capas.
- ✅ **Regla 4 vs `prob_contacto`**: **no se mezclan**. `prob_contacto` es historico (capa 1), carga actual es en vivo (capa 2). Mezclarlos rompe interpretabilidad y estabilidad temporal. Ver arquitectura de 2 capas.
- ✅ **Regla 5 — desde que evento se mide el tiempo**: desde el **ultimo lead asignado** al asesor (`max(hist_asignaciones.fecha_asignacion)`), sin importar si lo gestiono o no.
- ✅ **Patron de combinacion de capas**: **Patron A + Opcion X** para el inicio del piloto.

### Preguntas pendientes

Ninguna critica para el inicio del piloto. Pendientes de seguimiento:
- Si durante el piloto observamos que los asesores con historial pobre reciben muy pocos leads, migrar a **Opcion Z** (epsilon tolerance en Regla 3).

---

## Arquitectura de 2 capas

> **Estado**: decidido conceptualmente. Pendiente de elegir el patron concreto de combinacion entre capas.

El routing per-lead se descompone en dos capas con naturalezas distintas:

### Capa 1 — Historica (estable, offline)

**Pregunta que responde**: "Quien es intrinsecamente el mejor candidato para un lead con este perfil?"

- **Regla 3** (modelo 3 factores) vive aqui.
- Se alimenta de Excels estaticos (`SDV_Leads.csv`, `bd_fondos.csv`, `frente/*.xlsx`) refrescados periodicamente.
- Los tres factores (`prob_contacto`, `prob_conversion`, `persistencia`) son todos historicos.
- No cambia minuto a minuto. Es estable en el tiempo.
- Lo corre el servicio `comercial-routing` al recibir el trigger de Firestore.

### Capa 2 — Operativa (dinamica, en vivo)

**Pregunta que responde**: "Entre los candidatos intrinsecamente buenos, a quien le toca AHORA segun el estado actual?"

- **Reglas 1, 4, 5 y 6** viven aqui.
- Se alimenta de PostgreSQL en tiempo real (`bd_asesores.leads_en_cola`, `hist_asignaciones.fecha_asignacion`, tabla futura `cuotas_semanales`, etc.).
- Cambia en cada asignacion. Refleja la gestion operativa del momento.

### Por que separar

1. **Interpretabilidad**: "Score historico 0.65" es una afirmacion clara. "Score historico 0.65 ajustado por carga actual" no es comparable entre asesores ni entre momentos.
2. **Estabilidad temporal**: el score historico no deberia cambiar minuto a minuto.
3. **Separacion de responsabilidades**: el modelo historico se entrena offline con Excels; el estado en vivo se lee de PostgreSQL. Son datasets con frecuencias, dueños y consistencias distintas.
4. **Debugging**: si algo sale mal, puedes distinguir "fallo el modelo" vs "el asesor estaba saturado y desvie mal".
5. **Respeto al diseño original**: las reglas 1/4/5 del negocio son todas de estado actual; la regla 3 es la unica historica. La separacion en 2 capas ya estaba implicita ahi.

### Patrones de combinacion entre capas (pendiente de decidir)

Cuando las dos capas apuntan a asesores distintos, hay tres patrones canonicos para resolver el conflicto:

#### Patron A — Operacional manda, historica ordena ("filter then rank")

1. La capa operativa aplica primero: filtra por Regla 1 (cuota) y Regla 4 (carga) como restricciones duras o preferencias fuertes.
2. Sobre los candidatos que sobreviven, la capa historica ordena por score 3 factores y elige al mejor.
3. Si hay empate historico (raro), Reglas 5 y 6 desempatan.

- **Quien gana si hay conflicto**: el asesor con menos progreso de cuota y menos carga, aunque su score historico sea medio.
- **Pros**: respeta promesa de cuota (no rompes tu palabra con el asesor), evita saturacion, salud operativa del piloto.
- **Contras**: a veces un lead muy bueno va a un asesor historicamente no-optimo porque el mejor ya cumplio cuota o esta saturado.
- **Coincide casi literalmente con el diseno original del negocio (6 reglas secuenciales).**

#### Patron B — Historica manda, operacional desempata ("rank then tiebreak")

1. La capa historica ordena a todos los asesores por score 3 factores.
2. Se elige al de mayor score.
3. La capa operativa solo actua si hay empate cercano (en score historico).

- **Quien gana si hay conflicto**: el asesor de mejor score historico, aunque ya cumplio cuota o este saturado.
- **Pros**: maximiza prob de conversion de cada lead individual.
- **Contras**: el mejor asesor se lleva casi todos los leads, el resto recibe migajas, se rompe la promesa de cuota, los asesores "medios" del piloto no reciben experiencia ni comisiones.
- **No recomendado para el piloto**: mata el sentido de repartir con equidad entre los 7 asesores.

#### Patron C — Score ponderado combinado

Convertir las señales operativas en valores continuos y combinarlas con el score historico en un solo numero:

```
score_final = α · score_historico
            + β · (1 - progreso_cuota)
            + γ · (1 - carga_normalizada)
            + δ · tiempo_sin_lead_normalizado
```

- **Quien gana si hay conflicto**: depende de los pesos.
- **Pros**: todas las señales cuentan simultaneamente, no hay empates, comportamiento suave.
- **Contras**:
  - **Rompe la separacion de capas** que acabamos de decidir.
  - Pierde interpretabilidad ("por que le fue a este y no al otro?").
  - Requiere calibrar 4 pesos sin intuicion clara.
  - El historico deja de ser comparable entre momentos porque se contamina con estado en vivo.
- **No recomendado** porque contradice la decision de separar capas.

### Recomendacion actual

**Patron A** es el preferido porque:
1. Respeta la separacion de capas (operativa actua como restriccion, historica actua sobre el subconjunto valido).
2. Respeta la promesa de cuota al asesor (compromiso explicito del piloto).
3. Es casi literalmente el diseno original del negocio.
4. Es interpretable: "Fue al asesor X porque era el de mejor score entre los que aun no cumplieron cuota y estaban libres."
5. Evita saturacion en caliente.

**Pendiente**: confirmar Patron A vs una variante matizada (ej. que la capa operativa sea "preferencia fuerte" en vez de filtro duro).

### Consideracion importante del piloto: asesores con historial pobre

Los 7 asesores del piloto tienen calidad de historial muy desigual:

- Vela (3311 leads / 117 ventas) e Inga (576/75) tienen data real y confiable.
- Reategui (298/10) tiene data parcial.
- Arancibia (267/4) y Huayhuas (0/5) tienen poco historial.
- Rodriguez (1903/0) no tiene persistencia real (solo fallback global).
- Cruzado (0/0) no tiene ningun historial (fallback global total en los 3 factores).

**Implicacion**: si la capa historica domina la decision per-lead (patron B o incluso patron A con filtro debil), los asesores sin historial quedan "muertos" — nunca ganan el ranking, nunca reciben leads, nunca acumulan data, nunca mejoran su score. El piloto los excluiria de facto.

Por eso la formulacion de Patron A tiene que hacer que la capa operativa sea el driver primario real, no solo un filtro. Las sub-opciones de como integrar la Regla 3 en la secuencia (ver siguiente seccion) surgen precisamente de este tradeoff.

### Sub-patrones de Patron A: como integrar Regla 3 en la secuencia operativa

> **Contexto**: estas 3 sub-opciones parten del hecho de querer **mantener la Regla 3 como segundo paso (despues de la Regla 1 progreso en cuota)** dentro de la secuencia operativa 1 → 3 → 4 → 5 → 6. El problema que resuelven: con Regla 3 = score 3 factores continuo, los empates exactos son imposibles, lo que dejaria a las reglas 4, 5 y 6 sin disparo real. Estas 3 opciones atacan ese problema de formas distintas.

#### Opcion X — Aceptar 4/5/6 como casos raros (1 → 3 → 4 → 5 → 6 literal) ✅ **ELEGIDA PARA EL INICIO DEL PILOTO**

Regla 1 filtra por cuota, Regla 3 decide por score histórico continuo, y reglas 4-5-6 practicamente nunca se disparan (solo si dos asesores tuvieran exactamente el mismo score 3 factores, lo cual no pasa en la practica).

- **Pro**: conceptualmente limpio, no hay que retocar el modelo ni introducir parametros nuevos.
- **Contra**: las reglas 4, 5 y 6 quedan como documentacion, no como logica activa. Dentro de cada nivel de cuota, el mejor asesor historico (Vela) se lleva casi todo. Los asesores con historial pobre solo reciben leads cuando Vela, Inga, etc. ya cumplieron cuota.

**Razones de la eleccion para el piloto inicial:**

1. **Simplicidad** — no introduce parametros nuevos ni logica de bucketing/epsilon que haya que calibrar. Es lo mas directo de implementar.
2. **Escala pequena del piloto** — con solo 7 asesores, las rondas de cuota se completan rapido. Ningun asesor espera un tiempo significativo entre leads.
3. **Preferencia explicita** del negocio: no sobreoptimizar en esta primera etapa.
4. **Reversible**: si durante el piloto vemos que los asesores con historial pobre quedan muy rezagados, podemos migrar a Opcion Z (epsilon) sin cambios de arquitectura — solo un parametro adicional en la logica de Regla 3.

**Mitigacion del contra principal**: la capa de cuota semanal (ver seccion "Distribucion semanal dinamica") es lo que garantiza que los asesores con historial pobre reciban su share semanal. Vela no puede llevarse todo porque al llegar a cuota cumplida queda filtrada por Regla 1, abriendo paso al resto.

#### Opcion Y — Bucketizar el score de Regla 3 en bandas

El modelo 3 factores sigue calculando el score continuo, pero al compararlo se **cuantiza en bandas fijas** (ej. "alto" ≥ 0.70, "medio" 0.40 - 0.69, "bajo" < 0.40). Asesores de la misma banda se consideran empatados y reglas 4-5-6 deciden entre ellos.

- **Pro**: reglas 4-5-6 si se disparan y tienen rol real.
- **Contra**:
  - Con 7 asesores, las bandas quedan casi vacias (Vela sola en "alto", 2-3 en "medio", el resto en "bajo").
  - Se pierde resolucion en las fronteras (un asesor con 0.69 y otro con 0.70 quedan en bandas distintas por 0.01).
  - El numero de bandas y sus limites son parametros arbitrarios.

#### Opcion Z — Tolerancia epsilon en Regla 3 (recomendada)

Dos asesores se consideran "empatados" en Regla 3 si `|score_A − score_B| < ε` (ej. ε = 0.10). Del grupo top, los que caen dentro del epsilon del lider van a reglas 4-5-6 como si fueran identicos.

**Ejemplo con scores hipoteticos del piloto y ε = 0.10:**

| Asesor | Score 3F | Dentro de ε del top? |
|--------|---------|---------------------|
| Vela | 0.82 | Top (referencia) |
| Inga | 0.75 | Si (0.82 − 0.75 = 0.07 < 0.10) ✓ |
| Reategui | 0.60 | No (0.22) |
| Arancibia | 0.52 | No |
| Huayhuas | 0.50 | No |
| Rodriguez | 0.48 | No |
| Cruzado | 0.46 | No |

→ Vela e Inga empatan en Regla 3 → reglas 4, 5, 6 deciden entre ellas.

**Con ε = 0.30**, el empate abarcaria a 5 asesores (Vela, Inga, Reategui, Arancibia, Huayhuas) y las reglas 4-5-6 repartirian entre los 5.

- **Pro**: epsilon es un **dial calibrable**. En el piloto temprano se pone grande para repartir mas; conforme los asesores nuevos acumulan data real, se achica y Regla 3 vuelve a ser mas decisiva.
- **Pro**: conserva la resolucion continua del modelo sin perder informacion por bucketing.
- **Pro**: es **un solo parametro** (no 4 pesos como en Patron C).
- **Pro — soluciona el problema de asesores sin historial**: con ε grande, los asesores con fallback global caen dentro del empate cuando Vela lidera, porque sus scores no estan tan lejos del promedio global. Entran a competir bajo reglas 4/5, y a medida que acumulan data real su score se aleja o acerca al top naturalmente. Es un mecanismo de "graduacion": los nuevos entran protegidos por ε y van ganando o perdiendo su spot segun rendimiento real.
- **Contra**: requiere calibrar el epsilon (pero es un solo numero).

**Recomendacion dentro de Patron A**: **Opcion Z con ε configurable por parametro**, arrancando en ε = 0.15-0.20 durante el piloto y ajustando despues. Es la unica que hace que reglas 4-5-6 tengan rol real sin introducir artificios como cuantizacion, y la unica que protege a los asesores con historial pobre sin sacrificar la estructura de Regla 3.

### Decision final: Patron A + Opcion X para el inicio del piloto

> **Estado**: decidido. Implementacion pendiente.

Se arranca el piloto con **Patron A + Opcion X** (1 → 3 → 4 → 5 → 6 literal, sin epsilon ni bucketing). Las opciones Y y Z quedan documentadas como posibles evoluciones si durante el piloto vemos que:
- Los asesores con historial pobre reciben muy pocos leads y no logran acumular data.
- Reglas 4, 5 y 6 deberian tener rol activo (por ej. para manejar carga en vivo).

Migrar de X a Z requiere solo agregar un parametro de tolerancia epsilon al comparar scores en Regla 3 — no implica cambios de arquitectura ni de BD.

### Gap con el routing actual

| Regla | Capa | Estado actual |
|-------|------|---------------|
| 1. Progreso en cuota | Operativa | Falta. No rastreamos cuotas semanales en BD. |
| ~~2. Exclusion por prob minima~~ | — | Eliminada del diseno. No se implementa. |
| 3. Modelo 3 factores | Historica | Implementado. Se queda como esta (no se simplifica). |
| 4. Carga actual | Operativa | Falta como preferencia graduada. Hoy solo hay filtro binario `leads_en_cola >= capacidad_max`. |
| 5. Tiempo desde ultima asignacion | Operativa | Falta. Se puede derivar de `max(hist_asignaciones.fecha_asignacion)` sin agregar columna. |
| 6. Aleatorio fallback | Operativa | Falta. Hoy si hay empate exacto el routing queda indeterminado. |

---

## Componentes

| Componente | Tipo | Funcion | Cuando corre |
|------------|------|---------|--------------|
| Bot | Cloud Run | Conversar, scorear, escribir en routing_queue | Mensaje entrante |
| ejecutar_routing | Cloud Function | Ejecutar modelo 3 factores, asignar asesor | Firestore trigger (created) |
| Firestore | Database | Puente de eventos + estado de routing | Siempre |
| PostgreSQL | Database | Datos principales (leads, asesores, matching, asignaciones) | Siempre |

---

## Diagrama de flujo

```
                    CLIENTE ESCRIBE
                          |
                          v
               +---------------------+
               |   Bot (Cloud Run)   |
               |   - Analiza mensaje |
               |   - Captura datos   |
               |   - Calcula score   |
               +----------+----------+
                          |
                          v
              datos_minimos_completos?
                    |           |
                   NO          SI
                    |           |
                    v           v
              Seguir      Doc en routing_queue
              pidiendo    con created_at reciente?
              datos            |          |
                              SI         NO
                               |          |
                               v          v
                            SKIP     Escribir doc en
                                     routing_queue/{id_lead}
                                     + responder "un asesor
                                       te contactara"
                                          |
                                          v
                                  Firestore Trigger
                                     (created)
                                          |
                                          v
                              +-----------------------+
                              |    Cloud Function     |
                              |  ejecutar_routing     |
                              |                       |
                              |  1. obtener_mejor_    |
                              |     asesor()          |
                              |  2. crear matching    |
                              |  3. crear asignacion  |
                              |  4. actualizar lead   |
                              |  5. actualizar doc    |
                              |     estado=completado |
                              +-----------------------+
```

---

## Costos estimados

| Componente | Modelo de cobro | Estimado mensual |
|------------|-----------------|------------------|
| Cloud Function (routing) | Por invocacion | ~$1-5 |
| Firestore writes | Por operacion | ~$0.50-2 |

**Total adicional estimado:** $2-7/mes (depende del volumen de leads)

---

## Ventajas sobre routing dentro del bot

| Aspecto | Routing en bot (antes) | Routing en Cloud Function (ahora) |
|---------|----------------------|----------------------------------|
| Latencia webhook | +3-10s (routing bloqueaba respuesta) | 0s (routing es asincrono) |
| Riesgo de timeout Meta | Alto (>15s total) | Bajo (<5s total) |
| Mensajes duplicados | Frecuente (Meta reenviaba) | Raro (200 llega rapido) |
| Memoria Cloud Run | 1GB (cache de DataFrames) | 512MB suficiente |
| Escalabilidad | Limitada por Cloud Run | Independiente |

---

*Documento de arquitectura de routing para Bot Comercial Maqui+*
*Ultima actualizacion: Marzo 2026*
