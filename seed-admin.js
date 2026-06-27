const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function seed() {
  const prisma = new PrismaClient();

  try {
    const adminRole = await prisma.role.upsert({
      where: { roleName: 'ADMIN' },
      update: {},
      create: {
        roleName: 'ADMIN',
        description: 'System administrator',
      },
    });

    const userRole = await prisma.role.upsert({
      where: { roleName: 'USER' },
      update: {},
      create: {
        roleName: 'USER',
        description: 'Standard user',
      },
    });

    const passwordHash = await bcrypt.hash('password123', 10);

    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@example.com' },
      update: {
        username: 'admin',
        name: 'Administrator',
        status: 'ACTIVE',
        passwordHash,
      },
      create: {
        username: 'admin',
        email: 'admin@example.com',
        name: 'Administrator',
        status: 'ACTIVE',
        passwordHash,
      },
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: adminUser.id,
          roleId: adminRole.id,
        },
      },
      update: {},
      create: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: adminUser.id,
          roleId: userRole.id,
        },
      },
      update: {},
      create: {
        userId: adminUser.id,
        roleId: userRole.id,
      },
    });

    console.log('Seeded admin user:', adminUser.email);
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
