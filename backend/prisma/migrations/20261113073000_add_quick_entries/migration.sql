BEGIN;
-- CreateTable
CREATE TABLE "QuickEntryRequest" (
    "userId" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "contentHash" TEXT NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuickEntryRequest_pkey" PRIMARY KEY ("userId","requestId")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuickEntryRequest_transactionId_key" ON "QuickEntryRequest"("transactionId");

-- AddForeignKey
ALTER TABLE "QuickEntryRequest" ADD CONSTRAINT "QuickEntryRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickEntryRequest" ADD CONSTRAINT "QuickEntryRequest_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuickEntryRequest" ENABLE ROW LEVEL SECURITY;
COMMIT;
