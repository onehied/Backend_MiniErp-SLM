const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const projectRoot = path.resolve(__dirname, '..', '..');
const outputDir = path.join(projectRoot, 'frontend', 'docs');
const outputFile = path.join(outputDir, 'mini-erp-system-documentation.pdf');

fs.mkdirSync(outputDir, { recursive: true });

const doc = new PDFDocument({
  size: 'A4',
  margin: 48,
  info: {
    Title: 'Mini ERP System Documentation',
    Author: 'TRAE Assistant',
    Subject: 'ERD, Tech Stack, Setup, and Architecture Notes',
  },
});

const outputStream = fs.createWriteStream(outputFile);
doc.pipe(outputStream);

const colors = {
  navy: '#0f172a',
  slate: '#334155',
  muted: '#64748b',
  border: '#cbd5e1',
  soft: '#e2e8f0',
  blue: '#2563eb',
  green: '#059669',
  amber: '#d97706',
  rose: '#e11d48',
  page: '#f8fafc',
};

function h1(text) {
  doc
    .moveDown(0.3)
    .font('Helvetica-Bold')
    .fontSize(24)
    .fillColor(colors.navy)
    .text(text, { align: 'left' });
  doc.moveDown(0.2);
}

function h2(text) {
  doc
    .moveDown(0.3)
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(colors.blue)
    .text(text, { align: 'left' });
  doc.moveDown(0.15);
}

function paragraph(text, options = {}) {
  doc
    .font('Helvetica')
    .fontSize(options.size || 10.5)
    .fillColor(options.color || colors.slate)
    .text(text, {
      align: options.align || 'left',
      lineGap: options.lineGap ?? 3,
    });
}

function bulletList(items) {
  items.forEach((item) => {
    doc
      .font('Helvetica')
      .fontSize(10.5)
      .fillColor(colors.slate)
      .text(`• ${item}`, {
        indent: 10,
        lineGap: 3,
      });
  });
  doc.moveDown(0.2);
}

function drawDivider() {
  const y = doc.y + 4;
  doc
    .strokeColor(colors.soft)
    .lineWidth(1)
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .stroke();
  doc.moveDown(0.8);
}

function labeledParagraph(title, text) {
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(colors.navy)
    .text(title);
  paragraph(text);
  doc.moveDown(0.15);
}

function tableBox(x, y, width, title, fields, accent) {
  const headerHeight = 24;
  const lineHeight = 12.5;
  const bodyPadding = 8;
  const height = headerHeight + bodyPadding * 2 + fields.length * lineHeight;

  doc
    .roundedRect(x, y, width, height, 8)
    .fillAndStroke('#ffffff', colors.border);

  doc
    .roundedRect(x, y, width, headerHeight, 8)
    .fillAndStroke(accent, accent);

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#ffffff')
    .text(title, x + 10, y + 7, { width: width - 20 });

  let cursorY = y + headerHeight + bodyPadding;
  fields.forEach((field) => {
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(colors.slate)
      .text(field, x + 10, cursorY, { width: width - 20 });
    cursorY += lineHeight;
  });

  return { x, y, width, height };
}

function connectBoxes(from, to, label, color = colors.muted) {
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height;
  const endX = to.x + to.width / 2;
  const endY = to.y;
  const midY = (startY + endY) / 2;

  doc
    .strokeColor(color)
    .lineWidth(1.4)
    .moveTo(startX, startY)
    .lineTo(startX, midY)
    .lineTo(endX, midY)
    .lineTo(endX, endY)
    .stroke();

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(color)
    .text(label, Math.min(startX, endX) + 4, midY - 9);
}

function connectSide(from, to, label, color = colors.muted) {
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  const midX = (startX + endX) / 2;

  doc
    .strokeColor(color)
    .lineWidth(1.4)
    .moveTo(startX, startY)
    .lineTo(midX, startY)
    .lineTo(midX, endY)
    .lineTo(endX, endY)
    .stroke();

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(color)
    .text(label, midX - 18, Math.min(startY, endY) - 12);
}

doc.rect(0, 0, doc.page.width, doc.page.height).fill(colors.page);
doc.fillColor(colors.navy);
h1('Mini ERP System Documentation');

