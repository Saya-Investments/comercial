# Tablas CRM agregadas al esquema `comercial`

Este documento describe las 7 tablas nuevas que se crearon para soportar las funcionalidades del CRM comercial. Estas tablas complementan las tablas existentes del sistema de bot (`bd_leads`, `bd_asesores`, `matching`, `hist_asignaciones`, `hist_clientes`, `hist_conversaciones`, `hist_scoring`, `config_modelo`).

---

## 1. `crm_usuarios`

**Propósito:** Gestionar los usuarios que acceden al CRM (login, roles, permisos).

**Por qué se necesita:** Las tablas originales del bot no tienen concepto de "usuario del sistema". Los asesores existen en `bd_asesores` pero no tienen credenciales de acceso ni roles administrativos. Esta tabla permite autenticación, control de acceso por rol (Admin, Manager, Agente) y vinculación opcional con un asesor.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id_usuario` | UUID (PK) | Identificador único |
| `username` | VARCHAR(50) UNIQUE | Nombre de usuario para login |
| `nombre` | VARCHAR(100) | Nombre completo |
| `email` | VARCHAR(150) UNIQUE | Correo electrónico |
| `password_hash` | VARCHAR(255) | Contraseña hasheada |
| `rol` | VARCHAR(20) | Rol: 'Admin', 'Manager', 'Agente' |
| `activo` | BOOLEAN | Si el usuario está habilitado |
| `id_asesor` | UUID (FK) | Vinculación opcional con `bd_asesores` |
| `fecha_ingreso` | DATE | Fecha de ingreso al sistema |
| `ultimo_login` | TIMESTAMPTZ | Último acceso registrado |

**Relaciones:**
- `id_asesor` -> `bd_asesores.id_asesor` (un usuario puede estar vinculado a un asesor)

---

## 2. `crm_tareas`

**Propósito:** Asignar y dar seguimiento a tareas comerciales sobre leads específicos.

**Por qué se necesita:** El sistema de bot gestiona leads y asignaciones automáticas, pero no existe un mecanismo para que los usuarios del CRM creen tareas manuales (ej: "llamar al lead X mañana", "enviar propuesta"). Esta tabla permite gestionar el flujo de trabajo diario de los asesores, con prioridades y estados.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id_tarea` | UUID (PK) | Identificador único |
| `id_lead` | UUID (FK) | Lead asociado a la tarea |
| `id_usuario_asignado` | UUID (FK) | Usuario responsable |
| `titulo` | VARCHAR(200) | Título descriptivo |
| `descripcion` | TEXT | Detalle de la tarea |
| `prioridad` | VARCHAR(10) | 'Alta', 'Media', 'Baja' |
| `estado` | VARCHAR(20) | 'pendiente', 'en_progreso', 'completada', 'cancelada' |
| `fecha_vencimiento` | DATE | Fecha límite |
| `fecha_completada` | TIMESTAMPTZ | Cuándo se completó |

**Relaciones:**
- `id_lead` -> `bd_leads.id_lead` (ON DELETE CASCADE)
- `id_usuario_asignado` -> `crm_usuarios.id_usuario` (ON DELETE CASCADE)

---

## 3. `crm_campanas`

**Propósito:** Definir y gestionar campañas comerciales masivas.

