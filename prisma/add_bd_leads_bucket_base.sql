ALTER TABLE comercial.bd_leads
  ADD COLUMN IF NOT EXISTS "Bucket" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "Base" VARCHAR(20) DEFAULT 'Caliente';

UPDATE comercial.bd_leads
SET "Base" = 'Caliente'
WHERE "Base" IS NULL;
