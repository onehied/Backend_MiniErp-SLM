import {
  InvoiceStatus,
  PrismaClient,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const PASSWORD = 'password123';

const FIRST_NAMES = [
  'Abdul',
  'Budi',
  'Citra',
  'Dewi',
  'Eka',
  'Farhan',
  'Gilang',
  'Hana',
  'Indra',
  'Joko',
  'Karin',
  'Lukman',
  'Maya',
  'Nadia',
  'Oka',
  'Putri',
  'Rian',
  'Salsa',
  'Taufik',
  'Vina',
];

const LAST_NAMES = [
  'Saputra',
  'Pratama',
  'Wijaya',
  'Santoso',
  'Mahardika',
  'Permata',
  'Kusuma',
  'Ramadhan',
  'Utama',
  'Nugroho',
];

const COMPANY_PREFIXES = [
  'PT',
  'CV',
  'UD',
  'Global',
  'Mitra',
  'Sinar',
  'Prima',
  'Berkah',
  'Sentosa',
  'Maju',
];

const COMPANY_SUFFIXES = [
  'Digital',
  'Abadi',
  'Mandiri',
  'Jaya',
  'Sejahtera',
  'Teknologi',
  'Niaga',
  'Logistik',
  'Utama',
  'Perkasa',
];

const CITIES = [
  'Jakarta',
  'Bandung',
  'Surabaya',
  'Semarang',
  'Yogyakarta',
  'Bekasi',
  'Tangerang',
  'Depok',
  'Bogor',
  'Malang',
];

const STATUS_ROTATION: InvoiceStatus[] = [
  'DRAFT',
  'SENT',
  'PAID',
  'PARTIALLY_PAID',
  'OVERDUE',
  'CANCELLED',
];

function pad(value: number) {
  return String(value).padStart(3, '0');
}

function buildPersonName(index: number) {
  return `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[index % LAST_NAMES.length]}`;
}

function buildCompanyName(index: number) {
  const prefix = COMPANY_PREFIXES[index % COMPANY_PREFIXES.length];
  const suffix = COMPANY_SUFFIXES[index % COMPANY_SUFFIXES.length];
  return `${prefix}. ${suffix} ${pad(index + 1)}`;
}

async function seedRoles() {
  console.log('Seeding roles...');

  await prisma.role.createMany({
    data: [
      { roleName: 'ADMIN', description: 'Administrator with full access' },
      { roleName: 'USER', description: 'Regular user with limited access' },
      { roleName: 'CUSTOMER', description: 'Customer role' },
    ],
    skipDuplicates: true,
  });

  return prisma.role.findMany({
    orderBy: { roleName: 'asc' },
  });
}

async function seedUsers(passwordHash: string) {
  console.log('Seeding users...');

  const baseUsers = [
    {
      username: 'admin',
      name: 'Administrator',
      email: 'admin@email.com',
      status: UserStatus.ACTIVE,
    },
    {
      username: 'user1',
      name: 'User One',
      email: 'user1@email.com',
      status: UserStatus.ACTIVE,
    },
  ];

  const generatedUsers = Array.from({ length: 18 }, (_, index) => {
    const sequence = index + 1;
    return {
      username: `dummyuser${pad(sequence)}`,
      name: buildPersonName(sequence),
      email: `dummyuser${pad(sequence)}@email.com`,
      status: sequence % 7 === 0 ? UserStatus.INACTIVE : UserStatus.ACTIVE,
    };
  });

  const usersToSeed = [...baseUsers, ...generatedUsers];

  for (const user of usersToSeed) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        username: user.username,
        name: user.name,
        status: user.status,
        passwordHash,
      },
      create: {
        ...user,
        passwordHash,
      },
    });
  }

  return prisma.user.findMany({
    where: {
      OR: [
        { email: 'admin@email.com' },
        { email: 'user1@email.com' },
        { email: { startsWith: 'dummyuser' } },
      ],
    },
    orderBy: { email: 'asc' },
  });
}

