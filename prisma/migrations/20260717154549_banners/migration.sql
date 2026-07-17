-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "eventWindow" TEXT NOT NULL DEFAULT '',
    "ctaLabel" TEXT NOT NULL DEFAULT 'Shop now',
    "ctaHref" TEXT NOT NULL DEFAULT '/products',
    "image" TEXT,
    "accentFrom" TEXT NOT NULL DEFAULT '#ff7a1a',
    "accentTo" TEXT NOT NULL DEFAULT '#0e1f36',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);
