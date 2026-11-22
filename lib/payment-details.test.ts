import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import PaymentDetailsDialog, { PaymentDetailsButton } from "@/components/PaymentDetailsDialog";

vi.mock("@/components/Modal", () => ({
  default: ({ title, children }: { title: string; children: React.ReactNode }) =>
    createElement("section", { "aria-label": title }, children),
}));

const payment = {
  displayId: "PAY-202605-0006",
  type: "IN",
  amount: 1100,
  gstAmount: 100,
  method: "UPI",
  date: "2026-05-12T08:00:00.000Z",
  status: "Reversed",
  reference: "UPI-150",
  contact: { name: "Example customer" },
  invoice: { displayId: "INV-0004" },
  notes: "Advance for desk\nSecond line <recorded as text>",
  attachment: null,
};

it("View selects the full payment record even without a receipt", () => {
  const onView = vi.fn();
  const button = PaymentDetailsButton({ payment, onView, className: "" });
  expect(button.props["aria-label"]).toBe("View payment details for PAY-202605-0006");
  button.props.onClick();
  expect(onView).toHaveBeenCalledExactlyOnceWith(payment);
});

it("renders actual transaction details and untruncated notes independently of the receipt", () => {
  const html = renderToStaticMarkup(createElement(PaymentDetailsDialog, {
    payment, onClose: vi.fn(), onViewReceipt: vi.fn(),
  }));
  for (const text of ["Payment details", "PAY-202605-0006", "Reversed", "Example customer",
    "+₹1,200", "Includes ₹100 GST", "UPI-150", "INV-0004", "Description / notes",
    "Advance for desk", "Second line &lt;recorded as text&gt;"]) {
    expect(html).toContain(text);
  }
  expect(html).not.toContain("View receipt");
  expect(html).not.toContain("<img");
});

it("keeps a separate receipt action without trying to load the attached file", () => {
  const html = renderToStaticMarkup(createElement(PaymentDetailsDialog, {
    payment: { ...payment, type: "OUT", notes: "   ", attachment: "/api/uploads/receipts/missing.jpg" },
    onClose: vi.fn(), onViewReceipt: vi.fn(),
  }));
  expect(html).toContain("Money out");
  expect(html).toContain("−₹1,200");
  expect(html).toContain("No description recorded.");
  expect(html).toContain("View receipt");
  expect(html).not.toContain("missing.jpg");
});
