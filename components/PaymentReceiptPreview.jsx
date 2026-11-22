"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { paymentReceipt } from "@/lib/payment-receipt";

export default function PaymentReceiptPreview({ receiptUrl, onClose }) {
  const [failed, setFailed] = useState(false);
  const receipt = paymentReceipt(receiptUrl, window.location.origin);
  return (
    <Modal isOpen onClose={onClose} title="Payment receipt" size="lg">
      {!receipt ? (
        <p role="alert" className="text-sm text-red-600">This receipt link is invalid.</p>
      ) : (
        <div className="space-y-4">
          {receipt.kind === "image" && !failed && (
            <img src={receipt.url} alt="Payment receipt" onError={() => setFailed(true)}
              className="mx-auto max-h-[55dvh] max-w-full rounded-lg object-contain" />
          )}
          {receipt.kind === "pdf" && receipt.localUpload && (
            <iframe title="Payment receipt PDF" src={receipt.url}
              className="hidden h-[55vh] w-full rounded-lg border border-border md:block" />
          )}
          {receipt.kind !== "image" || failed ? (
            <p role={failed ? "alert" : undefined} className="text-sm text-muted">
              {failed ? "This image could not be previewed. Try opening or downloading the original file."
                : "If your app cannot preview this file, download it and open it on your device."}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <a href={receipt.download} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
              {receipt.localUpload ? "Download receipt" : "Open original receipt"}
            </a>
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">Close</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
