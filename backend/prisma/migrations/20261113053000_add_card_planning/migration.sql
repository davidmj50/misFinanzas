BEGIN;
-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "cardStatementId" TEXT;

-- CreateTable
CREATE TABLE "CardProfile" (
    "accountId" TEXT NOT NULL,
    "creditLimit" DECIMAL(14,2) NOT NULL,
    "closingDay" INTEGER NOT NULL,
    "paymentDay" INTEGER NOT NULL,
    "paymentAccountId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardProfile_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "CardStatement" (
    "id" TEXT NOT NULL,
    "cardAccountId" TEXT NOT NULL,
    "closingDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "plannedPaymentDate" DATE,
    "total" DECIMAL(14,2) NOT NULL,
    "minimumPayment" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardProfile_paymentAccountId_idx" ON "CardProfile"("paymentAccountId");

-- CreateIndex
CREATE INDEX "CardStatement_dueDate_idx" ON "CardStatement"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CardStatement_cardAccountId_closingDate_key" ON "CardStatement"("cardAccountId", "closingDate");

-- CreateIndex
CREATE INDEX "Transfer_cardStatementId_idx" ON "Transfer"("cardStatementId");

-- AddForeignKey
ALTER TABLE "CardProfile" ADD CONSTRAINT "CardProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardProfile" ADD CONSTRAINT "CardProfile_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStatement" ADD CONSTRAINT "CardStatement_cardAccountId_fkey" FOREIGN KEY ("cardAccountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_cardStatementId_fkey" FOREIGN KEY ("cardStatementId") REFERENCES "CardStatement"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "CardProfile" ADD CONSTRAINT "CardProfile_values_check" CHECK ("creditLimit" > 0 AND "closingDay" BETWEEN 1 AND 31 AND "paymentDay" BETWEEN 1 AND 31 AND ("paymentAccountId" IS NULL OR "paymentAccountId" <> "accountId"));
ALTER TABLE "CardStatement" ADD CONSTRAINT "CardStatement_values_check" CHECK ("total" >= 0 AND "minimumPayment" >= 0 AND "minimumPayment" <= "total" AND "dueDate" >= "closingDate" AND ("plannedPaymentDate" IS NULL OR "plannedPaymentDate" >= "closingDate"));
COMMIT;
