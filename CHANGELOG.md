# Changelog

Cambios relevantes del CRM publicados en cada deploy.
La entrada mas reciente va arriba.

## 2026-05-13

- Vista **Asesores** → ahora **Asignados** (funnel del bot) y **Enrutados** (funnel de gestion) usan exactamente el mismo SQL y devuelven el mismo numero. Antes daban cifras distintas (821 vs 770) porque cada una usaba una definicion incompleta del mismo hito: Asignados leia `estado_de_lead='asignado'` (pierde a los que despues fueron descartados por el bot tras seguir conversando post-enrutamiento) y Enrutados filtraba por asesor activo (pierde a los asignados a Karol/Vela/Reategui). Ahora ambos cuentan el hito historico — `hist_asignaciones.reasignado=false` dentro del universo del bot — y dan 832. Nota visual: un lead que fue enrutado y despues descartado por el bot puede aparecer en Asignados y Descartados a la vez; refleja la realidad (paso por las dos etapas).

## 2026-05-05

- Vista **Asesores** → embudo de gestion: la metrica **Ventas cerradas** ahora usa el cruce con los Excels del back-office (mismo dato que la pestaña "Funnel de prospectos"). Antes contaba leads con estado `Venta_cerrada` o `Prospecto` en `crm_acciones_comerciales` — esa metrica refleja lo que el asesor marca en el CRM, pero no garantiza que el lead haya llegado al sistema oficial. El cruce con back-office es el dato mas fiel al cierre real.
- Vista **Asesores** → embudo de gestion: el ultimo paso del embudo (y la card del stats row) pasa a llamarse **Prospectos** en lugar de **Venta Cerrada**, ya que el dato proviene del cruce con back-office (estados como Contactado, Con proforma, Inscrito, etc.) y no solo de cierres confirmados.
- Vista **Asesores** → embudo de gestion: la metrica **Enrutados** ahora cuenta leads que *alguna vez* fueron asignados a un asesor activo (antes solo contaba los con `matching.asignado = true` actual). Sin este cambio, leads que el asesor gestiono y luego descarto bajaban el conteo de Enrutados pero seguian sumando en Gestionados, rompiendo la monotonia del embudo.

## 2026-05-04

- Cron `reasignaciones`: ahora ordena candidatos por **progreso de cuota ASC** (con desempate por posicion del ranking), igual que el routing inicial. Antes tomaba al primero del ranking con cupo, lo que generaba desbalance (todas las reasignaciones de 24h sin gestion caian al mismo asesor mientras los demas estaban en 0%). Con el fix, los leads reasignados se distribuyen al asesor de menor carga.

## 2026-04-29

- Vista **Asesores** → distribucion por estado (pie chart): se fusionan **Venta cerrada** y **Prospecto** en una sola tajada "Prospecto". Un Prospecto registrado en NSV ya es un cierre comercial, asi que mostrar las dos categorias por separado dividia el conteo de cierres reales.
- Vista **Asesores** → embudo de gestion: la metrica **Ventas cerradas** ahora cuenta tanto los leads en estado `Venta_cerrada` como los `Prospecto`. Refleja el total real de cierres comerciales del piloto.

## 2026-04-28

- Pestaña **Leads** del asesor: ya no aparecen los leads que estan actualmente en Call Center. Vuelven automaticamente cuando el CC los libera (timeout 12h o derivacion manual).
- Pestaña **Leads**: el indicador "gestionado" ahora se calcula por actor — un asesor solo ve gestionados aquellos en los que el mismo registro accion. Antes contaban tambien las acciones del CC, lo que generaba falsos positivos.
- Cron `derivacion-cc`: el motivo de derivacion en `hist_cc_derivaciones` ahora refleja el `HORAS_TIMEOUT` actual del cron en vez del literal `'timeout_4h'` quedado del valor previo.
- Pestaña **Versión** (esta) agregada al menu admin para verificar que el deploy actual incluye los ultimos cambios sin necesidad de revisar Vercel. Muestra hash del commit, hora del deploy en zona Lima y el changelog.