doc
  .font('Helvetica-Bold')
  .fontSize(13)
  .fillColor(colors.green)
  .text('Database Schema / Entity Relationship Diagram (ERD) and Local Setup Guide');

doc.moveDown(0.6);
paragraph(
  'Dokumen ini merangkum struktur database utama yang sudah diimplementasikan pada Mini ERP, beserta stack teknologi, kebutuhan instalasi, langkah menjalankan aplikasi secara lokal, dan keputusan arsitektur yang dipakai selama pengembangan.',
  { size: 11, lineGap: 4 }
);

drawDivider();

labeledParagraph(
  'Ruang Lingkup',
  'Cakupan dokumen ini mengikuti implementasi aktif pada repository saat ini: autentikasi JWT + refresh token, modul user/role, customer, invoice, upload file, dashboard, password reset, Google login, dan activity logs.'
);

labeledParagraph(
  'Sumber Kebenaran Schema',
  'ERD pada dokumen ini diturunkan dari file Prisma schema pada backend, yaitu backend/prisma/schema.prisma, sehingga merepresentasikan model data yang benar-benar dipakai aplikasi.'
);

labeledParagraph(
  'Opsional Link Deployment',
  'Belum tersedia pada konteks proyek lokal ini. Jika nantinya aplikasi sudah di-deploy, tautan production atau staging dapat ditambahkan pada revisi berikutnya.'
);

doc
  .font('Helvetica')
  .fontSize(10)
  .fillColor(colors.muted)
  .text(`Generated file: ${outputFile}`);

doc.addPage({ size: 'A4', layout: 'landscape', margin: 36 });
doc.rect(0, 0, doc.page.width, doc.page.height).fill('#ffffff');
h1('ERD Overview');
paragraph(
  'Diagram berikut menampilkan entitas inti dan relasi utama pada sistem Mini ERP yang saat ini aktif digunakan.'
);

const userBox = tableBox(
  32,
  96,
  165,
  'User',
  [
    'PK id',
    'username (unique)',
    'email (unique)',
    'password_hash',
    'name, phone, avatar_url',
    'google_*',
    'status, created_at, updated_at',
  ],
  '#0f766e'
);

const userRoleBox = tableBox(
  245,
  96,
  170,
  'UserRole',
  [
    'PK id',
    'FK user_id -> User.id',
    'FK role_id -> Role.id',
    'assigned_at',
    'unique(user_id, role_id)',
  ],
  '#1d4ed8'
);

const roleBox = tableBox(
  468,
  96,
  160,
  'Role',
  [
    'PK id',
    'role_name (unique)',
    'description',
    'created_at, updated_at',
  ],
  '#7c3aed'
);

const refreshTokenBox = tableBox(
  32,
  270,
  165,
  'RefreshToken',
  [
    'PK id',
    'FK user_id -> User.id',
    'token (unique)',
    'expires_at',
    'created_at',
  ],
  '#0ea5e9'
);

const passwordResetBox = tableBox(
  232,
  270,
  188,
  'PasswordResetToken',
  [
    'PK id',
    'FK user_id -> User.id',
    'token (unique)',
    'expires_at',
    'used_at',
    'created_at',
  ],
  '#f59e0b'
);

const activityLogBox = tableBox(
  460,
  250,
  220,
  'ActivityLog',
  [
    'PK id',
    'FK actor_user_id -> User.id (nullable)',
    'action, module, status',
    'entity_type, entity_id',
    'message, metadata(JSONB)',
    'ip_address, user_agent',
    'method, path, created_at',
  ],
  '#e11d48'
);

const customerBox = tableBox(
  80,
  470,
  180,
  'Customer',
  [
    'PK id',
    'name',
    'email (unique, nullable)',
    'phone, address',
    'city, state, zipCode, country',
    'createdAt, updatedAt',
  ],
  '#059669'
);

const invoiceBox = tableBox(
  314,
  450,
  205,
  'Invoice',
  [
    'PK id',
    'invoiceNumber (unique)',
    'FK customerId -> Customer.id',
    'status, issueDate, dueDate',
    'totalAmount, taxAmount, discount',
    'attachment_*',
    'createdAt, updatedAt',
  ],
  '#dc2626'
);

