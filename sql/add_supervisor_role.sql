-- 1. Agregar campo id_supervisor a crm_usuarios (referencia a si mismo)
ALTER TABLE crm_usuarios ADD COLUMN id_supervisor UUID REFERENCES crm_usuarios(id_usuario);

-- 2. Indice para buscar supervisados eficientemente
CREATE INDEX idx_usuarios_supervisor ON crm_usuarios (id_supervisor) WHERE id_supervisor IS NOT NULL;

-- 3. Actualizar CHECK constraint de rol para incluir 'Supervisor'
-- Primero ver el nombre del constraint actual:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'crm_usuarios'::regclass AND contype = 'c';
-- Luego reemplazar (ajusta 'crm_usuarios_rol_check' al nombre real):
ALTER TABLE crm_usuarios DROP CONSTRAINT IF EXISTS crm_usuarios_rol_check;
ALTER TABLE crm_usuarios ADD CONSTRAINT crm_usuarios_rol_check
  CHECK (rol IN ('Admin', 'Asesor', 'Call Center', 'Supervisor'));

-- 4. Agregar campo notificado_asesor a matching (del feature anterior)
ALTER TABLE matching ADD COLUMN IF NOT EXISTS notificado_asesor BOOLEAN NOT NULL DEFAULT false;

-- 5. Indice parcial para cron de notificaciones
CREATE INDEX IF NOT EXISTS idx_matching_pendiente_notif
  ON matching (notificado_asesor)
  WHERE asignado = true AND notificado_asesor = false;
