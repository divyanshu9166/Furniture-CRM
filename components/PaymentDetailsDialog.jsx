"use client";

import React from "react";
import { Eye, Paperclip } from "lucide-react";
import Modal from "@/components/Modal";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

function formatDate(value, withTime = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return withTime ? `${dateFormat.format(date)} · ${timeFormat.format(date)}` : dateFormat.format(date);
}

export function PaymentDetailsButton({ payment, onView, className }) {
  return (
    <button type="button" onClick={() => onView(payment)} className={className}
      aria-label={`View payment details for ${payment.displayId}`}>
      <Eye className="size-3.5 shrink-0" aria-hidden="true" /> View
    </button>
  );
}

export default function PaymentDetailsDialog({ payment, onClose, onViewReceipt }) {
  const isOut = payment.type === "OUT";
  const gst = payment.gstAmount || 0;
  const fields = [
    ["Customer / payee", payment.customerName?.trim() || payment.contact?.name || "Not recorded"],
    ["Date and time", formatDate(payment.date, true) || "Not recorded"],
    ["Payment method", payment.method],
    ["Reference", payment.reference],
    ["Bank reference", payment.bankRefNumber],
    ["Cheque number", payment.chequeNumber],
    ["Cheque date", formatDate(payment.chequeDate)],
    ["Invoice", payment.invoice?.displayId],
    ["Order", payment.order?.displayId],
    ["Custom order", payment.customOrder?.displayId],
    ["Reconciled on", formatDate(payment.reconciledDate, true)],
    ["Cheque bounce reason", payment.bounceReason],
    ["Reversal reason", payment.reversalReason],
  ];

  return (
    <Modal isOpen onClose={onClose} title="Payment details">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-background p-4">
          <div className="min-w-0">
            <p className="text-xs text-muted">{isOut ? "Money out" : "Money in"}</p>
            <p className={`text-2xl font-bold [overflow-wrap:anywhere] ${isOut ? "text-danger" : "text-success"}`}>
              {isOut ? "−" : "+"}{currency.format(payment.amount + gst)}
            </p>
            {gst > 0 && <p className="mt-1 text-xs text-muted">Includes {currency.format(gst)} GST</p>}
          </div>
          <div className="min-w-0 text-right text-xs">
            <p className="font-mono text-foreground [overflow-wrap:anywhere]">{payment.displayId}</p>
            <p className="mt-1 inline-block rounded-md border border-border bg-surface px-2 py-1 text-muted">
              {payment.status}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <h3 className="text-sm font-semibold text-foreground">Description / notes</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground [overflow-wrap:anywhere]">
            {payment.notes?.trim() || "No description recorded."}
          </p>
        </div>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-3 min-[360px]:grid-cols-2">
          {fields.filter(([, value]) => value).map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm font-medium text-foreground [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
        {payment.attachment && (
          <button type="button" onClick={() => onViewReceipt(payment.attachment)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-accent hover:bg-surface-hover">
            <Paperclip className="size-4" aria-hidden="true" /> View receipt
          </button>
        )}
      </div>
    </Modal>
  );
}