const invoiceItemBox = tableBox(
  580,
  470,
  170,
  'InvoiceItem',
  [
    'PK id',
    'FK invoiceId -> Invoice.id',
    'description',
    'quantity, unitPrice, amount',
    'createdAt, updatedAt',
  ],
  '#2563eb'
);

connectSide(userBox, userRoleBox, '1 .. *');
connectSide(userRoleBox, roleBox, '* .. 1');
connectBoxes(userBox, refreshTokenBox, '1 .. *');
connectBoxes(userBox, passwordResetBox, '1 .. *', colors.amber);
connectBoxes(userBox, activityLogBox, '1 .. * (optional)', colors.rose);
connectSide(customerBox, invoiceBox, '1 .. *', colors.green);
connectSide(invoiceBox, invoiceItemBox, '1 .. *', colors.blue);

doc
  .font('Helvetica')
  .fontSize(8.5)
  .fillColor(colors.muted)
  .text(
    'Catatan: ActivityLog menyimpan metadata fleksibel berbasis JSONB untuk old_value/new_value, konteks request, dan payload audit lain.',
    36,
    548,
    { width: 400 }
  );

doc.addPage({ size: 'A4', margin: 48 });
doc.rect(0, 0, doc.page.width, doc.page.height).fill('#ffffff');
h1('Entity Notes');

h2('Entitas Utama');
bulletList([
  'User: menyimpan identitas pengguna, status akun, avatar, dan data integrasi Google.',
  'Role: daftar hak akses tingkat tinggi seperti ADMIN atau role lain yang ditetapkan ke user.',
  'UserRole: tabel pivot many-to-many untuk menghubungkan user dengan role.',
  'Customer: master data pelanggan yang dipakai saat pembuatan invoice.',
  'Invoice: header transaksi invoice termasuk status, nilai total, dan attachment file.',
  'InvoiceItem: rincian item per invoice yang menyimpan quantity, unit price, dan amount.',
]);

h2('Entitas Pendukung Keamanan');
bulletList([
  'RefreshToken: menyimpan token sesi jangka panjang untuk rotasi access token.',
  'PasswordResetToken: menyimpan token reset password dengan masa berlaku dan penanda used_at.',
  'ActivityLog: audit trail untuk login, CRUD, navigasi, dan error dengan metadata JSONB.',
]);

h2('Enum');
bulletList([
  'InvoiceStatus: DRAFT, SENT, PAID, PARTIALLY_PAID, OVERDUE, CANCELLED.',
  'UserStatus: ACTIVE, INACTIVE.',
]);

h2('Relasi Kunci');
bulletList([
  'Satu Customer memiliki banyak Invoice.',
  'Satu Invoice memiliki banyak InvoiceItem.',
  'Satu User dapat memiliki banyak RefreshToken, PasswordResetToken, dan ActivityLog.',
  'User dan Role berelasi many-to-many melalui UserRole.',
]);

doc.addPage({ size: 'A4', margin: 48 });
doc.rect(0, 0, doc.page.width, doc.page.height).fill('#ffffff');
h1('Tech Stack Used');

bulletList([
  'Frontend: Next.js 15 App Router, React 18, TypeScript, Tailwind CSS, Zustand, Axios, react-select, Sonner, Lucide React.',
  'Backend: NestJS 10, TypeScript, Prisma ORM, Passport JWT, Passport Google OAuth 2.0, class-validator, class-transformer, Nodemailer, PDFKit, ExcelJS.',
  'Database: PostgreSQL.',
  'Authentication: JWT access token 30 menit + refresh token 7 hari.',
  'File Storage: local filesystem untuk uploads avatar dan attachment invoice.',
  'Tooling: npm, Prisma Migrate, Prisma Seed, ESLint, Prettier, Jest.',
]);

h2('Tech Stack Notes');
paragraph(
  'Struktur proyek saat ini memisahkan frontend dan backend menjadi dua aplikasi terpisah. Frontend berjalan pada port 3001, backend pada port 3000, dan komunikasi API dilakukan melalui endpoint berbasis REST.'
);

doc.addPage({ size: 'A4', margin: 48 });
doc.rect(0, 0, doc.page.width, doc.page.height).fill('#ffffff');
h1('Prerequisites and Installation');

