-- Nickimart Medical — initial schema.
--
-- The medical business's own database: catalogue, quotations, inventory,
-- sourcing, finance and redistributors. Fifty tables, every one prefixed
-- `medical_` so that an environment which has not yet been given a separate
-- MEDICAL_DATABASE_URL cannot collide with a retail or bundle table.
--
-- Generated from prisma/medical/schema.prisma and then made re-runnable:
-- tables and indexes carry IF NOT EXISTS, and each foreign key is attempted
-- inside a DO block that swallows a duplicate and nothing else. Safe to
-- re-run; applied once by scripts/migrate.mjs, which records it.
--
-- Nothing here touches a retail or data-bundle table. This file is applied
-- against MEDICAL_DATABASE_URL only, and is skipped entirely when that is
-- not set.

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_staff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'SALES',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "statusNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_organisations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LABORATORY',
    "about" TEXT NOT NULL DEFAULT '',
    "registrationNo" TEXT NOT NULL DEFAULT '',
    "taxId" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'Ghana',
    "digitalAddress" TEXT NOT NULL DEFAULT '',
    "creditApproved" BOOLEAN NOT NULL DEFAULT false,
    "creditLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "defaultPaymentTerms" TEXT NOT NULL DEFAULT '',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_organisation_members" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'REQUESTER',
    "approvalLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_organisation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_customers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "customerType" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "organisationId" TEXT,
    "jobTitle" TEXT NOT NULL DEFAULT '',
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_customer_addresses" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "organisationId" TEXT,
    "label" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'Ghana',
    "digitalAddress" TEXT NOT NULL DEFAULT '',
    "deliveryNotes" TEXT NOT NULL DEFAULT '',
    "isDefaultDelivery" BOOLEAN NOT NULL DEFAULT false,
    "isDefaultBilling" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'FlaskConical',
    "image" TEXT,
    "parentId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "showInSidebar" BOOLEAN NOT NULL DEFAULT true,
    "metaTitle" TEXT NOT NULL DEFAULT '',
    "metaDescription" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_manufacturers" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT '',
    "logo" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_products" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "categoryId" TEXT NOT NULL,
    "manufacturerId" TEXT,
    "catalogueNumber" TEXT NOT NULL DEFAULT '',
    "sku" TEXT NOT NULL,
    "packSize" TEXT NOT NULL DEFAULT '',
    "unitOfSale" TEXT NOT NULL DEFAULT 'unit',
    "unitsPerPack" INTEGER NOT NULL DEFAULT 0,
    "price" DECIMAL(14,2) NOT NULL,
    "comparePrice" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "minimumOrderQuantity" INTEGER NOT NULL DEFAULT 1,
    "purchaseCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "primarySupplierId" TEXT,
    "sourcingMode" TEXT NOT NULL DEFAULT 'LOCAL',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "purchaseMode" TEXT NOT NULL DEFAULT 'BOTH',
    "stockOnHand" INTEGER NOT NULL DEFAULT 0,
    "stockReserved" INTEGER NOT NULL DEFAULT 0,
    "stockOnOrder" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "reorderQuantity" INTEGER NOT NULL DEFAULT 0,
    "allowBackorder" BOOLEAN NOT NULL DEFAULT false,
    "tracksBatches" BOOLEAN NOT NULL DEFAULT false,
    "leadTimeMinDays" INTEGER NOT NULL DEFAULT 2,
    "leadTimeMaxDays" INTEGER NOT NULL DEFAULT 7,
    "storageCondition" TEXT NOT NULL DEFAULT 'AMBIENT',
    "handlingNotes" TEXT NOT NULL DEFAULT '',
    "requiresColdChain" BOOLEAN NOT NULL DEFAULT false,
    "hazardClass" TEXT NOT NULL DEFAULT '',
    "restrictedSale" BOOLEAN NOT NULL DEFAULT false,
    "restrictionNote" TEXT NOT NULL DEFAULT '',
    "specifications" TEXT NOT NULL DEFAULT '[]',
    "compatibleWith" TEXT NOT NULL DEFAULT '[]',
    "documents" TEXT NOT NULL DEFAULT '[]',
    "searchTerms" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isNewArrival" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "metaTitle" TEXT NOT NULL DEFAULT '',
    "metaDescription" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_product_images" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_wishlist_items" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_suppliers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LOCAL',
    "country" TEXT NOT NULL DEFAULT 'Ghana',
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "contactName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "leadTimeDays" INTEGER NOT NULL DEFAULT 14,
    "minimumOrderValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "paymentDetails" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "rating" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_supplier_quotes" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "exchangeRate" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "notes" TEXT NOT NULL DEFAULT '',
    "attachment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_supplier_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_supplier_quote_items" (
    "id" TEXT NOT NULL,
    "supplierQuoteId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "supplierSku" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "medical_supplier_quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_purchase_orders" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "orderedAt" TIMESTAMP(3),
    "expectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "exchangeRate" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shippingEstimate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shippingActual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dutyEstimate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dutyActual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "clearingEstimate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "clearingActual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherEstimate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherActual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costsConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "totalLandedGhs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "supplierSku" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "quantityReceived" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "landedUnitCostGhs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "medical_purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_goods_receipts" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT NOT NULL DEFAULT '',
    "deliveryNote" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_goods_receipt_items" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "quantityAccepted" INTEGER NOT NULL DEFAULT 0,
    "quantityRejected" INTEGER NOT NULL DEFAULT 0,
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "stockBatchId" TEXT,

    CONSTRAINT "medical_goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_supplier_invoices" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "supplierReference" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "exchangeRate" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "amount" DECIMAL(14,2) NOT NULL,
    "amountGhs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "attachment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_supplier_payments" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierInvoiceId" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'BANK',
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "exchangeRate" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "amount" DECIMAL(14,2) NOT NULL,
    "amountGhs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedById" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_product_cost_history" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "exchangeRate" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'GOODS_RECEIPT',
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_product_cost_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_stock_batches" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL DEFAULT '',
    "expiryDate" TIMESTAMP(3),
    "quantityReceived" INTEGER NOT NULL DEFAULT 0,
    "quantityRemaining" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "supplierId" TEXT,
    "goodsReceiptItemId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isQuarantined" BOOLEAN NOT NULL DEFAULT false,
    "quarantineReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_stock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_stock_movements" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedDelta" INTEGER NOT NULL DEFAULT 0,
    "balanceAfter" INTEGER NOT NULL DEFAULT 0,
    "sourceType" TEXT NOT NULL DEFAULT '',
    "sourceId" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "staffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_quotation_requests" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" TEXT,
    "organisationId" TEXT,
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "institutionName" TEXT NOT NULL DEFAULT '',
    "institutionType" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "assigneeId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'STOREFRONT',
    "requiredBy" TIMESTAMP(3),
    "deliverTo" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "specialRequest" TEXT NOT NULL DEFAULT '',
    "redistributorId" TEXT,
    "accessToken" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_quotation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_quotation_request_items" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "catalogueNumber" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "notes" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "medical_quotation_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_quotations" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestId" TEXT,
    "customerId" TEXT,
    "organisationId" TEXT,
    "documentType" TEXT NOT NULL DEFAULT 'QUOTATION',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "firstViewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT NOT NULL DEFAULT '',
    "validUntil" TIMESTAMP(3),
    "issuedById" TEXT,
    "billToName" TEXT NOT NULL DEFAULT '',
    "billToContact" TEXT NOT NULL DEFAULT '',
    "billToEmail" TEXT NOT NULL DEFAULT '',
    "billToPhone" TEXT NOT NULL DEFAULT '',
    "billToAddress" TEXT NOT NULL DEFAULT '',
    "billToTaxId" TEXT NOT NULL DEFAULT '',
    "deliverToAddress" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountKind" TEXT NOT NULL DEFAULT 'NONE',
    "discountValue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deliveryCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "handlingCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherChargeLabel" TEXT NOT NULL DEFAULT '',
    "taxLabel" TEXT NOT NULL DEFAULT '',
    "taxRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalOutright" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentModel" TEXT NOT NULL DEFAULT 'OUTRIGHT',
    "paymentPlanId" TEXT,
    "planUpliftRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "planUpliftAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "planMonths" INTEGER NOT NULL DEFAULT 0,
    "planInstalments" INTEGER NOT NULL DEFAULT 0,
    "planFrequency" TEXT NOT NULL DEFAULT '',
    "depositRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "depositAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentTerms" TEXT NOT NULL DEFAULT '',
    "deliveryEstimate" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "termsAndConditions" TEXT NOT NULL DEFAULT '',
    "templateId" TEXT,
    "accessToken" TEXT NOT NULL,
    "pdfUrl" TEXT NOT NULL DEFAULT '',
    "supersedesId" TEXT,
    "revisionReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_quotation_items" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "catalogueNumber" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discountKind" TEXT NOT NULL DEFAULT 'NONE',
    "discountValue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unitCostAtIssue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isCustomLine" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "medical_quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_quotation_events" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "quotationId" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '{}',
    "actorKind" TEXT NOT NULL DEFAULT 'STAFF',
    "actorId" TEXT NOT NULL DEFAULT '',
    "actorName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_quotation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_payment_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "months" INTEGER NOT NULL DEFAULT 0,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "instalmentCount" INTEGER NOT NULL DEFAULT 0,
    "upliftRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "depositRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "minimumDeposit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minimumOrderValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "institutionsOnly" BOOLEAN NOT NULL DEFAULT true,
    "requiresCreditApproval" BOOLEAN NOT NULL DEFAULT true,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "lateFeeRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "lateFeePolicy" TEXT NOT NULL DEFAULT '',
    "adminFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "termsText" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_instalment_schedules" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT,
    "salesOrderId" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'INSTALMENT',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "markedOverdueAt" TIMESTAMP(3),
    "waivedReason" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_instalment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_sales_orders" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'STOREFRONT',
    "customerId" TEXT,
    "organisationId" TEXT,
    "walkInName" TEXT NOT NULL DEFAULT '',
    "walkInPhone" TEXT NOT NULL DEFAULT '',
    "quotationId" TEXT,
    "fulfilmentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deliveryCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "handlingCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalOutright" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentModel" TEXT NOT NULL DEFAULT 'OUTRIGHT',
    "paymentPlanId" TEXT,
    "planUpliftAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountRefunded" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costOfGoods" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deliveryAddressId" TEXT,
    "billingAddressId" TEXT,
    "deliverySnapshot" TEXT NOT NULL DEFAULT '',
    "deliveryMethod" TEXT NOT NULL DEFAULT 'COURIER',
    "trackingNote" TEXT NOT NULL DEFAULT '',
    "promotionCode" TEXT NOT NULL DEFAULT '',
    "posOperatorId" TEXT,
    "redistributorId" TEXT,
    "customerNote" TEXT NOT NULL DEFAULT '',
    "internalNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_sales_order_items" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "catalogueNumber" TEXT NOT NULL DEFAULT '',
    "sku" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quantityReserved" INTEGER NOT NULL DEFAULT 0,
    "quantityDispatched" INTEGER NOT NULL DEFAULT 0,
    "quantityReturned" INTEGER NOT NULL DEFAULT 0,
    "batchAllocation" TEXT NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "medical_sales_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_payments" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'PAYSTACK',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "amount" DECIMAL(14,2) NOT NULL,
    "providerReference" TEXT,
    "providerPayload" TEXT NOT NULL DEFAULT '{}',
    "paidAt" TIMESTAMP(3),
    "recordedById" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_refunds" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reasonKind" TEXT NOT NULL DEFAULT 'RETURN',
    "reason" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "method" TEXT NOT NULL DEFAULT 'PAYSTACK',
    "providerReference" TEXT,
    "goodsReturned" BOOLEAN NOT NULL DEFAULT false,
    "restocked" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" TEXT NOT NULL DEFAULT '',
    "approvedById" TEXT NOT NULL DEFAULT '',
    "approvedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_financial_transactions" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'CREDIT',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "reversesId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "recordedById" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "medical_expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_expenses" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "categoryId" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "payee" TEXT NOT NULL DEFAULT '',
    "receiptUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "recordedById" TEXT NOT NULL DEFAULT '',
    "approvedById" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_redistributors" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT NOT NULL DEFAULT '',
    "statusNote" TEXT NOT NULL DEFAULT '',
    "storefrontTitle" TEXT NOT NULL DEFAULT '',
    "storefrontBio" TEXT NOT NULL DEFAULT '',
    "storefrontLogo" TEXT NOT NULL DEFAULT '',
    "flyerDesign" TEXT NOT NULL DEFAULT '{}',
    "commissionRate" DECIMAL(7,4),
    "parentId" TEXT,
    "totalEarned" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPaidOut" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "availableBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pendingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payoutMethod" TEXT NOT NULL DEFAULT '',
    "payoutDetails" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_redistributors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_redistributor_referrals" (
    "id" TEXT NOT NULL,
    "redistributorId" TEXT NOT NULL,
    "customerId" TEXT,
    "visitorKey" TEXT NOT NULL DEFAULT '',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "landingPath" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_redistributor_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_redistributor_commissions" (
    "id" TEXT NOT NULL,
    "redistributorId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "productId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "baseAmount" DECIMAL(14,2) NOT NULL,
    "rate" DECIMAL(7,4) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "isTeamCommission" BOOLEAN NOT NULL DEFAULT false,
    "sourceRedistributorId" TEXT,
    "eligibleAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_redistributor_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_redistributor_ledger" (
    "id" TEXT NOT NULL,
    "redistributorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT '',
    "sourceId" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_redistributor_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_redistributor_payouts" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "redistributorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL DEFAULT '',
    "details" TEXT NOT NULL DEFAULT '',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "approvedById" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "providerReference" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_redistributor_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_document_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'QUOTATION',
    "design" TEXT NOT NULL DEFAULT '{}',
    "defaultPaymentTerms" TEXT NOT NULL DEFAULT '',
    "defaultNotes" TEXT NOT NULL DEFAULT '',
    "defaultTerms" TEXT NOT NULL DEFAULT '',
    "defaultValidityDays" INTEGER NOT NULL DEFAULT 30,
    "numberFormat" TEXT NOT NULL DEFAULT 'QT-{YYYY}-{0000}',
    "dateFormat" TEXT NOT NULL DEFAULT 'd MMM yyyy',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_document_counters" (
    "id" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_document_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_homepage_blocks" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL DEFAULT '',
    "subtitle" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL DEFAULT '',
    "imageAlt" TEXT NOT NULL DEFAULT '',
    "ctaLabel" TEXT NOT NULL DEFAULT '',
    "ctaHref" TEXT NOT NULL DEFAULT '',
    "secondaryCtaLabel" TEXT NOT NULL DEFAULT '',
    "secondaryCtaHref" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "config" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_homepage_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_promotions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'PERCENT',
    "value" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "minimumOrderValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "maximumDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "usageLimit" INTEGER NOT NULL DEFAULT 0,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "perCustomerLimit" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "categoryIds" TEXT NOT NULL DEFAULT '[]',
    "productIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_support_requests" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT 'GENERAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "relatedType" TEXT NOT NULL DEFAULT '',
    "relatedId" TEXT NOT NULL DEFAULT '',
    "assigneeId" TEXT,
    "resolution" TEXT NOT NULL DEFAULT '',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_support_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_notifications" (
    "id" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'STAFF',
    "recipientId" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "href" TEXT NOT NULL DEFAULT '',
    "readAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_audit_logs" (
    "id" TEXT NOT NULL,
    "staffId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "changes" TEXT NOT NULL DEFAULT '{}',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "medical_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "valueType" TEXT NOT NULL DEFAULT 'string',
    "group" TEXT NOT NULL DEFAULT 'general',
    "label" TEXT NOT NULL DEFAULT '',
    "helpText" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "medical_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_staff_userId_key" ON "medical_staff"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_staff_role_isActive_idx" ON "medical_staff"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_organisations_slug_key" ON "medical_organisations"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_organisations_kind_isActive_idx" ON "medical_organisations"("kind", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_organisation_members_customerId_idx" ON "medical_organisation_members"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_organisation_members_organisationId_customerId_key" ON "medical_organisation_members"("organisationId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_customers_userId_key" ON "medical_customers"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_customers_customerType_isActive_idx" ON "medical_customers"("customerType", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_customers_organisationId_idx" ON "medical_customers"("organisationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_customer_addresses_customerId_idx" ON "medical_customer_addresses"("customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_customer_addresses_organisationId_idx" ON "medical_customer_addresses"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_categories_slug_key" ON "medical_categories"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_categories_parentId_position_idx" ON "medical_categories"("parentId", "position");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_categories_isActive_position_idx" ON "medical_categories"("isActive", "position");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_manufacturers_slug_key" ON "medical_manufacturers"("slug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_products_slug_key" ON "medical_products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_products_sku_key" ON "medical_products"("sku");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_products_categoryId_status_position_idx" ON "medical_products"("categoryId", "status", "position");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_products_status_isFeatured_idx" ON "medical_products"("status", "isFeatured");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_products_catalogueNumber_idx" ON "medical_products"("catalogueNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_products_manufacturerId_idx" ON "medical_products"("manufacturerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_products_primarySupplierId_idx" ON "medical_products"("primarySupplierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_product_images_productId_position_idx" ON "medical_product_images"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_wishlist_items_customerId_productId_key" ON "medical_wishlist_items"("customerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_suppliers_code_key" ON "medical_suppliers"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_suppliers_kind_isActive_idx" ON "medical_suppliers"("kind", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_supplier_quotes_reference_key" ON "medical_supplier_quotes"("reference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_supplier_quotes_supplierId_status_idx" ON "medical_supplier_quotes"("supplierId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_supplier_quote_items_supplierQuoteId_idx" ON "medical_supplier_quote_items"("supplierQuoteId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_supplier_quote_items_productId_idx" ON "medical_supplier_quote_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_purchase_orders_reference_key" ON "medical_purchase_orders"("reference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_purchase_orders_supplierId_status_idx" ON "medical_purchase_orders"("supplierId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_purchase_orders_status_expectedAt_idx" ON "medical_purchase_orders"("status", "expectedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_purchase_order_items_purchaseOrderId_idx" ON "medical_purchase_order_items"("purchaseOrderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_purchase_order_items_productId_idx" ON "medical_purchase_order_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_goods_receipts_reference_key" ON "medical_goods_receipts"("reference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_goods_receipts_purchaseOrderId_idx" ON "medical_goods_receipts"("purchaseOrderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_goods_receipt_items_goodsReceiptId_idx" ON "medical_goods_receipt_items"("goodsReceiptId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_supplier_invoices_reference_key" ON "medical_supplier_invoices"("reference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_supplier_invoices_supplierId_status_idx" ON "medical_supplier_invoices"("supplierId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_supplier_invoices_status_dueAt_idx" ON "medical_supplier_invoices"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_supplier_payments_reference_key" ON "medical_supplier_payments"("reference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_supplier_payments_supplierId_idx" ON "medical_supplier_payments"("supplierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_supplier_payments_supplierInvoiceId_idx" ON "medical_supplier_payments"("supplierInvoiceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_product_cost_history_productId_recordedAt_idx" ON "medical_product_cost_history"("productId", "recordedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_stock_batches_productId_expiryDate_idx" ON "medical_stock_batches"("productId", "expiryDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_stock_batches_productId_quantityRemaining_idx" ON "medical_stock_batches"("productId", "quantityRemaining");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_stock_movements_productId_createdAt_idx" ON "medical_stock_movements"("productId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_stock_movements_sourceType_sourceId_idx" ON "medical_stock_movements"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_stock_movements_kind_createdAt_idx" ON "medical_stock_movements"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_quotation_requests_reference_key" ON "medical_quotation_requests"("reference");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_quotation_requests_accessToken_key" ON "medical_quotation_requests"("accessToken");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_quotation_requests_status_submittedAt_idx" ON "medical_quotation_requests"("status", "submittedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_quotation_requests_customerId_idx" ON "medical_quotation_requests"("customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_quotation_requests_organisationId_idx" ON "medical_quotation_requests"("organisationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_quotation_requests_assigneeId_status_idx" ON "medical_quotation_requests"("assigneeId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_quotation_request_items_requestId_position_idx" ON "medical_quotation_request_items"("requestId", "position");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_quotation_request_items_productId_idx" ON "medical_quotation_request_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_quotations_accessToken_key" ON "medical_quotations"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_quotations_supersedesId_key" ON "medical_quotations"("supersedesId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_quotations_status_issuedAt_idx" ON "medical_quotations"("status", "issuedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_quotations_customerId_idx" ON "medical_quotations"("customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_quotations_organisationId_idx" ON "medical_quotations"("organisationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_quotations_requestId_idx" ON "medical_quotations"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_quotations_documentType_status_idx" ON "medical_quotations"("documentType", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_quotations_reference_version_key" ON "medical_quotations"("reference", "version");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_quotation_items_quotationId_position_idx" ON "medical_quotation_items"("quotationId", "position");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_quotation_items_productId_idx" ON "medical_quotation_items"("productId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_quotation_events_requestId_createdAt_idx" ON "medical_quotation_events"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_quotation_events_quotationId_createdAt_idx" ON "medical_quotation_events"("quotationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_payment_plans_slug_key" ON "medical_payment_plans"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_payment_plans_isActive_position_idx" ON "medical_payment_plans"("isActive", "position");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_instalment_schedules_salesOrderId_sequence_idx" ON "medical_instalment_schedules"("salesOrderId", "sequence");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_instalment_schedules_quotationId_sequence_idx" ON "medical_instalment_schedules"("quotationId", "sequence");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_instalment_schedules_status_dueDate_idx" ON "medical_instalment_schedules"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_sales_orders_reference_key" ON "medical_sales_orders"("reference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_sales_orders_fulfilmentStatus_placedAt_idx" ON "medical_sales_orders"("fulfilmentStatus", "placedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_sales_orders_paymentStatus_placedAt_idx" ON "medical_sales_orders"("paymentStatus", "placedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_sales_orders_customerId_idx" ON "medical_sales_orders"("customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_sales_orders_organisationId_idx" ON "medical_sales_orders"("organisationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_sales_orders_quotationId_idx" ON "medical_sales_orders"("quotationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_sales_orders_redistributorId_idx" ON "medical_sales_orders"("redistributorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_sales_order_items_salesOrderId_position_idx" ON "medical_sales_order_items"("salesOrderId", "position");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_sales_order_items_productId_idx" ON "medical_sales_order_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_payments_reference_key" ON "medical_payments"("reference");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_payments_providerReference_key" ON "medical_payments"("providerReference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_payments_salesOrderId_status_idx" ON "medical_payments"("salesOrderId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_payments_status_paidAt_idx" ON "medical_payments"("status", "paidAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_payment_allocations_scheduleId_idx" ON "medical_payment_allocations"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_payment_allocations_paymentId_scheduleId_key" ON "medical_payment_allocations"("paymentId", "scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_refunds_reference_key" ON "medical_refunds"("reference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_refunds_salesOrderId_status_idx" ON "medical_refunds"("salesOrderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_financial_transactions_reference_key" ON "medical_financial_transactions"("reference");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_financial_transactions_reversesId_key" ON "medical_financial_transactions"("reversesId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_financial_transactions_kind_occurredAt_idx" ON "medical_financial_transactions"("kind", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_financial_transactions_sourceType_sourceId_idx" ON "medical_financial_transactions"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_financial_transactions_occurredAt_idx" ON "medical_financial_transactions"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_expense_categories_slug_key" ON "medical_expense_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_expenses_reference_key" ON "medical_expenses"("reference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_expenses_categoryId_incurredAt_idx" ON "medical_expenses"("categoryId", "incurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_expenses_status_incurredAt_idx" ON "medical_expenses"("status", "incurredAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_redistributors_userId_key" ON "medical_redistributors"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_redistributors_code_key" ON "medical_redistributors"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_redistributors_status_idx" ON "medical_redistributors"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_redistributors_parentId_idx" ON "medical_redistributors"("parentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_redistributor_referrals_customerId_idx" ON "medical_redistributor_referrals"("customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_redistributor_referrals_visitorKey_idx" ON "medical_redistributor_referrals"("visitorKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_redistributor_referrals_redistributorId_customerId_key" ON "medical_redistributor_referrals"("redistributorId", "customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_redistributor_commissions_redistributorId_status_idx" ON "medical_redistributor_commissions"("redistributorId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_redistributor_commissions_status_eligibleAt_idx" ON "medical_redistributor_commissions"("status", "eligibleAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_redistributor_commissions_salesOrderId_productId_re_key" ON "medical_redistributor_commissions"("salesOrderId", "productId", "redistributorId", "isTeamCommission");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_redistributor_ledger_redistributorId_createdAt_idx" ON "medical_redistributor_ledger"("redistributorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_redistributor_payouts_reference_key" ON "medical_redistributor_payouts"("reference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_redistributor_payouts_redistributorId_status_idx" ON "medical_redistributor_payouts"("redistributorId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_redistributor_payouts_status_requestedAt_idx" ON "medical_redistributor_payouts"("status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_document_templates_slug_key" ON "medical_document_templates"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_document_templates_documentType_isActive_idx" ON "medical_document_templates"("documentType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_document_counters_series_year_key" ON "medical_document_counters"("series", "year");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_homepage_blocks_isActive_position_idx" ON "medical_homepage_blocks"("isActive", "position");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_promotions_code_key" ON "medical_promotions"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_promotions_isActive_endsAt_idx" ON "medical_promotions"("isActive", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "medical_support_requests_reference_key" ON "medical_support_requests"("reference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_support_requests_status_createdAt_idx" ON "medical_support_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_support_requests_customerId_idx" ON "medical_support_requests"("customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_notifications_audience_recipientId_readAt_idx" ON "medical_notifications"("audience", "recipientId", "readAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_notifications_kind_createdAt_idx" ON "medical_notifications"("kind", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_audit_logs_entity_entityId_createdAt_idx" ON "medical_audit_logs"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_audit_logs_staffId_createdAt_idx" ON "medical_audit_logs"("staffId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_audit_logs_action_createdAt_idx" ON "medical_audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_settings_group_idx" ON "medical_settings"("group");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_organisation_members" ADD CONSTRAINT "medical_organisation_members_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "medical_organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_organisation_members" ADD CONSTRAINT "medical_organisation_members_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "medical_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_customers" ADD CONSTRAINT "medical_customers_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "medical_organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_customer_addresses" ADD CONSTRAINT "medical_customer_addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "medical_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_customer_addresses" ADD CONSTRAINT "medical_customer_addresses_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "medical_organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_categories" ADD CONSTRAINT "medical_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "medical_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_products" ADD CONSTRAINT "medical_products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "medical_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_products" ADD CONSTRAINT "medical_products_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "medical_manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_products" ADD CONSTRAINT "medical_products_primarySupplierId_fkey" FOREIGN KEY ("primarySupplierId") REFERENCES "medical_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_product_images" ADD CONSTRAINT "medical_product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "medical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_wishlist_items" ADD CONSTRAINT "medical_wishlist_items_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "medical_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_wishlist_items" ADD CONSTRAINT "medical_wishlist_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "medical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_supplier_quotes" ADD CONSTRAINT "medical_supplier_quotes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "medical_suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_supplier_quote_items" ADD CONSTRAINT "medical_supplier_quote_items_supplierQuoteId_fkey" FOREIGN KEY ("supplierQuoteId") REFERENCES "medical_supplier_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_supplier_quote_items" ADD CONSTRAINT "medical_supplier_quote_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "medical_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_purchase_orders" ADD CONSTRAINT "medical_purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "medical_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_purchase_order_items" ADD CONSTRAINT "medical_purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "medical_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_purchase_order_items" ADD CONSTRAINT "medical_purchase_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "medical_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_goods_receipts" ADD CONSTRAINT "medical_goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "medical_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_goods_receipt_items" ADD CONSTRAINT "medical_goods_receipt_items_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "medical_goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_goods_receipt_items" ADD CONSTRAINT "medical_goods_receipt_items_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "medical_purchase_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_supplier_invoices" ADD CONSTRAINT "medical_supplier_invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "medical_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_supplier_invoices" ADD CONSTRAINT "medical_supplier_invoices_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "medical_purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_supplier_payments" ADD CONSTRAINT "medical_supplier_payments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "medical_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_supplier_payments" ADD CONSTRAINT "medical_supplier_payments_supplierInvoiceId_fkey" FOREIGN KEY ("supplierInvoiceId") REFERENCES "medical_supplier_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_product_cost_history" ADD CONSTRAINT "medical_product_cost_history_productId_fkey" FOREIGN KEY ("productId") REFERENCES "medical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_product_cost_history" ADD CONSTRAINT "medical_product_cost_history_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "medical_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_stock_batches" ADD CONSTRAINT "medical_stock_batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "medical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_stock_batches" ADD CONSTRAINT "medical_stock_batches_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "medical_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_stock_movements" ADD CONSTRAINT "medical_stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "medical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_stock_movements" ADD CONSTRAINT "medical_stock_movements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "medical_stock_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_stock_movements" ADD CONSTRAINT "medical_stock_movements_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "medical_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotation_requests" ADD CONSTRAINT "medical_quotation_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "medical_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotation_requests" ADD CONSTRAINT "medical_quotation_requests_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "medical_organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotation_requests" ADD CONSTRAINT "medical_quotation_requests_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "medical_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotation_requests" ADD CONSTRAINT "medical_quotation_requests_redistributorId_fkey" FOREIGN KEY ("redistributorId") REFERENCES "medical_redistributors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotation_request_items" ADD CONSTRAINT "medical_quotation_request_items_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "medical_quotation_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotation_request_items" ADD CONSTRAINT "medical_quotation_request_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "medical_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotations" ADD CONSTRAINT "medical_quotations_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "medical_quotation_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotations" ADD CONSTRAINT "medical_quotations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "medical_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotations" ADD CONSTRAINT "medical_quotations_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "medical_organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotations" ADD CONSTRAINT "medical_quotations_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "medical_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotations" ADD CONSTRAINT "medical_quotations_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "medical_payment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotations" ADD CONSTRAINT "medical_quotations_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "medical_document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotations" ADD CONSTRAINT "medical_quotations_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "medical_quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotation_items" ADD CONSTRAINT "medical_quotation_items_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "medical_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotation_items" ADD CONSTRAINT "medical_quotation_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "medical_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotation_events" ADD CONSTRAINT "medical_quotation_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "medical_quotation_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_quotation_events" ADD CONSTRAINT "medical_quotation_events_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "medical_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_instalment_schedules" ADD CONSTRAINT "medical_instalment_schedules_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "medical_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_instalment_schedules" ADD CONSTRAINT "medical_instalment_schedules_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "medical_sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_sales_orders" ADD CONSTRAINT "medical_sales_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "medical_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_sales_orders" ADD CONSTRAINT "medical_sales_orders_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "medical_organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_sales_orders" ADD CONSTRAINT "medical_sales_orders_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "medical_quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_sales_orders" ADD CONSTRAINT "medical_sales_orders_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "medical_payment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_sales_orders" ADD CONSTRAINT "medical_sales_orders_deliveryAddressId_fkey" FOREIGN KEY ("deliveryAddressId") REFERENCES "medical_customer_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_sales_orders" ADD CONSTRAINT "medical_sales_orders_billingAddressId_fkey" FOREIGN KEY ("billingAddressId") REFERENCES "medical_customer_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_sales_orders" ADD CONSTRAINT "medical_sales_orders_posOperatorId_fkey" FOREIGN KEY ("posOperatorId") REFERENCES "medical_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_sales_orders" ADD CONSTRAINT "medical_sales_orders_redistributorId_fkey" FOREIGN KEY ("redistributorId") REFERENCES "medical_redistributors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_sales_order_items" ADD CONSTRAINT "medical_sales_order_items_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "medical_sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_sales_order_items" ADD CONSTRAINT "medical_sales_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "medical_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_payments" ADD CONSTRAINT "medical_payments_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "medical_sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_payment_allocations" ADD CONSTRAINT "medical_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "medical_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_payment_allocations" ADD CONSTRAINT "medical_payment_allocations_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "medical_instalment_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_refunds" ADD CONSTRAINT "medical_refunds_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "medical_sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_financial_transactions" ADD CONSTRAINT "medical_financial_transactions_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "medical_financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_expenses" ADD CONSTRAINT "medical_expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "medical_expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_redistributors" ADD CONSTRAINT "medical_redistributors_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "medical_redistributors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_redistributor_referrals" ADD CONSTRAINT "medical_redistributor_referrals_redistributorId_fkey" FOREIGN KEY ("redistributorId") REFERENCES "medical_redistributors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_redistributor_commissions" ADD CONSTRAINT "medical_redistributor_commissions_redistributorId_fkey" FOREIGN KEY ("redistributorId") REFERENCES "medical_redistributors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_redistributor_commissions" ADD CONSTRAINT "medical_redistributor_commissions_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "medical_sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_redistributor_commissions" ADD CONSTRAINT "medical_redistributor_commissions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "medical_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_redistributor_ledger" ADD CONSTRAINT "medical_redistributor_ledger_redistributorId_fkey" FOREIGN KEY ("redistributorId") REFERENCES "medical_redistributors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_redistributor_payouts" ADD CONSTRAINT "medical_redistributor_payouts_redistributorId_fkey" FOREIGN KEY ("redistributorId") REFERENCES "medical_redistributors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_support_requests" ADD CONSTRAINT "medical_support_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "medical_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "medical_audit_logs" ADD CONSTRAINT "medical_audit_logs_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "medical_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

