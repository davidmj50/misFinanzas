BEGIN;
-- CreateTable
CREATE TABLE "ExpenseDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentUpload" (
    "userId" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "contentHash" TEXT NOT NULL,
    "transactionId" TEXT,
    "documentIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentUpload_pkey" PRIMARY KEY ("userId","requestId")
);

-- CreateIndex
CREATE INDEX "ExpenseDocument_userId_idx" ON "ExpenseDocument"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseDocument_transactionId_sha256_key" ON "ExpenseDocument"("transactionId", "sha256");

-- CreateIndex
CREATE INDEX "DocumentUpload_transactionId_idx" ON "DocumentUpload"("transactionId");

-- AddForeignKey
ALTER TABLE "ExpenseDocument" ADD CONSTRAINT "ExpenseDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseDocument" ADD CONSTRAINT "ExpenseDocument_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentUpload" ADD CONSTRAINT "DocumentUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentUpload" ADD CONSTRAINT "DocumentUpload_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExpenseDocument" ADD CONSTRAINT "ExpenseDocument_size_check" CHECK ("size" BETWEEN 1 AND 5242880 AND octet_length("data") = "size");
-- Keep ownership/type valid even when a transaction edit races with an upload.
-- Direct Supabase API roles get no access; the backend uses the database owner connection.
ALTER TABLE "ExpenseDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentUpload" ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION "check_expense_document_parent"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "Transaction" WHERE "id" = NEW."transactionId" AND "userId" = NEW."userId" AND "type" = 'EXPENSE' AND "transferId" IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document parent must be an expense owned by the same user' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "expense_document_parent_check" BEFORE INSERT OR UPDATE OF "transactionId", "userId" ON "ExpenseDocument" FOR EACH ROW EXECUTE FUNCTION "check_expense_document_parent"();
CREATE FUNCTION "protect_document_expense"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."type" <> 'EXPENSE' OR NEW."transferId" IS NOT NULL OR NEW."userId" <> OLD."userId") AND EXISTS (SELECT 1 FROM "ExpenseDocument" WHERE "transactionId" = OLD."id") THEN
    RAISE EXCEPTION 'Remove documents before changing expense type or ownership' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "document_expense_type_check" BEFORE UPDATE OF "type", "transferId", "userId" ON "Transaction" FOR EACH ROW EXECUTE FUNCTION "protect_document_expense"();
COMMIT;
