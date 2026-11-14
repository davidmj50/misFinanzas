BEGIN;
-- CreateEnum
CREATE TYPE "AuthLinkPurpose" AS ENUM ('RESET_PASSWORD', 'VERIFY_EMAIL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AccountSession" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "authVersion" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AccountSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "AuthLinkPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "authVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentInWindow" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AuthLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountSession_userId_revokedAt_expiresAt_idx" ON "AccountSession"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthLink_tokenHash_key" ON "AuthLink"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthLink_expiresAt_idx" ON "AuthLink"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthLink_userId_purpose_key" ON "AuthLink"("userId", "purpose");

-- AddForeignKey
ALTER TABLE "AccountSession" ADD CONSTRAINT "AccountSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthLink" ADD CONSTRAINT "AuthLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Credentials are only accessible through the backend database role.
ALTER TABLE "AccountSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthLink" ENABLE ROW LEVEL SECURITY;
COMMIT;
