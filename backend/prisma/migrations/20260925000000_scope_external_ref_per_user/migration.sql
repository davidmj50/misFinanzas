-- DropIndex
DROP INDEX "Transaction_externalRef_key";

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_userId_externalRef_key" ON "Transaction"("userId", "externalRef");
