-- Fase 51 · User.lastLoginAt
--
-- Campo opcional para registrar el último login exitoso del usuario.
-- Permite a Marvin (SUPER_ADMIN) identificar usuarios durmientes y
-- empresas que crearon cuenta pero no la usan.
--
-- Se setea desde NextAuth authorize() cuando el login es exitoso.
-- NO bloquea el login si la escritura falla.
--
-- Aditiva, idempotente. No toca datos existentes.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

-- Índice para queries de "usuarios sin actividad reciente". Parcial
-- (solo where lastLoginAt is not null) para no inflar el índice con
-- los muchos registros que aún no han loggeado.
CREATE INDEX IF NOT EXISTS "User_lastLoginAt_idx"
  ON "User" ("lastLoginAt" DESC)
  WHERE "lastLoginAt" IS NOT NULL;
