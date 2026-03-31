const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const superAdmins = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN' }
  });

  if (superAdmins.length > 0) {
    console.log("=== SUPER ADMIN EXISTENTE ===");
    console.log("Email:", superAdmins[0].email);
    console.log("Nota: La contraseña está encriptada, la forzaremos a 'admin123' para que puedas entrar.");
    
    const hash = await bcrypt.hash('admin123', 10);
    await prisma.user.update({
      where: { id: superAdmins[0].id },
      data: { password: hash }
    });
    
    console.log("¡Contraseña restablecida a admin123!");
  } else {
    // Buscar si hay algún ADMIN
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' }
    });
    
    if (admins.length > 0) {
      console.log("=== ADMIN EXISTENTE ===");
      console.log("Email:", admins[0].email);
      const hash = await bcrypt.hash('admin123', 10);
      await prisma.user.update({
        where: { id: admins[0].id },
        data: { password: hash }
      });
      console.log("¡Contraseña restablecida a admin123!");
    } else {
      console.log("NO HAY ADMIN NI SUPER_ADMIN. CREANDO NUEVO USUARIO...");
      console.log("Nota: Tu base de datos puede que no tenga Compañía registrada aún si estás arrancando de 0.");
    }
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
