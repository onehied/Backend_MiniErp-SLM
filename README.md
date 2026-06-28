# Backend - Mini ERP Invoicing System

## 📌 Tech Stack Used
- **Framework:** [NestJS](https://nestjs.com/)  
- **Database:** PostgreSQL  
- **ORM:** Prisma  
- **Authentication:** JWT (JSON Web Token)  
- **Deployment:** Railway
- **API Documentation:** Swagger (auto-generated), Postman Collection

## 🏗️ Brief Explanation of Architectural Decisions
- **Modular Architecture**     → Setiap fitur (Auth, Customers, Invoices, dll.) dipisahkan dalam module agar mudah dikembangkan dan scalable.
- **Service Layer Separation** → Business logic ditempatkan di service, controller hanya menangani request/response.
- **Prisma ORM**               → Dipilih untuk kemudahan query, migrasi, dan integrasi dengan NestJS.
- **JWT Authentication**       → Standar untuk sistem login multi-user dengan role-based access.
- **Environment Variables**    → Digunakan untuk konfigurasi sensitif (database, secret key) agar mudah diatur di Railway maupun lokal.

## 📖 API Documentation
Swagger UI tersedia di:
  👉 https://backendminierp-slm-production.up.railway.app/api

## 🗄️ Database Schema / ERD
![ERD Diagram](docs/mini_erp_erd.png)

👉 Lihat detail di [docs/mini_erp_erd.png](docs/mini_erp_erd.png)

---

## ⚙️ Prerequisites and Installation Steps
1. **Prerequisites**
   - Node.js v11+
   - PostgreSQL (sudah terinstall dan berjalan)
   - Git

2. **Clone Repository**
   ```bash
   git clone (https://github.com/onehied/Backend_MiniErp-SLM.git
   cd Backend_MiniErp-SLM
   
3. **Install Dependencies**
    ```bash
      $ npm install
    ```
4. **Setup Environment Variables**
   Buat file .env di root project:
    ```bash
      DATABASE_URL="postgresql://user:password@localhost:5432/mini_erp"
      JWT_SECRET="your-secret-key"
    ```
## Description
1. **Generate Prisma Client & Run Migration**
    ```bash
      npx prisma migrate dev --name init
    ```
2. **Start Development Server**
    ```bash
      npm run start:dev
    ```
Backend akan berjalan di http://localhost:3000.
