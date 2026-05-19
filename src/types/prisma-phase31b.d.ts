/**
 * Fase 31b · Shim de tipos para PasswordResetToken (forgot/reset password).
 *
 * El sandbox no puede correr `prisma generate`; cuando el dueño lo regenere
 * los tipos reales sobrescriben este shim. Sigue el patrón de
 * prisma-phase19.d.ts / prisma-phase20.d.ts.
 *
 * Borrable cuando se haga cleanup de shims (post Fase 25).
 */

import '@prisma/client';

declare module '@prisma/client' {
  interface PrismaClient {
    passwordResetToken: PasswordResetTokenDelegate;
  }

  namespace Prisma {
    interface TransactionClient {
      passwordResetToken: PasswordResetTokenDelegate;
    }
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface PasswordResetTokenDelegate {
  findFirst(args?: any): Promise<any>;
  findMany(args?: any): Promise<any[]>;
  findUnique(args?: any): Promise<any>;
  findUniqueOrThrow(args?: any): Promise<any>;
  create(args: any): Promise<any>;
  createMany(args: any): Promise<any>;
  update(args: any): Promise<any>;
  updateMany(args: any): Promise<any>;
  upsert(args: any): Promise<any>;
  delete(args: any): Promise<any>;
  deleteMany(args?: any): Promise<any>;
  count(args?: any): Promise<number>;
}