h2('Prerequisites');
bulletList([
  'Node.js 18 atau lebih baru disarankan.',
  'npm sudah terpasang.',
  'PostgreSQL aktif secara lokal.',
  'Database bernama mini_erp sudah dibuat atau dapat dibuat saat setup.',
  'Koneksi internet jika ingin menguji Google OAuth atau pengiriman email Mailtrap.',
]);

h2('Environment Variables');
bulletList([
  'Backend memerlukan minimal: DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, APP_URL, FRONTEND_URL, PORT.',
  'Untuk fitur tambahan: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL, MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM.',
  'Frontend memerlukan .env.local yang menunjuk ke base URL backend, umumnya NEXT_PUBLIC_API_URL=http://localhost:3000/api.',
]);

h2('Installation Steps');
bulletList([
  '1. Masuk ke folder backend lalu jalankan npm install.',
  '2. Salin backend/.env.example menjadi backend/.env lalu sesuaikan nilainya.',
  '3. Jalankan migration database dengan npx prisma migrate deploy atau npx prisma migrate dev.',
  '4. Jika butuh data awal, jalankan npm run db:seed pada folder backend.',
  '5. Masuk ke folder frontend lalu jalankan npm install.',
  '6. Buat frontend/.env.local dan set NEXT_PUBLIC_API_URL ke backend API lokal.',
]);

doc.addPage({ size: 'A4', margin: 48 });
doc.rect(0, 0, doc.page.width, doc.page.height).fill('#ffffff');
h1('Run Locally');

h2('Backend');
bulletList([
  'Folder: c:\\Project\\backend',
  'Install dependencies: npm install',
  'Run development server: npm run start:dev',
  'Alternative run: npm run start',
  'Build production artifact: npm run build',
]);

h2('Frontend');
bulletList([
  'Folder: c:\\Project\\frontend',
  'Install dependencies: npm install',
  'Run development server: npm run dev',
  'Default local URL: http://localhost:3001',
  'Clear Next.js cache jika perlu: npm run clear atau npm run dev:clear',
]);

h2('Recommended Local Startup Order');
bulletList([
  '1. Pastikan PostgreSQL aktif.',
  '2. Jalankan backend lebih dulu pada port 3000.',
  '3. Jalankan frontend pada port 3001.',
  '4. Login menggunakan akun dummy hasil seed, misalnya admin@email.com jika seed sudah dijalankan.',
]);

h2('Local Access');
bulletList([
  'Frontend app: http://localhost:3001',
  'Backend API base: http://localhost:3000/api',
  'Swagger: http://localhost:3000/api',
]);

doc.addPage({ size: 'A4', margin: 48 });
doc.rect(0, 0, doc.page.width, doc.page.height).fill('#ffffff');
h1('Architectural Decisions');

bulletList([
  'Frontend dan backend dipisah agar deployment, scaling, dan debugging lebih jelas antara UI dan API.',
  'Prisma dipakai sebagai source of truth schema database sehingga perubahan model lebih konsisten melalui migration.',
  'JWT access token yang singkat dipadukan dengan refresh token agar sesi tetap nyaman tetapi tetap aman.',
  'Activity logs menggunakan kolom JSONB pada metadata untuk kebutuhan audit yang fleksibel seperti old_value dan new_value.',
  'Upload file disimpan di local filesystem agar implementasi awal ringan dan mudah diuji pada environment lokal.',
  'Dashboard memakai fallback visual dan demo data agar halaman tidak blank saat data kosong atau endpoint tertentu gagal.',
]);

h2('Assumptions');
bulletList([
  'Port standar lokal adalah backend 3000 dan frontend 3001.',
  'Database yang dipakai adalah PostgreSQL, bukan SQLite untuk runtime utama.',
  'Google OAuth dan Mailtrap hanya akan berjalan penuh jika kredensial env valid.',
  'Belum ada link deployment final yang dikonfigurasi pada konteks proyek ini.',
]);

paragraph(
  'Jika aplikasi nantinya di-deploy, bagian deployment dapat diperbarui dengan URL staging/production, arsitektur storage yang dipakai, serta strategi environment management yang lebih formal.'
);

doc.end();

outputStream.on('finish', () => {
  console.log(`PDF generated: ${outputFile}`);
});
