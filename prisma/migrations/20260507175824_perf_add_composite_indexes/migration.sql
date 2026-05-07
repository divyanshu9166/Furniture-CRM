-- Performance Migration: Add composite and covering indexes
-- All indexes use IF NOT EXISTS to be idempotent / safe to re-run

-- Product: search by name, low-stock queries
CREATE INDEX IF NOT EXISTS "Product_name_idx" ON "Product"("name");
CREATE INDEX IF NOT EXISTS "Product_stock_idx" ON "Product"("stock");
CREATE INDEX IF NOT EXISTS "Product_categoryId_stock_idx" ON "Product"("categoryId", "stock");

-- Order: dashboard queries filter by status+date, CRM by contactId+status
CREATE INDEX IF NOT EXISTS "Order_status_date_idx" ON "Order"("status", "date");
CREATE INDEX IF NOT EXISTS "Order_contactId_status_idx" ON "Order"("contactId", "status");

-- Quotation: customer history + billing date-range filters
CREATE INDEX IF NOT EXISTS "Quotation_contactId_status_idx" ON "Quotation"("contactId", "status");
CREATE INDEX IF NOT EXISTS "Quotation_status_date_idx" ON "Quotation"("status", "date");

-- Invoice: billing dashboard unpaid queries, CRM outstanding invoices
CREATE INDEX IF NOT EXISTS "Invoice_paymentStatus_date_idx" ON "Invoice"("paymentStatus", "date");
CREATE INDEX IF NOT EXISTS "Invoice_invoiceStatus_date_idx" ON "Invoice"("invoiceStatus", "date");
CREATE INDEX IF NOT EXISTS "Invoice_contactId_paymentStatus_idx" ON "Invoice"("contactId", "paymentStatus");

-- Attendance: payroll calculation needs staffId+date range scans
CREATE INDEX IF NOT EXISTS "Attendance_staffId_idx" ON "Attendance"("staffId");
CREATE INDEX IF NOT EXISTS "Attendance_staffId_date_idx" ON "Attendance"("staffId", "date");

-- StockLedger: product timeline and godown audit trail
CREATE INDEX IF NOT EXISTS "StockLedger_productId_createdAt_idx" ON "StockLedger"("productId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockLedger_godownId_createdAt_idx" ON "StockLedger"("godownId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockLedger_entryType_idx" ON "StockLedger"("entryType");

-- Notification: fetch unread notifications sorted newest-first
CREATE INDEX IF NOT EXISTS "Notification_read_createdAt_idx" ON "Notification"("read", "createdAt");
