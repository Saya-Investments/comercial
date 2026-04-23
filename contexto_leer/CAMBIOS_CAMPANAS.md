# Cambios Realizados en Campañas

## Resumen

Se realizaron varios ajustes en el flujo de creación de campañas para que:

- el filtro principal venga desde la columna `Bucket` de BigQuery
- desaparezcan los filtros antiguos de `Sede` y `SubOrigen`
- la vista previa de leads muestre las columnas correctas
- los leads nuevos se creen correctamente en `bd_leads`
- se cree la relación de cada lead con la campaña en `crm_campana_leads`
- el proceso sea más rápido y seguro
- si ocurre un error, no se guarde nada a medias

---

## 1. Filtros de campaña

Antes, el flujo consideraba filtros como `Sede` y `SubOrigen`.

Ahora:

- el filtro activo para creación de campaña es `Bucket`
- `Sede` fue retirado del formulario de campaña
- `SubOrigen` fue retirado del formulario de campaña
- el detalle de campaña también refleja este nuevo enfoque

### Archivos involucrados

- `components/modules/modals/campaign-modal.tsx`
- `app/api/bigquery/route.ts`
- `lib/bigquery.ts`
- `components/modules/campaign-detail-view.tsx`

---

## 2. Vista previa de leads al crear campaña

Se ajustó la tabla de vista previa para que ya no limite artificialmente la cantidad de leads traídos desde BigQuery.

### Columnas visibles en la vista previa

Las columnas configuradas para mostrarse son:

- `Nombres`
- `Apellidos`
- `telefono_normalizado`
- `Email`
- `Linea`
- `Bucket`

### Cambios aplicados

- se quitó el límite artificial del preview
- se dejó fija la tabla con las columnas esperadas
- se agregó `Linea`
- se mantiene el filtrado por `Bucket`

### Archivos involucrados

- `components/modules/modals/campaign-modal.tsx`
- `app/api/bigquery/route.ts`

---

## 3. Guardado de leads nuevos en `bd_leads`

Cuando se crea una campaña, el sistema consulta los leads desde BigQuery y revisa si el lead ya existe por número de teléfono.

### Si el lead no existe

Se crea en `bd_leads`.

### Si el lead ya existe

Se reutiliza y solo se completan campos vacíos con la información que viene desde BigQuery.

### Mapeo de columnas BigQuery -> base local

- `Nombres` o `nombres` -> `bd_leads.nombre`
- `Apellidos` o `apellidos` -> `bd_leads.apellido`
- `telefono_normalizado` / `telefono` -> `bd_leads.numero`
- `Email` / `email_normalizado` -> `bd_leads.correo`
- `Linea` / `linea` -> `bd_leads.linea`
- `Bucket` / `bucket` -> columna `"Bucket"` de `bd_leads`
- `Base` no viene de BigQuery para este flujo nuevo: se setea como `Stock` en leads nuevos creados desde campaña
- `zona` se guarda por defecto como `LIMA`

### Importante

Se corrigió el problema por el cual a veces no se guardaban `nombre` y `apellido`.

Ahora el mapeo es tolerante a mayúsculas y minúsculas, por ejemplo:

- `Nombres`
- `nombres`
- `Apellidos`
- `apellidos`

---

## 4. Nuevas columnas en `bd_leads`

Se agregaron dos columnas en la tabla `comercial.bd_leads`:

- `"Bucket"`
- `"Base"`

### Comportamiento definido

- leads existentes antes de este cambio: `"Base" = 'Caliente'`
- leads nuevos creados desde campañas: `"Base" = 'Stock'`
- `Bucket` se guarda desde BigQuery si viene informado

### Archivos involucrados

- `prisma/schema.prisma`
- `prisma/add_bd_leads_bucket_base.sql`

---

## 5. Tabla de leads: uso de la columna `Base`

La tabla de leads del CRM dejó de calcular `Base` en función del tiempo o de `fecha_creacion`.

