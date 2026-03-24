# Estrategia Call Center — Leads Calientes

## Contexto

En el CRM, los leads aparecen divididos por prioridad segun el scoring de la conversacion con el bot:
- **Alta / Calientes** — score alto, lead muy interesado
- **Media / Tibios** — score medio, interes moderado
- **Baja / Frios** — score bajo, poco interes

Nota: alta=caliente, media=tibio, baja=frio son sinonimos en el equipo.

Los asesores gestionan los leads desde el CRM. Los leads medios y bajos van en su totalidad a los asesores.

## Idea del Piloto: Call Center para Leads Calientes

### Que es el Call Center
- Grupo de personas en la empresa que NO son asesores
- No estan capacitados como asesores y ganan menos
- Funcion actual: recibir llamadas, dudas informativas, quejas, etc.

### Distribucion Propuesta (Piloto)
- **30% de leads altos** → Call Center
- **70% de leads altos** → Asesores
- **100% de leads medios y bajos** → Asesores

### Logica Detras
- Los leads calientes (score alto) ya vienen con alta intencion de compra
- No necesitan mucho trabajo de convencimiento (que es lo que haría un asesor)
- Son leads que "casi cualquiera podria gestionar" por su alto interes
- Si el call center logra convertirlos, el costo operativo de conversion es menor (call center gana menos que un asesor)

### Objetivo
- Demostrar que el call center puede convertir leads calientes a clientes
- Si funciona bien, aumentar el porcentaje de leads calientes que van al call center (ej: 40/60, 50/50, etc.)
- Reducir el costo de conversion de lead a cliente en la operacion

### Escalamiento
- La distribucion 30/70 es configurable y puede cambiar segun resultados del piloto
- Si el call center demuestra buenas tasas de conversion, se le asigna un mayor porcentaje de leads calientes

## Casos de Derivacion del Call Center

El call center tiene su propia vista en el CRM. Cuando recibe un lead caliente, hay 3 posibles desenlaces:

### Caso 1: Derivacion manual a un asesor
- El call center se comunico con el lead caliente pero no pudo convertirlo (por la razon que sea)
- El call center deriva manualmente al lead hacia el asesor que le correspondia en el enrutamiento original
- Se hace mediante un boton en el CRM

### Caso 2: Derivacion automatica a un asesor
Ocurre en dos situaciones:

**a) Sin gestion en 2 horas:**
- Si el lead lleva 2h o mas sin recibir NINGUNA gestion por parte del call center en el CRM
- Se deriva automaticamente al asesor correspondiente
- EXCEPCION: si el call center ya contacto al lead y este pidio que lo llamen despues (ej: "llamame en 3 horas"), ese lead ya NO cuenta como "sin gestion" — ya hubo un contacto inicial, entonces no se deriva por timeout

**b) Cola del call center llena:**
- Cada persona del call center tiene una capacidad maxima de 2 leads en cola
- Si TODOS los usuarios call center en el CRM tienen cola llena (2 leads cada uno), el nuevo lead caliente se deriva automaticamente al asesor correspondiente y no pasa por call center

### Caso 3: Derivacion a la app del vendedor (conversion exitosa)
- El call center logro cerrar la venta con el lead caliente
- En el CRM hay un boton de "derivar a la app del vendedor"
- En la app del vendedor se cierra formalmente la venta y el lead se convierte en cliente
- Este es el punto donde termina el alcance de nuestro piloto (la app del vendedor es un sistema propio de la empresa)

## Alcance Bot vs CRM

| Componente | Responsable |
|---|---|
| Scoring del lead (caliente/tibio/frio) | Bot comercial |
| Distribucion 30/70 call center vs asesor | Routing (comercial-routing) |
| Vista del call center, botones de derivacion | CRM |
| Derivacion automatica (2h sin gestion, cola llena) | CRM |
| Derivacion a app del vendedor | CRM → App empresa |
| Reasignacion afecta leads_en_cola y hist_asignaciones | BD compartida |

## Logica de Asignacion

### Asignacion a asesor (routing)
- Modelo de 3 factores (contacto, conversion, persistencia)
- Se basa en historial y datos del asesor
- Siempre se calcula, independientemente de si el lead pasa por call center o no

### Asignacion a call center
- **Aleatoria** entre los usuarios call center disponibles con cola < 2
- No hay modelo de scoring ni factores — no se necesita porque no hay historial del call center
- Simple: se eligen los disponibles con capacidad y se asigna random
- La decision de si un lead caliente va al call center o al asesor es por probabilidad (30% call center, 70% asesor)

## Analisis de la Estrategia

### Puntos a favor
- **Riesgo controlado** — el 30/70 es un piloto conservador, si falla solo afecta al 30% de leads calientes
- **Logica solida** — si un lead ya viene muy interesado, el margen de convencimiento necesario es bajo
- **Casos de fallo cubiertos** — los 3 casos de derivacion aseguran que ningun lead caliente se pierda (manual, automatico por timeout, automatico por cola llena)
- **Escalable** — si funciona, solo se ajusta el porcentaje
- **Libera asesores** — los asesores se enfocan en leads tibios/frios donde realmente se necesita su habilidad de venta

### Riesgos y puntos en contra
- **Caliente no es lo mismo que facil** — un lead con score alto puede tener preguntas tecnicas o condiciones complejas que el call center no sepa manejar. El interes alto no elimina la complejidad de la venta
- **Mala primera impresion** — si el call center atiende mal a un lead caliente y luego se escala al asesor, ese lead ya se pudo haber enfriado o perdido confianza. Un lead caliente mal gestionado puede ser peor que uno tibio bien gestionado
- **Criterio de seleccion del 30%** — si es aleatorio esta bien para el piloto, pero si ciertos leads calientes son mas complejos que otros, podrian necesitar criterios de seleccion mas finos
- **Precision del scoring** — si el bot clasifica mal a un lead tibio como caliente, va al call center y este no puede manejarlo. La calidad del scoring es clave para que la estrategia funcione
- **Capacitacion minima** — el call center necesita algun script o guia para gestionar estos leads, no son llamadas informativas, son cierres de venta
- **Metrica de exito** — hay que definir antes de empezar que cuenta como "conversion exitosa" para el piloto (derivacion a app del vendedor, tiempo de conversion, etc.)
