# Changelog

Cambios relevantes del CRM publicados en cada deploy.
La entrada mas reciente va arriba.

## 2026-04-28

- Pestaña **Leads** del asesor: ya no aparecen los leads que estan actualmente en Call Center. Vuelven automaticamente cuando el CC los libera (timeout 12h o derivacion manual).
- Pestaña **Leads**: el indicador "gestionado" ahora se calcula por actor — un asesor solo ve gestionados aquellos en los que el mismo registro accion. Antes contaban tambien las acciones del CC, lo que generaba falsos positivos.
- Cron `derivacion-cc`: el motivo de derivacion en `hist_cc_derivaciones` ahora refleja el `HORAS_TIMEOUT` actual del cron en vez del literal `'timeout_4h'` quedado del valor previo.
- Pestaña **Versión** (esta) agregada al menu admin para verificar que el deploy actual incluye los ultimos cambios sin necesidad de revisar Vercel.
