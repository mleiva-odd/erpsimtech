-- Fase 31b · Password reset token (forgot/reset password flow).
--
-- Tabla para almacenar tokens de reseteo de contraseña. Cada solicitud
-- de "olvidé mi contraseña" genera un token aleatorio (32 bytes), del
-- que persistimos SOLO el hash (sha256). El token plano viaja en el link
-- del email y nunca se guarda — patrón estándar de OWASP.
--
-- Garantías:
--   - Single-use: una vez consumido (usedAt seteado), no se puede reusar.
--   - Expiración corta (30 minutos típico) — controlada por expiresAt.
--   - Auditoría: requestedIp queda para investigar abuso.
--   - Cascada con User: si se elimina el usuario, sus tokens también.
--
-- Aditiva e idempotente. No toca filas existentes.

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id"          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"      TEXT         NOT NULL,
  "tokenHash"   TEXT         NOT NULL,
  "requestedIp" TEXT,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "usedAt"      TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PasswordResetToken_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Índice para invalidar tokens previos del mismo usuario rápidamente
-- (cuando emite uno nuevo, se marcan los anteriores como usados).
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_createdAt_idx"
  ON "PasswordResetToken" ("userId", "createdAt" DESC);

-- Índice para limpieza periódica de tokens expirados.
CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx"
  ON "PasswordResetToken" ("expiresAt");
