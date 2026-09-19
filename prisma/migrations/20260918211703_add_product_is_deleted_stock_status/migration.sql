-- AlterTable
ALTER TABLE "Product" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "stockStatus" TEXT NOT NULL DEFAULT 'instock';

-- CreateIndex
CREATE INDEX "Product_isDeleted_idx" ON "Product"("isDeleted");
