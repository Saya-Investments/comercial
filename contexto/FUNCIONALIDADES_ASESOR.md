# Funcionalidades del Asesor - CRM maqui+

## Resumen General

El asesor comercial es el rol principal de gestión de leads en el CRM. Al ingresar, accede a **4 módulos**: Mi Actividad (dashboard), Leads, Tareas y Calendario. Su función es gestionar los leads asignados, realizar acciones comerciales (llamadas, citas) y cerrar ventas.

---

## 1. Autenticación

### Primer Ingreso
- El administrador crea la cuenta del asesor.
- El asesor hace clic en **"Es mi primer ingreso"**, ingresa su correo y establece una contraseña (mínimo 6 caracteres).

### Login Regular
- Ingreso con **correo + contraseña**.
- Al autenticarse, se redirige automáticamente al módulo **"Mi Actividad"**.

### Cerrar Sesión
- Disponible desde la barra lateral (sidebar). Limpia la sesión del navegador.

---

## 2. Mi Actividad (Dashboard Personal)

Pantalla de inicio por defecto del asesor. Muestra un **embudo de rendimiento personal** con tres indicadores:

| Indicador | Descripción |
|-----------|-------------|
| **Recibidos** (azul) | Total de leads asignados al asesor |
| **Gestionados** (ámbar) | Leads que tienen al menos una acción comercial registrada |
| **Venta Cerrada** (verde) | Leads con estado `Venta_cerrada` |

### Métricas Calculadas
- **Tasa de Gestión**: `(Gestionados / Recibidos) × 100`
- **Tasa de Cierre**: `(Venta Cerrada / Gestionados) × 100`

---

## 3. Gestión de Leads

### 3.1 Visualización de Leads

El asesor ve **únicamente los leads asignados a él** en una tabla con las siguientes columnas:

| Columna | Detalle |
|---------|---------|
| DNI | Documento de identidad del lead |
| Nombre | Nombre completo |
| Teléfono | Número de contacto |
| Scoring | Puntaje 0-100 con badge de color (verde ≥70, amarillo 40-69, rojo <40) |
| Estado | Estado actual del lead |
| Fecha | Fecha de asignación |
| Producto | Producto de interés |
| Prioridad | Alta / Media / Baja (derivada del scoring) |
| Base | "Caliente" (asignado hace < 2 meses) o "Stock" (> 2 meses) |
| Reasignación | Temporizador de cuenta regresiva de 24 horas |
| Acciones | Botones de acción |

### 3.2 Filtros y Búsqueda

- **Búsqueda libre**: por nombre, DNI o número de teléfono.
- **Filtro por prioridad**: Alta (scoring ≥ 0.7), Media (0.4 - 0.69), Baja (< 0.4).
- **Filtro por estado**: Asignado, En gestión, Descartado.
- **Filtro por fecha**: Desde una fecha específica.

### 3.3 Exportar a CSV

Botón para descargar todos los leads visibles en formato CSV.

### 3.4 Temporizador de Reasignación (24 horas)

Cada lead tiene un **contador regresivo de 24 horas** desde su asignación:
- **Verde** (> 12 horas restantes)
- **Ámbar** (4 a 12 horas)
- **Rojo** (< 4 horas)
- **"Vencido"** (tiempo expirado)

Si el asesor no registra ninguna acción comercial dentro de las 24 horas, el lead se **reasigna automáticamente** al siguiente asesor en el ranking.

---

## 4. Acciones Comerciales

Al hacer clic en el ícono de maletín de un lead, se abre un modal con **3 tipos de acción**:

### 4.1 Llamada Telefónica

| Campo | Detalle |
|-------|---------|
| Estado Asesor | Selección obligatoria: `No_contesta`, `No_interesado`, `Interesado`, `Contactado`, `Seguimiento`, `Venta_cerrada` |
| Notas de la Llamada | Texto libre opcional |

**Resultado**: Registra la llamada, actualiza el estado del lead y genera historial de cambio de estado.

### 4.2 Agendar Llamada

| Campo | Detalle |
|-------|---------|
| Fecha | Fecha de la llamada programada |
| Hora | Hora de la llamada |
| Notas | Texto libre opcional |

**Resultado**: Crea una cita de tipo "llamada", actualiza el estado a `Llamada_agendada`. Si Google Calendar está conectado, **sincroniza automáticamente** el evento.

### 4.3 Agendar Cita (Reunión)

| Campo | Detalle |
|-------|---------|
| Fecha | Fecha de la cita |
| Hora | Hora de la cita |
| Notas | Texto libre opcional |

**Resultado**: Crea una cita de tipo "reunión", actualiza el estado a `Seguimiento`. Si Google Calendar está conectado, **sincroniza automáticamente** el evento.

---

## 5. Detalle del Lead (4 pestañas)

Al hacer clic en el ícono de ojo, se abre un modal con información detallada:

### 5.1 Pestaña: Información
Datos estáticos del lead: DNI, nombre, teléfono, estado, fecha de asignación, producto de interés y prioridad.

### 5.2 Pestaña: Acciones Comerciales
Lista cronológica de **todas las acciones** realizadas sobre el lead:
- Tipo de acción (ícono: teléfono, calendario, apretón de manos)
- Estado asignado (badge con color)
- Usuario que realizó la acción + fecha/hora
- Observaciones
- Detalles de cita vinculada (si aplica)

### 5.3 Pestaña: Historial de Estado
Línea de tiempo de **transiciones de estado**:
- Estado anterior → Estado nuevo
- Quién realizó el cambio
- Tipo de acción que originó el cambio
- Fecha/hora
- Observaciones