Ahora:

- la columna `Base` se lee directamente desde la base de datos
- lo mostrado en la tabla corresponde al valor real guardado en `bd_leads`

### Archivos involucrados

- `app/api/leads/route.ts`
- `components/modules/leads-table.tsx`

---

## 6. Relación campaña-lead en `crm_campana_leads`

Sí se guarda la relación entre campaña y lead.

Por cada lead válido asociado a la campaña, se inserta un registro en `crm_campana_leads` con:

- `id_campana`
- `id_lead`
- `estado_envio = 'pendiente'`

### Validación adicional agregada

Para evitar campañas incompletas:

- si se esperaban relaciones pero no se pudo preparar ninguna, el proceso falla
- si se intentó insertar en `crm_campana_leads` pero no se insertó ninguna fila, el proceso falla

Esto evita que quede una campaña creada pero sin leads relacionados.

---

## 7. Optimización de la creación de campaña

El proceso original era muy lento porque trabajaba lead por lead:

- buscaba el lead uno por uno
- creaba uno por uno
- actualizaba uno por uno
- relacionaba uno por uno

### Optimización implementada

Ahora el flujo trabaja por lotes:

- deduplica primero por teléfono
- consulta los leads existentes en bloque
- crea leads nuevos en bloque
- actualiza leads existentes en grupos pequeños
- crea las relaciones en `crm_campana_leads` en bloque

### Beneficio

Esto reduce significativamente el tiempo de creación de campañas con muchas filas.

### Archivo principal involucrado

- `app/api/campaigns/route.ts`

---

## 8. Manejo transaccional: todo o nada

Se cambió el comportamiento para que la creación de campaña sea atómica.

Eso significa:

- si falla cualquier paso, no se crea la campaña
- no se dejan leads creados a medias
- no se dejan relaciones a medias en `crm_campana_leads`

### Flujo actual

1. Se valida la tabla seleccionada.
2. Se obtienen los leads desde BigQuery.
3. Recién después se abre una transacción.
4. Dentro de la transacción se hace todo:
   - creación de campaña
   - inserción de leads nuevos
   - actualización de leads existentes
   - guardado de `Bucket` y `Base`
   - inserción en `crm_campana_leads`
   - actualización de `total_leads`
5. Si algo falla, se hace rollback completo.

### Resultado

No debe quedar ninguna campaña parcialmente creada.

---

## 9. Ajuste por timeout de transacción

Durante las pruebas apareció un error de expiración de transacción de Prisma (`P2028`), porque el tiempo por defecto era muy corto para campañas grandes.

Se ajustó la transacción para permitir más tiempo:

- `maxWait: 10000`
- `timeout: 120000`

Con eso el proceso tiene más margen para completar operaciones grandes sin expirar antes.

---

## 10. Archivos principales modificados

- `app/api/campaigns/route.ts`
- `app/api/bigquery/route.ts`
- `app/api/leads/route.ts`
- `lib/bigquery.ts`
- `prisma/schema.prisma`
- `prisma/add_bd_leads_bucket_base.sql`
- `components/modules/modals/campaign-modal.tsx`
- `components/modules/campaign-detail-view.tsx`
- `components/modules/leads-table.tsx`

---

## 11. Estado funcional esperado

Con estos cambios, al crear una campaña debería ocurrir lo siguiente:

1. Se filtran los leads por `Bucket`.
2. Se muestran correctamente en el preview.
3. Se crea la campaña solo si todo el proceso sale bien.
4. Los leads nuevos se insertan en `bd_leads` con:
   - nombre
   - apellido
   - número
   - correo
   - línea
   - bucket
   - base = `Stock`
   - zona = `LIMA`
5. Los leads existentes se reutilizan y se completan si tienen campos vacíos.
6. Se crea la relación en `crm_campana_leads`.
7. Se actualiza `total_leads` en `crm_campanas`.
8. Si algo falla, se revierte todo.
