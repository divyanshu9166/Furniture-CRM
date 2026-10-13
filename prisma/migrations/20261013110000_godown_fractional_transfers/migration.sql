-- Widen only: every existing PostgreSQL integer is exactly representable as
-- double precision. No transfer, stock, ledger, ID or status is recomputed.
ALTER TABLE "GodownTransferItem"
  ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision;