**Por qué se necesita:** El bot tiene el campo `id_ultima_campana` en `bd_leads`, pero no existe una tabla que defina qué es una campaña, su estado, filtros aplicados, ni qué plantilla usa. Esta tabla permite crear, pausar y completar campañas, asociarlas a bases de datos de leads y medir resultados.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id_campana` | UUID (PK) | Identificador único |
| `nombre` | VARCHAR(200) | Nombre de la campaña |
| `base_datos` | VARCHAR(100) | Fuente de datos de leads |
| `filtros` | TEXT | Filtros aplicados (JSON o texto) |
| `plantilla` | VARCHAR(100) | Plantilla de mensaje asociada |
| `cluster` | VARCHAR(50) | Cluster/segmento objetivo |
| `estado` | VARCHAR(20) | 'Activa', 'Pausada', 'Completada' |
| `total_leads` | INT | Cantidad de leads en la campaña |
| `id_usuario_creador` | UUID (FK) | Quién creó la campaña |
| `fecha_inicio` | DATE | Inicio programado |
| `fecha_fin` | DATE | Fin programado |

**Relaciones:**
- `id_usuario_creador` -> `crm_usuarios.id_usuario`

---

## 4. `crm_campana_leads`

**Propósito:** Tabla intermedia (many-to-many) entre campañas y leads.

**Por qué se necesita:** Cada campaña puede incluir múltiples leads, y un lead puede estar en múltiples campañas. Esta tabla registra qué leads fueron incluidos en cada campaña y el estado de envío individual (pendiente, enviado, entregado, leído, respondido), permitiendo medir la efectividad de cada campaña a nivel de lead.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID (PK) | Identificador único |
| `id_campana` | UUID (FK) | Campaña asociada |
| `id_lead` | UUID (FK) | Lead incluido |
| `estado_envio` | VARCHAR(20) | 'pendiente', 'enviado', 'fallido' |
| `fecha_envio` | TIMESTAMPTZ | Cuándo se envió |
| `entregado` | BOOLEAN | Si fue entregado |
| `leido` | BOOLEAN | Si fue leído |
| `respondio` | BOOLEAN | Si respondió |

**Relaciones:**
- `id_campana` -> `crm_campanas.id_campana` (ON DELETE CASCADE)
- `id_lead` -> `bd_leads.id_lead` (ON DELETE CASCADE)
- Constraint UNIQUE en (`id_campana`, `id_lead`) para evitar duplicados

---

## 5. `crm_plantillas`

**Propósito:** Almacenar plantillas de mensajes reutilizables para campañas.

**Por qué se necesita:** Las campañas necesitan plantillas predefinidas para envío de mensajes (email, SMS, WhatsApp). Sin esta tabla, los mensajes se escribirían desde cero cada vez. Permite estandarizar la comunicación y usar variables como `{nombre}`, `{producto}`, etc.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id_plantilla` | UUID (PK) | Identificador único |
| `nombre` | VARCHAR(200) | Nombre identificador |
| `asunto` | VARCHAR(300) | Asunto (para emails) |
| `contenido` | TEXT | Cuerpo del mensaje con variables |
| `tipo` | VARCHAR(20) | 'email', 'sms', 'whatsapp' |
| `id_usuario_creador` | UUID (FK) | Quién la creó |

**Relaciones:**
- `id_usuario_creador` -> `crm_usuarios.id_usuario`

---

## 6. `crm_citas`

**Propósito:** Agendar y gestionar citas/reuniones con leads.

**Por qué se necesita:** El flujo comercial requiere agendar llamadas, reuniones presenciales y videollamadas con los leads. No existía ninguna tabla en el esquema original para manejar agenda o calendario. Esta tabla permite crear citas vinculadas a leads, con fecha, hora, ubicación y estado (activa/cancelada).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id_cita` | UUID (PK) | Identificador único |
| `titulo` | VARCHAR(200) | Descripción breve de la cita |
| `id_lead` | UUID (FK) | Lead asociado (opcional) |
| `nombre_lead` | VARCHAR(200) | Nombre para display |
| `id_usuario` | UUID (FK) | Usuario/asesor responsable |
| `fecha` | DATE | Fecha de la cita |
| `hora` | TIME | Hora de la cita |
| `ubicacion` | VARCHAR(200) | Lugar o link de videollamada |
| `descripcion` | TEXT | Notas adicionales |
| `tipo` | VARCHAR(20) | 'llamada', 'reunion', 'video' |
| `estado` | VARCHAR(20) | 'active', 'cancelled' |

**Relaciones:**
- `id_lead` -> `bd_leads.id_lead`
- `id_usuario` -> `crm_usuarios.id_usuario` (ON DELETE CASCADE)

---

## 7. `crm_notas`

**Propósito:** Registrar notas y observaciones sobre leads.

**Por qué se necesita:** Los asesores necesitan documentar interacciones, observaciones y seguimiento sobre cada lead. `hist_conversaciones` registra mensajes del bot, pero no notas manuales del asesor. Esta tabla permite que los usuarios del CRM agreguen notas libres, comentarios o recordatorios vinculados a cada lead.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id_nota` | UUID (PK) | Identificador único |
| `id_lead` | UUID (FK) | Lead asociado |
| `id_usuario` | UUID (FK) | Usuario que escribió la nota |
| `contenido` | TEXT | Texto de la nota |
| `tipo` | VARCHAR(30) | 'nota', 'seguimiento', 'alerta' |

**Relaciones:**
- `id_lead` -> `bd_leads.id_lead` (ON DELETE CASCADE)
- `id_usuario` -> `crm_usuarios.id_usuario` (ON DELETE CASCADE)

---

## Resumen de relaciones

```
bd_leads (existente)
  ├── crm_tareas (nueva)
  ├── crm_campana_leads (nueva)
  ├── crm_citas (nueva)
  └── crm_notas (nueva)

bd_asesores (existente)
  └── crm_usuarios (nueva, vinculación opcional)

crm_usuarios (nueva)
  ├── crm_tareas (asignación)
  ├── crm_campanas (creador)
  ├── crm_plantillas (creador)
  ├── crm_citas (responsable)
  └── crm_notas (autor)

crm_campanas (nueva)
  └── crm_campana_leads (nueva, tabla intermedia)
```

Todas las tablas nuevas tienen prefijo `crm_` para diferenciarlas de las tablas del bot (`bd_`, `hist_`, `config_`, `matching`).
o