### 5.4 Pestaña: Historial de Scoring
Línea de tiempo visual del scoring del lead:
- Porcentaje de scoring con indicador de tendencia (sube/baja)
- Evento que originó el cambio: `respuesta_bot`, `decaimiento`, `nlp_update`, `campana`, `manual`, `reciclaje`
- Sentimiento: positivo / neutral / negativo
- Nivel de interés y contactabilidad (%)
- Barra de progreso visual

---

## 6. Historial de Conversación (Chat del Bot)

Al hacer clic en el ícono de mensaje, se abre un **visor de conversación de WhatsApp** (solo lectura):
- Muestra el historial completo de mensajes entre el bot y el lead.
- Mensajes del lead a la izquierda (gris), mensajes del bot a la derecha (azul).
- Soporte para imágenes (clic para ver tamaño completo).
- Mensajes ordenados cronológicamente con marca de tiempo (zona horaria Perú).

---

## 7. Registrar Prospecto (NSV)

Funcionalidad **exclusiva del asesor**. Solo se habilita cuando el estado del lead es `Venta_cerrada`.

### Flujo (3 pasos):
1. **Información**: Muestra datos del lead (nombre, DNI, teléfono) con explicación del proceso.
2. **Confirmación**: Diálogo de advertencia — "Esta acción no se puede deshacer".
3. **Guardado**: Confirmación de éxito.

### Qué hace internamente:
- Se autentica con el **sistema externo NSV** (API de prospectos).
- Registra al lead como prospecto en NSV con: datos del cliente + datos de venta (código del asesor, origen: LEADS, suborigen: BOT, nivel de interés: CALIENTE).

---

## 8. Tareas por Prioridad

Vista organizada de leads pendientes agrupados por prioridad.

### Vista de Tarjetas
Tres tarjetas resumen:

| Prioridad | Color | Criterio |
|-----------|-------|----------|
| **Alta** | Verde | Scoring ≥ 0.7 |
| **Media** | Amarillo | Scoring 0.4 - 0.69 |
| **Baja** | Rojo | Scoring < 0.4 |

Cada tarjeta muestra: total de leads, completados y porcentaje de avance.

### Vista de Tabla (al hacer clic en una tarjeta)
Tabla detallada con columnas: DNI, Nombre, Teléfono, Estado, Producto, Fecha Asignada, Acciones.

Un lead se considera **"completado"** cuando su estado es `venta` o `descartado`.

Desde esta vista también se pueden ejecutar las mismas acciones: registrar llamada, ver conversación y ver detalle.

---

## 9. Calendario de Citas

### 9.1 Vista Mensual
Grilla de calendario mensual que muestra todas las citas del asesor con código de colores:
- **Llamada** = Azul
- **Reunión** = Azul primario
- **Video** = Morado
- **Cancelada** = Opacidad reducida + texto tachado

### 9.2 Panel Lateral
Lista de próximas citas con detalles rápidos.

### 9.3 Crear Nueva Cita
Botón **"Nueva Cita"** que abre un formulario con:

| Campo | Detalle |
|-------|---------|
| Título | Nombre de la cita |
| Lead/Contacto | Lead asociado |
| Fecha | Fecha de la cita |
| Hora | Hora de la cita |
| Tipo | Llamada / Reunión / Video |
| Ubicación | Lugar (opcional) |
| Descripción | Detalle (opcional) |

### 9.4 Editar Cita
Al hacer clic en un evento del calendario o del panel lateral, se puede modificar cualquier campo.

### 9.5 Cancelar / Reactivar Cita
Se puede cambiar el estado entre `active` y `cancelled`.

---

## 10. Integración con Google Calendar

### Conectar
1. Clic en **"Conectar Google Calendar"** desde el módulo de calendario.
2. Se abre la autorización de Google (OAuth2).
3. Al autorizar, se vincula la cuenta.

### Funcionalidad una vez conectado
- **Todas las citas nuevas** se sincronizan automáticamente a Google Calendar.
- **Ediciones y cancelaciones** se reflejan en Google Calendar.
- Los eventos incluyen **recordatorios automáticos** a 15 minutos y 5 minutos antes.
- Zona horaria: America/Lima.
- Duración por defecto: 1 hora.

### Desconectar
Se puede desconectar Google Calendar en cualquier momento.

---

## 11. Notificaciones Automáticas

### Recordatorios de Citas por Email
El sistema envía **recordatorios por correo electrónico** 15 minutos antes de cada cita activa programada.

### Reasignación Automática
Si no se registra ninguna acción comercial en **24 horas**, el lead se reasigna automáticamente al siguiente asesor disponible. Motivo registrado: _"Sin gestión en 24h"_.

---

## Flujo de Estados del Lead (Asesor)

```
Asignado (estado inicial)
    │
    ├── No_contesta
    ├── No_interesado
    ├── Interesado
    ├── Contactado
    ├── Llamada_agendada (al agendar llamada)
    ├── Seguimiento (al agendar cita)
    └── Venta_cerrada
            │
            └── Registrar Prospecto en NSV (acción exclusiva del asesor)
```

---

## Módulos NO Accesibles para el Asesor

| Módulo | Acceso |
|--------|--------|
| Campañas | Solo Admin |
| Templates | Solo Admin |
| Usuarios | Solo Admin |
| Costo del Bot | Solo Admin |
| Reglas de Enrutamiento | Solo Admin |
| Actividad de Asesores | Solo Admin |
| Dashboard Call Center | Solo Call Center / Admin |
| Filtro por asesor (en leads/tareas) | Solo Admin |