async function assignRoles() {
  console.log('Assigning roles to users...');

  const roles = await prisma.role.findMany();
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: 'admin@email.com' },
        { email: 'user1@email.com' },
        { email: { startsWith: 'dummyuser' } },
      ],
    },
  });

  const adminRole = roles.find((role) => role.roleName === 'ADMIN');
  const userRole = roles.find((role) => role.roleName === 'USER');
  const customerRole = roles.find((role) => role.roleName === 'CUSTOMER');

  for (const user of users) {
    const targetRole =
      user.email === 'admin@email.com'
        ? adminRole
        : user.email.endsWith('005@email.com') || user.email.endsWith('010@email.com')
          ? customerRole
          : userRole;

    if (!targetRole) {
      continue;
    }

    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: targetRole.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: targetRole.id,
      },
    });
  }
}

async function seedCustomers() {
  console.log('Seeding customers...');

  const customers = Array.from({ length: 60 }, (_, index) => {
    const sequence = index + 1;
    const city = CITIES[index % CITIES.length];
    return {
      name: buildCompanyName(index),
      email: `customer${pad(sequence)}@email.com`,
      phone: `08${String(1200000000 + sequence).slice(0, 10)}`,
      address: `Jl. Dummy No. ${sequence}`,
      city,
      state: city,
      zipCode: `40${String(100 + sequence).slice(-3)}`,
      country: 'Indonesia',
    };
  });

  for (const customer of customers) {
    await prisma.customer.upsert({
      where: { email: customer.email },
      update: customer,
      create: customer,
    });
  }

  return prisma.customer.findMany({
    where: {
      email: { startsWith: 'customer' },
    },
    orderBy: { email: 'asc' },
  });
}

async function seedInvoices(customers: Array<{ id: string }>) {
  console.log('Seeding invoices...');

  const invoiceCount = 75;

  for (let index = 0; index < invoiceCount; index += 1) {
    const sequence = index + 1;
    const customer = customers[index % customers.length];
    const issueDate = new Date(2026, index % 12, (index % 27) + 1);
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + 14 + (index % 10));

    const itemAQty = (index % 5) + 1;
    const itemBQty = (index % 3) + 2;
    const unitPriceA = 150000 + index * 2000;
    const unitPriceB = 90000 + index * 1500;
    const amountA = itemAQty * unitPriceA;
    const amountB = itemBQty * unitPriceB;
    const discount = (index % 4) * 25000;
    const totalAmount = amountA + amountB - discount;

    const invoice = await prisma.invoice.upsert({
      where: { invoiceNumber: `DUMMY-INV-${String(sequence).padStart(4, '0')}` },
      update: {
        customerId: customer.id,
        issueDate,
        dueDate,
        status: STATUS_ROTATION[index % STATUS_ROTATION.length],
        totalAmount,
        taxAmount: 0,
        discount,
        notes: `Invoice dummy ke-${sequence}`,
      },
      create: {
        invoiceNumber: `DUMMY-INV-${String(sequence).padStart(4, '0')}`,
        customerId: customer.id,
        issueDate,
        dueDate,
        status: STATUS_ROTATION[index % STATUS_ROTATION.length],
        totalAmount,
        taxAmount: 0,
        discount,
        notes: `Invoice dummy ke-${sequence}`,
      },
    });

    await prisma.invoiceItem.deleteMany({
      where: { invoiceId: invoice.id },
    });

    await prisma.invoiceItem.createMany({
      data: [
        {
          invoiceId: invoice.id,
          description: `Produk Dummy A ${pad(sequence)}`,
          quantity: itemAQty,
          unitPrice: unitPriceA,
          amount: amountA,
        },
        {
          invoiceId: invoice.id,
          description: `Produk Dummy B ${pad(sequence)}`,
          quantity: itemBQty,
          unitPrice: unitPriceB,
          amount: amountB,
        },
      ],
    });
  }
}

async function main() {
  console.log('Seeding dummy data...');

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const roles = await seedRoles();
  const users = await seedUsers(passwordHash);
  await assignRoles();
  const customers = await seedCustomers();
  await seedInvoices(customers);

  const invoicesCount = await prisma.invoice.count({
    where: {
      invoiceNumber: { startsWith: 'DUMMY-INV-' },
    },
  });

  console.log('Roles ready:', roles.length);
  console.log('Dummy users ready:', users.length);
  console.log('Dummy customers ready:', customers.length);
  console.log('Dummy invoices ready:', invoicesCount);
  console.log(`Default password semua user dummy: ${PASSWORD}`);
  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
