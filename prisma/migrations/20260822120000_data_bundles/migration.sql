-- CreateTable
CREATE TABLE "DataBundle" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "sizeGb" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validity" TEXT NOT NULL DEFAULT 'No expiry',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataOrder" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "sizeGb" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recipientPhone" TEXT NOT NULL,
    "buyerPhone" TEXT NOT NULL,
    "buyerEmail" TEXT,
    "buyerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "paidAt" TIMESTAMP(3),
    "providerOrderId" TEXT,
    "providerCode" TEXT,
    "providerStatus" TEXT,
    "providerMessage" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AfaRegistration" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "idNumber" TEXT NOT NULL,
    "dateOfBirth" TEXT NOT NULL,
    "town" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "paidAt" TIMESTAMP(3),
    "providerId" TEXT,
    "providerStatus" TEXT,
    "providerMessage" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AfaRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataBundle_network_isActive_idx" ON "DataBundle"("network", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DataBundle_network_sizeGb_key" ON "DataBundle"("network", "sizeGb");

-- CreateIndex
CREATE UNIQUE INDEX "DataOrder_reference_key" ON "DataOrder"("reference");

-- CreateIndex
CREATE INDEX "DataOrder_buyerPhone_idx" ON "DataOrder"("buyerPhone");

-- CreateIndex
CREATE INDEX "DataOrder_recipientPhone_idx" ON "DataOrder"("recipientPhone");

-- CreateIndex
CREATE INDEX "DataOrder_status_idx" ON "DataOrder"("status");

-- CreateIndex
CREATE INDEX "DataOrder_userId_idx" ON "DataOrder"("userId");

-- CreateIndex
CREATE INDEX "DataOrder_createdAt_idx" ON "DataOrder"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AfaRegistration_reference_key" ON "AfaRegistration"("reference");

-- CreateIndex
CREATE INDEX "AfaRegistration_phoneNumber_idx" ON "AfaRegistration"("phoneNumber");

-- CreateIndex
CREATE INDEX "AfaRegistration_status_idx" ON "AfaRegistration"("status");

-- CreateIndex
CREATE INDEX "AfaRegistration_createdAt_idx" ON "AfaRegistration"("createdAt");
