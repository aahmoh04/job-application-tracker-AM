-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- GitHub only hands out addresses it has verified, so the accounts it created
-- count as verified from the start. Password accounts stay unverified until
-- sign-up can confirm an address.
UPDATE "User" u
SET "emailVerifiedAt" = u."createdAt"
WHERE u."passwordHash" IS NULL
  AND EXISTS (SELECT 1 FROM "Account" a WHERE a."userId" = u.id);
