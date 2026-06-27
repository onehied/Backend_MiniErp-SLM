/*
  Warnings:

  - A unique constraint covering the columns `[google_id]` on the table `Users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Users" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "google_avatar_url" TEXT,
ADD COLUMN     "google_email" TEXT,
ADD COLUMN     "google_id" TEXT,
ADD COLUMN     "google_linked_at" TIMESTAMP(3),
ADD COLUMN     "google_name" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Users_google_id_key" ON "Users"("google_id");
