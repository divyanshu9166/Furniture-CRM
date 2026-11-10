-- Cost prices can carry paise (e.g. Rs 8.8 per metre, Rs 0.52 per screw).
-- Int -> DOUBLE PRECISION keeps every existing value exactly.
ALTER TABLE "Product" ALTER COLUMN "costPrice" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "ProductBatch" ALTER COLUMN "costPrice" SET DATA TYPE DOUBLE PRECISION;
