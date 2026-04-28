import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

async function main() {
  const email = requireEnv('BOOTSTRAP_SUPERADMIN_EMAIL').toLowerCase();
  const password = requireEnv('BOOTSTRAP_SUPERADMIN_PASSWORD');
  const name = process.env.BOOTSTRAP_SUPERADMIN_NAME?.trim() || 'Super Admin';
  const forceReset = process.env.BOOTSTRAP_SUPERADMIN_FORCE_RESET === 'true';

  if (password.length < 10) {
    throw new Error('BOOTSTRAP_SUPERADMIN_PASSWORD debe tener al menos 10 caracteres.');
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
    },
  });

  const hashedPassword = await bcrypt.hash(password, 12);

  if (!existingUser) {
    const created = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        active: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    console.log('SUPER_ADMIN creado.');
    console.log(JSON.stringify(created, null, 2));
    return;
  }

  if (existingUser.role !== 'SUPER_ADMIN') {
    throw new Error(
      `Ya existe un usuario con email ${email}, pero su rol es ${existingUser.role}. No se modificó nada.`,
    );
  }

  if (!forceReset) {
    console.log('Ya existe un SUPER_ADMIN con ese correo. No se modificó nada.');
    console.log(
      'Si quieres actualizar nombre/contraseña, vuelve a correr con BOOTSTRAP_SUPERADMIN_FORCE_RESET=true.',
    );
    console.log(JSON.stringify(existingUser, null, 2));
    return;
  }

  const updated = await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      name,
      password: hashedPassword,
      active: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
    },
  });

  console.log('SUPER_ADMIN actualizado.');
  console.log(JSON.stringify(updated, null, 2));
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
