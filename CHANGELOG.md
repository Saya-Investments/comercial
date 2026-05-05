# Changelog

Cambios relevantes del CRM publicados en cada deploy.
La entrada mas reciente va arriba.

## 2026-05-05

- Vista **Asesores** → embudo de gestion: la metrica **Ventas cerradas** ahora usa el cruce con los Excels del back-office (mismo dato que la pestaña "Funnel de prospectos"). Antes contaba leads con estado `Venta_cerrada` o `Prospecto` en `crm_acciones_comerciales` — esa metrica refleja lo que el asesor marca en el CRM, pero no garantiza que el lead haya llegado al sistema oficial. El cruce con back-office es el dato mas fiel al cierre real.
- Vista **Asesores** → embudo de gestion: el ultimo paso del embudo (y la card del stats row) pasa a llamarse **Prospectos** en lugar de **Venta Cerrada**, ya que el dato proviene del cruce con back-office (estados como Contactado, Con proforma, Inscrito, etc.) y no solo de cierres confirmados.

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
