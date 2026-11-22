CREATE TABLE "UserSectionAccess" (
    "userId" INTEGER NOT NULL,
    "overrides" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserSectionAccess_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "UserSectionAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
