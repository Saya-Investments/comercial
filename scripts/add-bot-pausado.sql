-- Agregar campos bot_pausado y bot_pausado_hasta a bd_leads
-- Correr una sola vez contra la BD de producción

ALTER TABLE comercial.bd_leads
  ADD COLUMN IF NOT EXISTS bot_pausado       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bot_pausado_hasta TIMESTAMPTZ NULL;
