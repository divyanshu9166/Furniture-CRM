-- Additive configuration only: no existing contacts or walk-ins are modified.
CREATE TABLE "WalkinRequirementSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "options" TEXT[] NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "WalkinRequirementSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WalkinRequirementSettings_singleton" CHECK ("id" = 1),
    CONSTRAINT "WalkinRequirementSettings_options_count" CHECK (cardinality("options") BETWEEN 1 AND 100),
    CONSTRAINT "WalkinRequirementSettings_revision_positive" CHECK ("revision" > 0)
);
