# Manual del Asesor - CRM maqui+

## Gestión de Leads Comerciales

---

## Tabla de Contenidos

1. [Inicio de Sesión](#1-inicio-de-sesión)
2. [Navegación Principal](#2-navegación-principal)
3. [Mi Actividad - Dashboard](#3-mi-actividad---dashboard)
4. [Módulo de Leads](#4-módulo-de-leads)
5. [Acciones Comerciales](#5-acciones-comerciales)
6. [Detalle del Lead](#6-detalle-del-lead)
7. [Registrar Prospecto](#7-registrar-prospecto)
8. [Historial de Conversación](#8-historial-de-conversación)
9. [Tareas por Prioridad](#9-tareas-por-prioridad)
10. [Calendario de Citas](#10-calendario-de-citas)

---

## 1. Inicio de Sesión

### Primer Ingreso

Si es tu primera vez accediendo al CRM:

1. Haz clic en **"Es mi primer ingreso"**
2. Ingresa tu **correo electrónico**
3. Crea una **nueva contraseña** (mínimo 6 caracteres)
4. **Confirma la contraseña** (debe coincidir)
5. Haz clic en **"Configurar contraseña"**

### Ingreso Regular

1. Ingresa tu **correo electrónico**
2. Ingresa tu **contraseña**
3. Haz clic en **"Iniciar Sesión"**

> Si hay un error, se mostrará un mensaje en rojo debajo del formulario.

---

## 2. Navegación Principal

Al iniciar sesión como **asesor**, verás un menú lateral (sidebar) con las siguientes opciones:

| Módulo | Descripción |
|--------|-------------|
| **Mi Actividad** | Dashboard personal con tu funnel de gestión |
| **Leads** | Lista de leads asignados para gestionar |
| **Tareas** | Leads organizados por prioridad (Alta, Media, Baja) |
| **Calendario** | Calendario de citas y llamadas programadas |

En la parte inferior del menú se muestra tu **nombre** y **rol**, junto con el botón **"Salir"** para cerrar sesión.

> El menú lateral se puede **colapsar/expandir** haciendo clic en el botón de flechas.

### Módulos que NO están disponibles para el asesor

Los siguientes módulos son exclusivos del administrador:
- Campañas
- Plantillas
- Asesores (monitoreo)
- Enrutamiento
- Usuarios
- Costo Bot

---

## 3. Mi Actividad - Dashboard

Esta es tu **pantalla principal** al ingresar al CRM. Muestra un resumen de tu gestión de leads.

### Funnel de Gestión

El funnel muestra 3 etapas con indicadores circulares conectados por flechas:

| Etapa | Color | Descripción |
|-------|-------|-------------|
| **Recibidos** | Azul | Total de leads que te han sido asignados |
| **Gestionados** | Ámbar | Leads en los que has realizado al menos una acción comercial |
| **Venta Cerrada** | Verde | Leads donde el estado final es "Venta cerrada" |

### Tasas de Conversión

Debajo del funnel se muestran dos tarjetas:

- **Tasa de Gestión** (color ámbar): Porcentaje de leads recibidos que has gestionado
  - Fórmula: (Gestionados / Recibidos) × 100
- **Tasa de Cierre** (color verde): Porcentaje de leads gestionados que cerraste como venta
  - Fórmula: (Venta Cerrada / Gestionados) × 100

---

## 4. Módulo de Leads

Aquí puedes ver y gestionar **todos los leads que te han sido asignados**.

### Filtros Disponibles

| Filtro | Opciones |
|--------|----------|
| **Buscar** | Busca por nombre, DNI o teléfono |
| **Prioridad** | Alta, Media, Baja |
| **Estado** | Asignado, En gestión, Descartado |
| **Fecha** | Filtra desde una fecha específica |

- Los filtros activos se muestran como **etiquetas** debajo de la barra de búsqueda (ej: "Prioridad: Alta")
- Puedes limpiar todos los filtros con el botón **"Limpiar"**

### Columnas de la Tabla de Leads

| Columna | Descripción |
|---------|-------------|
| **DNI** | Documento de identidad del lead |
| **Nombre** | Nombre completo |
| **Teléfono** | Número de contacto |
| **Scoring** | Puntuación de calidad del lead (0-100%) |
| **Estado** | Estado actual del lead |
| **Fecha** | Fecha de asignación |
| **Producto** | Producto de interés |
| **Prioridad** | Nivel de prioridad |
| **Base** | Clasificación por antigüedad |
| **Reasignación** | Tiempo restante antes de reasignación |
| **Acciones** | Botones de acción |

### Código de Colores - Scoring

| Rango | Color | Prioridad |
|-------|-------|-----------|
| 70% o más | Verde | Alta |
| 40% - 69% | Amarillo | Media |
| Menos de 40% | Rojo | Baja |

### Código de Colores - Estado

| Estado | Color |
|--------|-------|
| Asignado | Verde |
| En gestión | Amarillo |
| Descartado | Rojo |

### Código de Colores - Base

| Tipo | Color | Significado |
|------|-------|-------------|
| **Caliente** | Naranja | Asignado hace menos de 2 meses |
| **Stock** | Azul | Asignado hace más de 2 meses |

### Temporizador de Reasignación

Cada lead tiene un temporizador de **24 horas** desde su asignación. El color cambia según el tiempo restante:

| Tiempo Restante | Color | Urgencia |
|-----------------|-------|----------|
| 12+ horas | Verde | Normal |
| 4-12 horas | Ámbar | Advertencia |
| Menos de 4 horas | Rojo | Urgente |
| Sin tiempo | Rojo - "Vencido" | Expirado |

> Cuando el temporizador se vence, el lead puede ser reasignado automáticamente a otro asesor.

### Botones de Acción por Lead

En cada fila de la tabla tienes 4 botones:

| Botón | Icono | Acción |
|-------|-------|--------|
| **Acciones comerciales** | Maletín | Abre el modal para registrar llamadas, agendar llamadas o citas |
| **Ver conversación** | Mensaje | Muestra el historial de mensajes del lead con el bot |
| **Ver detalle** | Ojo | Muestra información completa del lead |
| **Registrar prospecto** | Persona con check | Registra al lead como prospecto (solo si "Venta cerrada") |

### Exportar Datos

En la parte inferior de la tabla encontrarás:
- El conteo total de leads encontrados
- El botón **"Exportar data"** que descarga un archivo CSV con todos los leads visibles

---

## 5. Acciones Comerciales

Al hacer clic en el botón de **maletín** en un lead, se abre el modal de acciones comerciales con 3 opciones:

### Opción 1: Llamada Telefónica

Registra los resultados de una llamada realizada al lead.

**Campos del formulario:**

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| **Estado Asesor** | Desplegable | Sí | Resultado de la llamada |
| **Notas de la Llamada** | Texto libre | No | Observaciones de la llamada |

**Opciones de Estado Asesor:**

| Estado | Significado |
|--------|-------------|
| No contesta | El lead no respondió la llamada |
| No interesado | El lead no muestra interés |
| Interesado | El lead mostró interés en el producto |
| Contactado | Se logró contactar al lead |
| Seguimiento | Se requiere seguimiento posterior |
| Venta cerrada | Se concretó la venta |

Haz clic en **"Guardar Llamada"** para registrar la acción.

### Opción 2: Agendar Llamada

Programa una llamada futura con el lead.

**Campos del formulario:**

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| **Fecha** | Selector de fecha | Sí | Día de la llamada |
| **Hora** | Selector de hora | Sí | Hora de la llamada |
| **Notas** | Texto libre | No | Notas adicionales |

Haz clic en **"Agendar"** para programar la llamada.

> La llamada agendada aparecerá automáticamente en tu **Calendario**.

### Opción 3: Cita

Agenda una reunión presencial o virtual con el lead.

**Campos del formulario:**

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| **Fecha** | Selector de fecha | Sí | Día de la cita |
| **Hora** | Selector de hora | Sí | Hora de la cita |
| **Notas** | Texto libre | No | Notas adicionales |

Haz clic en **"Agendar Cita"** para registrar la reunión.

> La cita se registra tanto en el **Calendario** como en las **Acciones Comerciales** del lead.

---

## 6. Detalle del Lead

Al hacer clic en el botón del **ojo** en un lead, se abre un modal con 4 pestañas:

### Pestaña: Información

Muestra los datos básicos del lead:

- **DNI** - Documento de identidad
- **Nombre** - Nombre completo
- **Teléfono** - Número de contacto
- **Estado** - Estado actual
- **Fecha de Asignación** - Cuándo fue asignado
- **Producto de Interés** - Producto que busca
- **Prioridad** - Nivel de prioridad

### Pestaña: Acciones Comerciales

Muestra el **historial cronológico** de todas las acciones comerciales realizadas sobre el lead:

Para cada acción se muestra:
- **Tipo de acción** (Llamada, Agendar llamada, Cita) con su icono correspondiente
- **Estado del asesor** después de la acción (badge de color)
- **Nombre del asesor** que realizó la acción y **fecha/hora**
- **Observaciones** registradas (si las hay)
- **Datos de la cita** (si aplica: fecha, hora, estado)

### Pestaña: Historial Estado

Muestra una **línea de tiempo** con todos los cambios de estado del lead:

Para cada cambio se muestra:
- **Estado anterior** → **Estado nuevo** (con flechas y badges de color)
- **Quién** realizó el cambio, **mediante qué acción** y **cuándo**
- **Observaciones** (si las hay)

### Pestaña: Historial Scoring

Muestra la **evolución del scoring** del lead a lo largo del tiempo:

Para cada registro se muestra:
- **Puntuación** actual (porcentaje)
- **Variación** respecto al registro anterior (sube/baja con indicador de color)
  - Verde con flecha arriba: Scoring subió
  - Rojo con flecha abajo: Scoring bajó
  - Gris: Sin cambio
- **Evento que lo causó** (etiqueta de color):
  - `respuesta_bot` (azul) - Respuesta del bot
  - `decaimiento` (rojo) - Decaimiento por tiempo
  - `nlp_update` (morado) - Actualización de NLP
  - `campana` (ámbar) - Efecto de campaña
  - `manual` (gris) - Cambio manual
  - `reciclaje` (cyan) - Reciclaje de lead
- **Sentimiento** detectado (Positivo/Neutral/Negativo)
- **Nivel de interés** y **contactabilidad** (porcentajes)
- **Barra visual** del scoring con color según el nivel

---

## 7. Registrar Prospecto

Esta acción **solo está disponible** cuando el lead tiene estado de asesor **"Venta cerrada"**.

El botón de persona con check se activa (color verde) únicamente en ese caso. Si el lead no tiene ese estado, el botón aparece deshabilitado (gris).

### Proceso de Registro (3 pasos)

**Paso 1 - Información:**
- Se muestran los datos del lead (Nombre, DNI, Teléfono)
- Mensaje: "Al registrar este lead como prospecto, se marcará como un cliente potencial calificado para seguimiento comercial"
- Botones: **"Cancelar"** | **"Registrar Prospecto"**

**Paso 2 - Confirmación:**
- Icono de advertencia amarillo
- Mensaje: "¿Estás seguro? Esta acción no se puede deshacer"
- Botones: **"Volver"** | **"Sí, registrar"**

**Paso 3 - Éxito:**
- Icono de check verde
- Mensaje: "[Nombre] ha sido registrado como prospecto exitosamente"
- Botón: **"Cerrar"**

> **Importante:** Esta acción es **irreversible**. El lead se registra como prospecto en el sistema externo NSV para seguimiento comercial.

---

## 8. Historial de Conversación

Al hacer clic en el botón de **mensaje** en un lead, se abre un modal que muestra el historial de mensajes.

### Qué se muestra

- **Mensajes del lead** (alineados a la izquierda, fondo gris)
- **Mensajes del sistema/bot** (alineados a la derecha, fondo azul)
- **Imágenes enviadas** (se pueden ver haciendo clic para abrir en tamaño completo)
- **Hora** de cada mensaje

> Este historial es de **solo lectura**. No se pueden enviar mensajes desde esta vista.

---

## 9. Tareas por Prioridad

Este módulo organiza tus leads asignados en **3 tarjetas por prioridad**.

### Vista Principal - Tarjetas de Prioridad

| Tarjeta | Color de Fondo | Criterio |
|---------|---------------|----------|
| **Alta Prioridad** | Verde claro | Scoring >= 70% |
| **Media Prioridad** | Amarillo claro | Scoring entre 40% y 69% |
| **Baja Prioridad** | Rojo claro | Scoring < 40% |

Cada tarjeta muestra:
- **Total** de leads en esa prioridad
- **Completados** (cantidad y porcentaje)

### Vista Detallada

Haz clic en una tarjeta para ver la tabla completa de leads de esa prioridad.

**Columnas de la tabla:**

| Columna | Descripción |
|---------|-------------|
| DNI | Documento de identidad |
| Nombre | Nombre completo |
| Teléfono | Número de contacto |
| Estado | Estado actual (badge de color) |
| Producto | Producto de interés |
| Asignada | Fecha de asignación |
| Acciones | Botones de acción (Maletín, Mensaje, Ojo) |

Desde esta tabla puedes realizar las mismas acciones que en el módulo de Leads:
- Registrar acciones comerciales
- Ver conversación
- Ver detalle del lead

Haz clic en **"← Atrás"** para volver a la vista de tarjetas.

---

## 10. Calendario de Citas

Gestiona todas tus citas y llamadas programadas.

### Vista del Calendario

- **Navegación por mes**: Usa las flechas **"←"** y **"→"** para cambiar de mes
- **Botón "Hoy"**: Regresa al mes actual
- Las citas se muestran como **etiquetas de color** en cada día:

| Tipo de Cita | Color |
|--------------|-------|
| Llamada telefónica | Azul |
| Reunión presencial | Azul oscuro |
| Videollamada | Morado |

- Las citas **canceladas** se muestran con opacidad reducida y texto tachado

### Panel de Próximas Citas

A la derecha del calendario se muestra el panel **"Próximas Citas"** con las siguientes citas programadas. Para cada una se muestra:

- **Título** de la cita
- **Nombre del lead/contacto**
- **Fecha y hora**
- **Ubicación** (si tiene)
- Botones de acción:
  - **"Editar"**: Modifica los datos de la cita
  - **"Cancelar"**: Cancela la cita (la marca como cancelada)
  - **"Reactivar"**: Reactiva una cita previamente cancelada

### Crear Nueva Cita

Haz clic en el botón **"Nueva Cita"** (con ícono +) para abrir el formulario:

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| **Título de la Cita** | Texto | Sí | Ej: "Seguimiento de propuesta" |
| **Lead / Contacto** | Texto | Sí | Nombre del cliente |
| **Fecha** | Selector de fecha | Sí | Día de la cita |
| **Hora** | Selector de hora | Sí | Hora de la cita |
| **Tipo de Cita** | Desplegable | No | Llamada Telefónica / Reunión Presencial / Videollamada |
| **Ubicación** | Texto | No | Lugar de la reunión |
| **Descripción** | Texto libre | No | Notas adicionales |

Botones: **"Cancelar"** | **"Programar Cita"**

Al editar una cita existente, el botón cambia a **"Actualizar Cita"**.

### Integración con Google Calendar

Puedes sincronizar tus citas con Google Calendar:

1. Haz clic en **"Conectar Google Calendar"**
2. Se abrirá una ventana de Google para autorizar el acceso
3. Una vez conectado, el botón cambiará a **"Google Calendar"** (verde) con opción de desconectar
4. Las citas se sincronizarán automáticamente con tu Google Calendar

Para desconectar, haz clic en el ícono de desenlazar junto al botón verde.

---

## Flujo de Trabajo Típico del Asesor

```
1. Iniciar sesión
       ↓
2. Revisar "Mi Actividad" (dashboard con funnel)
       ↓
3. Ir a "Leads" → Ver leads asignados
       ↓
4. Seleccionar un lead → Realizar acción:
   ├── Llamada telefónica → Registrar resultado
   ├── Agendar llamada → Programar para después
   └── Cita → Agendar reunión
       ↓
5. Dar seguimiento según resultado:
   ├── No contesta → Reintentar después
   ├── Interesado → Agendar cita
   ├── Seguimiento → Programar nueva llamada
   └── Venta cerrada → Registrar como prospecto
       ↓
6. Revisar "Tareas" → Priorizar leads por scoring
       ↓
7. Consultar "Calendario" → Gestionar citas del día
```

---

## Resumen de Permisos del Asesor

| Acción | Permitido |
|--------|-----------|
| Ver leads asignados | Sí |
| Registrar llamadas | Sí |
| Agendar llamadas | Sí |
| Programar citas | Sí |
| Ver historial de conversación | Sí |
| Ver detalle y scoring del lead | Sí |
| Registrar prospecto (venta cerrada) | Sí |
| Exportar datos de leads | Sí |
| Conectar Google Calendar | Sí |
| Ver leads de otros asesores | No |
| Gestionar campañas | No |
| Gestionar plantillas | No |
| Administrar usuarios | No |
| Configurar enrutamiento | No |
| Ver métricas de costo bot | No |

---

*Manual generado para CRM maqui+ - Versión Asesor*
