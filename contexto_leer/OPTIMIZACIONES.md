# Optimizaciones del CRM

Registro de cambios que mejoran performance del CRM (no son bug fixes de logica de negocio).

---

## 2026-04-20 — Cliente Prisma singleton en production

### Contexto

El archivo `lib/prisma.ts` solo cacheaba el `PrismaClient` en `globalThis` cuando `NODE_ENV !== 'production'`. El motivo original del guard es evitar fugas por Hot Module Reload de Next.js en desarrollo local — patron copy-paste del tutorial oficial de Prisma, pensado para Next.js corriendo como servidor de larga duracion.

El problema: ese archivo tambien expone `prisma` a traves de un `Proxy` con lazy init que ejecuta `getPrismaClient()` en **cada acceso** a cualquier propiedad. Con el guard activo, en production `getPrismaClient()` no cacheaba → cada `prisma.X.Y()` creaba un `PrismaClient` nuevo con su propio `pg.Pool`.

### Impacto del bug

En serverless de Vercel, cada request abria pools de conexiones nuevos en lugar de reusarlos. Invisible para queries simples (cada request crea un cliente, consulta, responde y muere), pero **rompia las transacciones interactivas** con:

```
Transaction not found. Transaction ID is invalid, refers to an old
closed transaction Prisma doesn't have information about anymore
```

Se descubrio recien al arrancar el cron de reasignaciones, que es el primer codepath del CRM que usa `prisma.$transaction(async (tx) => {...})`.

### Fix

Quitar el guard. Cachear siempre en `globalThis`:

```ts
// ANTES
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = client
}

// DESPUES
globalForPrisma.prisma = client
```

En Vercel serverless cada lambda tiene su propio `globalThis`, asi que cachear en production es seguro (no hay leak cross-request, y dentro de un mismo worker se reusa el cliente).

### Impacto observado

- **Reasignaciones funcionan**: transacciones ya no se rompen.
- **Performance general mejora**: el usuario percibe la UI del CRM mas rapida porque cada request reusa el pool de conexiones en vez de abrir uno nuevo. Latencia de cold-to-warm request mas baja.

### Commit

`d927d03` — "fix: cachear cliente Prisma en production"

### Recomendacion pendiente

El `Proxy` con lazy init es innecesariamente complejo. Una alternativa mas limpia seria exportar directo:

```ts
export const prisma = getPrismaClient()
```

Cambio minimo, mismo resultado, menos magia. No bloqueante, pero vale considerarlo en una futura limpieza de `lib/prisma.ts`.
