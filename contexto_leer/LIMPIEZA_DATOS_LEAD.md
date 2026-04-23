# Limpieza de datos de un lead para pruebas

Procedimiento para borrar todos los datos de un lead y poder probar desde cero.

## 1. Obtener el id_lead

```sql
SET search_path TO comercial;
SELECT id_lead, numero FROM bd_leads WHERE numero = '+51XXXXXXXXX';
```

## 2. Borrar datos en PostgreSQL

Orden importante: primero tablas con FK, luego bd_leads.

```sql
SET search_path TO comercial;
DELETE FROM hist_conversaciones WHERE id_lead = '<id_lead>';
DELETE FROM hist_scoring WHERE id_lead = '<id_lead>';
DELETE FROM hist_asignaciones WHERE id_lead = '<id_lead>';
DELETE FROM matching WHERE id_lead = '<id_lead>';
DELETE FROM bd_leads WHERE id_lead = '<id_lead>';
```

## 3. Borrar checkpointer (LangGraph)

El thread_id del checkpointer tiene formato `com-+51XXXXXXXXX`.

IMPORTANTE: Las tablas del checkpointer estan en el schema `public`, no en `comercial`.

```sql
DELETE FROM public.checkpoints WHERE thread_id = 'com-+51XXXXXXXXX';
DELETE FROM public.checkpoint_writes WHERE thread_id = 'com-+51XXXXXXXXX';
DELETE FROM public.checkpoint_blobs WHERE thread_id = 'com-+51XXXXXXXXX';
```

## 4. Borrar datos en Firestore

Dos colecciones a limpiar:

- `routing_queue`: documentos donde `celular == '51XXXXXXXXX'` (sin +)
- `conversaciones`: documentos donde `celular == '51XXXXXXXXX'` (sin +)

```python
from google.cloud import firestore
db = firestore.Client()

# routing_queue
docs = db.collection('routing_queue').where('celular', '==', '51XXXXXXXXX').stream()
for d in docs:
    d.reference.delete()

# conversaciones
docs = db.collection('conversaciones').where('celular', '==', '51XXXXXXXXX').stream()
for d in docs:
    d.reference.delete()
```

## Notas

- El numero en bd_leads tiene formato `+51XXXXXXXXX` (con +51)
- El celular en Firestore tiene formato `51XXXXXXXXX` (sin +)
- El thread_id del checkpointer tiene formato `com-+51XXXXXXXXX` (con +51)
- Si no se borran las tablas con FK antes de bd_leads, PostgreSQL dara error de violacion de FK
- Para el usuario Daniel Castillo: numero es `+51941729891`
