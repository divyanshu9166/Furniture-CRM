'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search, Plus, Receipt, CreditCard, Banknote,
  FileText, Printer, ShoppingBag,
  Percent, Calculator, CheckCircle2, Clock, AlertCircle,
  X, Package, User, Phone, Minus, IndianRupee,
  Trash2, Tag, Calendar, Download, Ban,
  ArrowUpRight, ArrowDownRight, TrendingUp,
  RotateCcw, PauseCircle, PlayCircle, ChevronDown,
  ChevronsUpDown, Filter, MoreHorizontal,
  Wallet, BadgeIndianRupee, CircleDollarSign,
  SplitSquareHorizontal, Eye, XCircle,
} from 'lucide-react';
import Modal from '@/components/Modal';
import ReturningCustomerCard from '@/components/ReturningCustomerCard';
import {
  getInvoices, createInvoice, recordPayment,
  cancelInvoice, createCreditNote, finalizeHeldInvoice,
  searchContacts, getInvoiceStats, getCustomerProfile,
} from '@/app/actions/invoices';
import { getProducts } from '@/app/actions/products';
import { getStaff } from '@/app/actions/staff';
import { getStoreSettings } from '@/app/actions/settings';

// ─── CONSTANTS ─────────────────────────────────────────

const paymentMethods = ['Cash', 'UPI', 'Card', 'EMI', 'Bank Transfer', 'Cheque'];

const paymentStatusColors = {
  Paid: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  Partial: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  Pending: 'bg-red-500/10 text-red-700 border-red-500/20',
};

const invoiceStatusColors = {
  ACTIVE: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  CANCELLED: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  REFUNDED: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
};

const paymentMethodIcons = {
  Cash: Banknote,
  UPI: Wallet,
  Card: CreditCard,
  EMI: Calculator,
  'Bank Transfer': CircleDollarSign,
  Cheque: FileText,
};

const quickAmounts = [500, 1000, 2000, 5000, 10000, 20000];

// ─── HELPERS ───────────────────────────────────────────

const formatCurrency = (val) => {
  if (val === 0) return '₹0';
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}K`;
  return `₹${val.toLocaleString('en-IN')}`;
};

const formatFullCurrency = (val) => `₹${val.toLocaleString('en-IN')}`;

// ─── MAIN COMPONENT ───────────────────────────────────

export default function BillingPage() {
  // Data state
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [storeSettings, setStoreSettings] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Tab & filters
  const [tab, setTab] = useState('invoices');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('ACTIVE');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [sortBy, setSortBy] = useState('date-desc');

  // Modals
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // POS state
  const [posItems, setPosItems] = useState([]);
  const [posCustomer, setPosCustomer] = useState({ name: '', phone: '' });
  const [posDiscount, setPosDiscount] = useState(0);
  const [posDiscountType, setPosDiscountType] = useState('flat');
  const [posPayments, setPosPayments] = useState([{ amount: 0, method: 'Cash', reference: '' }]);
  const [posSalesperson, setPosSalesperson] = useState('');
  const [posNotes, setPosNotes] = useState('');
  const [posDueDate, setPosDueDate] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerProfile, setCustomerProfile] = useState(null);
  const [customerProfileLoading, setCustomerProfileLoading] = useState(false);
  const [heldBills, setHeldBills] = useState([]);
  const productSearchRef = useRef(null);
  const customerSearchRef = useRef(null);

  // Payment modal state
  const [paymentModalData, setPaymentModalData] = useState({ amount: '', method: 'Cash', reference: '', notes: '' });
  const [creditNoteData, setCreditNoteData] = useState({ amount: '', reason: '' });

  // ─── DATA LOADING ──────────────────────────────────────

  const loadData = useCallback(async () => {
    const [invRes, prodRes, staffRes, settingsRes, statsRes] = await Promise.all([
      getInvoices(), getProducts(), getStaff(), getStoreSettings(), getInvoiceStats(),
    ]);
    if (invRes.success) {
      setInvoices(invRes.data);
      setHeldBills(invRes.data.filter(i => i.isHeld));
    }
    if (prodRes.success) setProducts(prodRes.data);
    if (staffRes.success) setStaffList(staffRes.data.filter(s => s.status === 'Active'));
    if (settingsRes.success) setStoreSettings(settingsRes.data);
    if (statsRes.success) setStats(statsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (productSearchRef.current && !productSearchRef.current.contains(e.target)) setShowProductDropdown(false);
      if (customerSearchRef.current && !customerSearchRef.current.contains(e.target)) setShowCustomerDropdown(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ─── CUSTOMER SEARCH ───────────────────────────────────

  const handleCustomerSearch = useCallback(async (value, field) => {
    setPosCustomer(prev => ({ ...prev, [field]: value }));
    setCustomerProfile(null);
    setCustomerProfileLoading(false);
    if (value.length >= 2) {
      const res = await searchContacts(value);
      if (res.success && res.data.length > 0) {
        setCustomerSuggestions(res.data);
        setShowCustomerDropdown(true);
      } else {
        setCustomerSuggestions([]);
        setShowCustomerDropdown(false);
        // Auto-lookup on exact 10-digit phone
        if (field === 'phone' && value.replace(/\D/g, '').length === 10) {
          setCustomerProfileLoading(true);
          const profileRes = await getCustomerProfile(value);
          setCustomerProfileLoading(false);
          if (profileRes.success && profileRes.data) setCustomerProfile(profileRes.data);
        }
      }
    } else {
      setShowCustomerDropdown(false);
    }
  }, []);

  const selectCustomer = async (contact) => {
    setPosCustomer({ name: contact.name, phone: contact.phone });
    setShowCustomerDropdown(false);
    setCustomerSuggestions([]);
    setCustomerProfileLoading(true);
    const profileRes = await getCustomerProfile(contact.phone, contact.id);
    setCustomerProfileLoading(false);
    if (profileRes.success) setCustomerProfile(profileRes.data);
  };

  // ─── COMPUTED VALUES ───────────────────────────────────

  const gstRate = storeSettings?.gstRate || 18;

  const filtered = useMemo(() => {
    let result = invoices.filter(inv => {
      const matchesSearch = inv.customer.toLowerCase().includes(search.toLowerCase()) ||
        inv.id.toLowerCase().includes(search.toLowerCase()) ||
        (inv.salesperson || '').toLowerCase().includes(search.toLowerCase()) ||
        inv.phone.includes(search);
      const matchesPaymentStatus = statusFilter === 'All' || inv.paymentStatus === statusFilter;
      const matchesInvoiceStatus = invoiceStatusFilter === 'All' || inv.invoiceStatus === invoiceStatusFilter;
      const matchesDateFrom = !dateRange.from || inv.date >= dateRange.from;
      const matchesDateTo = !dateRange.to || inv.date <= dateRange.to;
      return matchesSearch && matchesPaymentStatus && matchesInvoiceStatus && matchesDateFrom && matchesDateTo;
    });

    // Sort
    switch (sortBy) {
      case 'date-asc': result.sort((a, b) => a.date.localeCompare(b.date)); break;
      case 'total-desc': result.sort((a, b) => b.total - a.total); break;
      case 'total-asc': result.sort((a, b) => a.total - b.total); break;
      case 'balance-desc': result.sort((a, b) => b.balanceDue - a.balanceDue); break;
      default: result.sort((a, b) => b.date.localeCompare(a.date)); break;
    }
    return result;
  }, [search, statusFilter, invoiceStatusFilter, dateRange, sortBy, invoices]);

  // POS calculations
  const posSubtotal = posItems.reduce((s, item) => s + item.price * item.qty, 0);
  const posDiscountAmount = posDiscountType === 'percent' ? Math.round(posSubtotal * posDiscount / 100) : Math.min(posDiscount, posSubtotal);
  const posAfterDiscount = Math.max(0, posSubtotal - posDiscountAmount);
  const posTotalGst = Math.round(posAfterDiscount * gstRate / 100);
  const posCgst = Math.round(posTotalGst / 2);
  const posSgst = posTotalGst - posCgst;
  const posTotal = posAfterDiscount + posTotalGst;
  const posTotalPayments = posPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const posAdvancePaid = Math.min(posTotalPayments, posTotal);
  const posBalanceDue = Math.max(0, posTotal - posTotalPayments);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(productSearch.toLowerCase())
  );

  // ─── POS ACTIONS ───────────────────────────────────────

  const addToPOS = (product) => {
    const existing = posItems.find(i => i.id === product.id);
    if (existing) {
      if (existing.qty < product.stock) {
        setPosItems(posItems.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
      }
    } else {
      setPosItems([...posItems, {
        id: product.id, name: product.name, sku: product.sku,
        price: product.price, qty: 1, stock: product.stock, category: product.category,
      }]);
    }
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const updateQty = (id, qty) => {
    if (qty < 1) return setPosItems(posItems.filter(i => i.id !== id));
    const item = posItems.find(i => i.id === id);
    if (item && qty <= item.stock) {
      setPosItems(posItems.map(i => i.id === id ? { ...i, qty } : i));
    }
  };

  const updateItemPrice = (id, newPrice) => {
    setPosItems(posItems.map(i => i.id === id ? { ...i, price: Math.max(0, newPrice) } : i));
  };

  const clearPOS = () => {
    setPosItems([]);
    setPosCustomer({ name: '', phone: '' });
    setCustomerProfile(null);
    setPosDiscount(0);
    setPosDiscountType('flat');
    setPosPayments([{ amount: 0, method: 'Cash', reference: '' }]);
    setPosSalesperson('');
    setPosNotes('');
    setPosDueDate('');
  };

  // Split payment management
  const addPaymentSplit = () => {
    setPosPayments([...posPayments, { amount: 0, method: 'UPI', reference: '' }]);
  };

  const updatePaymentSplit = (index, field, value) => {
    setPosPayments(posPayments.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const removePaymentSplit = (index) => {
    if (posPayments.length === 1) return;
    setPosPayments(posPayments.filter((_, i) => i !== index));
  };

  // Auto-fill first payment amount when total changes (only if user hasn't manually edited)
  const paymentAutoFillRef = useRef(true);
  useEffect(() => {
    if (posPayments.length === 1 && posTotal > 0 && paymentAutoFillRef.current) {
      setPosPayments([{ ...posPayments[0], amount: posTotal }]);
    }
  }, [posTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── GENERATE INVOICE ──────────────────────────────────

  const handleGenerateInvoice = async (isHeld = false) => {
    if (posItems.length === 0 || !posCustomer.name || !posCustomer.phone) return;
    if (!isHeld && posTotalPayments === 0) return;
    setSubmitting(true);
    try {
      const paymentsData = isHeld
        ? [{ amount: 0, method: 'Cash' }]
        : posPayments.filter(p => p.amount > 0).map(p => ({
            amount: Number(p.amount),
            method: p.method,
            reference: p.reference || undefined,
          }));

      if (!isHeld && paymentsData.length === 0) {
        alert('Please enter at least one payment amount');
        setSubmitting(false);
        return;
      }

      const res = await createInvoice({
        customer: posCustomer.name,
        phone: posCustomer.phone,
        items: posItems.map(i => ({ productId: i.id, name: i.name, sku: i.sku || '', quantity: i.qty, price: i.price })),
        discount: posDiscount,
        discountType: posDiscountType === 'flat' ? 'flat' : 'percent',
        payments: paymentsData,
        salespersonId: posSalesperson ? parseInt(posSalesperson) : undefined,
        notes: posNotes || undefined,
        dueDate: posDueDate || undefined,
        isHeld,
      });
      if (res.success) {
        clearPOS();
        if (!isHeld) setTab('invoices');
        await loadData();
      } else {
        alert(res.error || 'Failed to create invoice');
      }
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── RECORD PAYMENT (Modal) ────────────────────────────

  const handleRecordPayment = async () => {
    if (!selectedInvoice || !paymentModalData.amount) return;
    setSubmitting(true);
    try {
      const res = await recordPayment({
        invoiceId: selectedInvoice.dbId,
        amount: Number(paymentModalData.amount),
        method: paymentModalData.method,
        reference: paymentModalData.reference || undefined,
        notes: paymentModalData.notes || undefined,
      });
      if (res.success) {
        setShowPaymentModal(false);
        setPaymentModalData({ amount: '', method: 'Cash', reference: '', notes: '' });
        await loadData();
        // Refresh selected invoice
        const updated = (await getInvoices()).data?.find(i => i.dbId === selectedInvoice.dbId);
        if (updated) setSelectedInvoice(updated);
      } else {
        alert(res.error || 'Failed to record payment');
      }
    } catch {
      alert('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── CANCEL INVOICE ────────────────────────────────────

  const handleCancelInvoice = async () => {
    if (!selectedInvoice) return;
    setSubmitting(true);
    try {
      const res = await cancelInvoice(selectedInvoice.dbId);
      if (res.success) {
        setShowCancelConfirm(false);
        setSelectedInvoice(null);
        await loadData();
      } else {
        alert(res.error || 'Failed to cancel invoice');
      }
    } catch {
      alert('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── CREATE CREDIT NOTE ────────────────────────────────

  const handleCreateCreditNote = async () => {
    if (!selectedInvoice || !creditNoteData.amount || !creditNoteData.reason) return;
    setSubmitting(true);
    try {
      const res = await createCreditNote({
        invoiceId: selectedInvoice.dbId,
        amount: Number(creditNoteData.amount),
        reason: creditNoteData.reason,
      });
      if (res.success) {
        setShowCreditNoteModal(false);
        setCreditNoteData({ amount: '', reason: '' });
        await loadData();
        const updated = (await getInvoices()).data?.find(i => i.dbId === selectedInvoice.dbId);
        if (updated) setSelectedInvoice(updated);
      } else {
        alert(res.error || 'Failed to create credit note');
      }
    } catch {
      alert('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── FINALIZE HELD BILL ────────────────────────────────

  const handleFinalizeHeld = async (inv) => {
    setSubmitting(true);
    try {
      const res = await finalizeHeldInvoice(inv.dbId);
      if (res.success) await loadData();
      else alert(res.error || 'Failed to finalize');
    } catch {
      alert('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── EXPORT CSV ────────────────────────────────────────

  const handleExportCSV = () => {
    const headers = ['Invoice ID', 'Date', 'Customer', 'Phone', 'Items', 'Subtotal', 'Discount', 'GST', 'CGST', 'SGST', 'Total', 'Amount Paid', 'Balance Due', 'Payment Method', 'Payment Status', 'Invoice Status', 'Salesperson', 'Notes'];
    const rows = filtered.map(inv => [
      inv.id, inv.date, `"${inv.customer}"`, inv.phone,
      `"${inv.items.map(i => `${i.name} x${i.qty}`).join(', ')}"`,
      inv.subtotal, inv.discount, inv.gst, inv.cgst, inv.sgst, inv.total,
      inv.amountPaid, inv.balanceDue, inv.paymentMethod, inv.paymentStatus,
      inv.invoiceStatus, inv.salesperson || '', `"${inv.notes || ''}"`,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── PRINT INVOICE ─────────────────────────────────────

  const handlePrintInvoice = (inv) => {
    const store = storeSettings || {};
    const printContent = `
      <html><head><title>Invoice ${inv.id}</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e5e5e5; padding-bottom: 20px; margin-bottom: 20px; }
        .store-name { font-size: 22px; font-weight: 700; color: #b45309; }
        .invoice-id { font-size: 18px; font-weight: 700; text-align: right; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
        .meta-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { text-align: left; padding: 10px 8px; border-bottom: 2px solid #e5e5e5; font-size: 11px; text-transform: uppercase; color: #888; }
        td { padding: 10px 8px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
        .totals { margin-left: auto; width: 300px; }
        .totals .row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
        .totals .grand { border-top: 2px solid #1a1a1a; padding-top: 10px; font-size: 16px; font-weight: 700; }
        .totals .paid { color: #15803d; }
        .totals .due { color: #b91c1c; font-weight: 600; }
        .payments { margin-top: 16px; padding: 12px; background: #f9fafb; border-radius: 8px; }
        .payments h4 { font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 8px; letter-spacing: 0.5px; }
        .payments .entry { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; }
        .footer { border-top: 1px solid #e5e5e5; padding-top: 16px; margin-top: 24px; font-size: 11px; color: #888; text-align: center; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      <div class="header">
        <div><div class="store-name">${store.storeName || 'Furniture Store'}</div>
        <div style="font-size:12px;color:#888;margin-top:4px">${store.address || ''}</div>
        <div style="font-size:12px;color:#888">${store.phone || ''} ${store.email ? '· ' + store.email : ''}</div>
        ${store.gstNumber ? `<div style="font-size:12px;color:#888;margin-top:2px">GSTIN: ${store.gstNumber}</div>` : ''}</div>
        <div><div class="invoice-id">${inv.id}</div>
        <div style="font-size:12px;color:#888;text-align:right;margin-top:4px">${inv.date}${inv.time ? ' · ' + inv.time : ''}</div>
        ${inv.invoiceStatus !== 'ACTIVE' ? `<div style="font-size:12px;color:#b91c1c;text-align:right;font-weight:600;margin-top:4px">${inv.invoiceStatus}</div>` : ''}</div>
      </div>
      <div class="meta">
        <div><div class="meta-label">Bill To</div><div style="font-weight:600;margin-top:4px">${inv.customer}</div><div style="font-size:12px;color:#888">${inv.phone || ''}</div></div>
        <div style="text-align:right"><div class="meta-label">Payment</div><div style="margin-top:4px">${inv.paymentMethod} · <strong>${inv.paymentStatus}</strong></div>
        ${inv.salesperson ? `<div style="font-size:12px;color:#888;margin-top:2px">Salesperson: ${inv.salesperson}</div>` : ''}
        ${inv.dueDate ? `<div style="font-size:12px;color:#888;margin-top:2px">Due: ${inv.dueDate}</div>` : ''}</div>
      </div>
      <table><thead><tr><th>#</th><th>Item</th><th>SKU</th><th>HSN</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead><tbody>
      ${inv.items.map((item, i) => `<tr><td>${i + 1}</td><td>${item.name}</td><td style="font-family:monospace;font-size:11px;color:#888">${item.sku || '-'}</td><td style="font-size:11px;color:#888">${item.hsnCode || '-'}</td><td style="text-align:center">${item.qty}</td><td style="text-align:right">₹${item.price.toLocaleString('en-IN')}</td><td style="text-align:right;font-weight:500">₹${(item.price * item.qty).toLocaleString('en-IN')}</td></tr>`).join('')}
      </tbody></table>
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>₹${inv.subtotal.toLocaleString('en-IN')}</span></div>
        ${inv.discount > 0 ? `<div class="row"><span>Discount</span><span style="color:#16a34a">-₹${inv.discount.toLocaleString('en-IN')}</span></div>` : ''}
        <div class="row"><span>CGST (${gstRate / 2}%)</span><span>₹${inv.cgst.toLocaleString('en-IN')}</span></div>
        <div class="row"><span>SGST (${gstRate / 2}%)</span><span>₹${inv.sgst.toLocaleString('en-IN')}</span></div>
        <div class="row grand"><span>Total</span><span>₹${inv.total.toLocaleString('en-IN')}</span></div>
        <div class="row paid"><span>Amount Paid</span><span>₹${inv.amountPaid.toLocaleString('en-IN')}</span></div>
        ${inv.balanceDue > 0 ? `<div class="row due"><span>Balance Due</span><span>₹${inv.balanceDue.toLocaleString('en-IN')}</span></div>` : ''}
      </div>
      ${inv.payments && inv.payments.length > 0 ? `<div class="payments"><h4>Payment History</h4>${inv.payments.map(p => `<div class="entry"><span>${p.method}${p.reference ? ' · ' + p.reference : ''} — ${p.date}</span><span>₹${p.amount.toLocaleString('en-IN')}</span></div>`).join('')}</div>` : ''}
      ${inv.notes ? `<div style="margin-top:16px;padding:12px;background:#f9fafb;border-radius:8px;font-size:12px;color:#666">Notes: ${inv.notes}</div>` : ''}
      <div class="footer">Thank you for your purchase!</div>
      </body></html>`;
    const w = window.open('', '_blank', 'width=800,height=900');
    w.document.write(printContent);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  // ─── LOADING STATE ─────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-surface rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-surface rounded-2xl" />)}</div>
        <div className="h-64 bg-surface rounded-2xl" />
      </div>
    );
  }

  // ─── RENDER ────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-[fade-in_0.3s_ease]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing & POS</h1>
          <p className="text-sm text-muted mt-1">
            {stats ? `${stats.todayCount} invoices today · ${formatCurrency(stats.todayRevenue)} collected` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {heldBills.length > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 text-amber-700 rounded-xl text-xs font-medium border border-amber-500/20">
              <PauseCircle className="w-3.5 h-3.5" /> {heldBills.length} held
            </span>
          )}
          <button onClick={handleExportCSV} className="flex items-center gap-2 px-3 py-2.5 bg-surface border border-border hover:border-accent/30 rounded-xl text-sm font-medium text-muted hover:text-accent transition-all">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => { setTab('pos'); clearPOS(); }} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">
            <Plus className="w-4 h-4" /> New Invoice
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-surface rounded-xl border border-border p-0.5 w-fit">
        {[
          { key: 'invoices', label: 'Invoices', icon: Receipt, count: invoices.filter(i => i.invoiceStatus === 'ACTIVE').length },
          { key: 'pos', label: 'POS', icon: Calculator },
          { key: 'held', label: 'Held Bills', icon: PauseCircle, count: heldBills.length },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
            {t.count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tab === t.key ? 'bg-white/20' : 'bg-accent/10 text-accent'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════
           INVOICES TAB
         ════════════════════════════════════════════════════════ */}
      {tab === 'invoices' && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Billed', value: formatCurrency(stats?.totalBilled || 0), icon: Receipt, color: 'accent', sub: `${invoices.filter(i => i.invoiceStatus === 'ACTIVE').length} invoices` },
              { label: 'Collected', value: formatCurrency(stats?.totalCollected || 0), icon: CheckCircle2, color: 'success', sub: stats?.monthGrowth > 0 ? `+${stats.monthGrowth}% vs last month` : stats?.monthGrowth < 0 ? `${stats.monthGrowth}% vs last month` : 'This month' },
              { label: 'Pending Dues', value: formatCurrency(stats?.totalPending || 0), icon: Clock, color: 'warning', sub: `${stats?.overdueCount || 0} invoices due` },
              { label: 'Today\'s Revenue', value: formatCurrency(stats?.todayRevenue || 0), icon: TrendingUp, color: 'teal', sub: `${stats?.todayCount || 0} transactions` },
            ].map((s, i) => (
              <div key={i} className="glass-card p-4 flex items-center gap-3">
                <div className={`p-2.5 rounded-xl bg-${s.color}-light`}><s.icon className={`w-5 h-5 text-${s.color}`} /></div>
                <div>
                  <p className="text-xs text-muted">{s.label}</p>
                  <p className={`text-lg font-bold text-${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-muted">{s.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filters Bar */}
          <div className="glass-card p-4">
            <div className="flex flex-col gap-3">
              {/* Row 1: Search + Payment Status (Mobile Only) */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input type="search" autoComplete="off" placeholder="Search by customer, phone, invoice ID, or salesperson..." value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-xl border border-border text-sm focus:ring-2 focus:ring-accent/30 focus:border-accent/50 outline-none transition-all" />
                </div>
                <div className="flex sm:hidden overflow-x-auto pb-1 items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted font-semibold flex-shrink-0">Payment</span>
                  {['All', 'Paid', 'Partial', 'Pending'].map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${statusFilter === s ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-foreground hover:bg-surface-hover border border-transparent hover:border-border'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {/* Row 2: Invoice Status + Date Range + Sort */}
              <div className="flex flex-col xl:flex-row gap-3 items-start xl:items-center justify-between">
                <div className="flex overflow-x-auto pb-1 items-center gap-2 w-full xl:w-auto">
                  <span className="text-[10px] uppercase tracking-wider text-muted font-semibold flex-shrink-0">Status</span>
                  {['All', 'ACTIVE', 'CANCELLED', 'REFUNDED'].map(s => (
                    <button key={s} onClick={() => setInvoiceStatusFilter(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${invoiceStatusFilter === s ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-foreground hover:bg-surface-hover border border-transparent hover:border-border'}`}>
                      {s === 'ACTIVE' ? 'Active' : s === 'CANCELLED' ? 'Cancelled' : s === 'REFUNDED' ? 'Refunded' : s}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 justify-end w-full xl:w-auto">
                  <div className="flex items-center bg-surface border border-border rounded-xl focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/30 transition-all overflow-hidden h-[34px] flex-shrink-0">
                    <div className="pl-3 pr-2 flex items-center bg-surface-hover/50 h-full border-r border-border/50 text-muted">
                      <Calendar className="w-3.5 h-3.5" />
                    </div>
                    <input type="date" title="Start Date" value={dateRange.from} onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                      className="px-2 pr-1 py-1.5 bg-transparent text-xs text-foreground focus:outline-none min-w-[120px]" />
                    <span className="text-[11px] font-medium text-muted px-1.5 bg-surface-hover/30 h-full flex items-center">to</span>
                    <div className="pl-2 pr-2 flex items-center bg-surface-hover/50 h-full border-r border-l border-border/50 text-muted">
                      <Calendar className="w-3.5 h-3.5" />
                    </div>
                    <input type="date" title="End Date" value={dateRange.to} onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                      className="px-2 pr-1 py-1.5 bg-transparent text-xs text-foreground focus:outline-none min-w-[120px]" />
                    {(dateRange.from || dateRange.to) && (
                      <button onClick={() => setDateRange({ from: '', to: '' })} className="px-2.5 h-full flex items-center hover:bg-red-500/10 hover:text-red-700 text-muted transition-colors border-l border-border/50">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                    className="px-3 py-1.5 bg-surface border border-border rounded-xl text-xs focus:outline-none focus:border-accent/50 h-[34px] min-w-[130px]">
                    <option value="date-desc">Newest first</option>
                    <option value="date-asc">Oldest first</option>
                    <option value="total-desc">Highest amount</option>
                    <option value="total-asc">Lowest amount</option>
                    <option value="balance-desc">Most due</option>
                  </select>
                </div>
              </div>
              {/* Row 3: Payment Status - Desktop Only */}
              <div className="hidden sm:flex items-center gap-2 mt-1">
                <span className="text-[10px] uppercase tracking-wider text-muted font-semibold flex-shrink-0">Payment</span>
                {['All', 'Paid', 'Partial', 'Pending'].map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${statusFilter === s ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-foreground hover:bg-surface-hover border border-transparent hover:border-border'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Invoice Table */}
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Invoice ID</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inv => {
                    const MethodIcon = paymentMethodIcons[inv.paymentMethod] || CreditCard;
                    const isCancelled = inv.invoiceStatus === 'CANCELLED' || inv.invoiceStatus === 'REFUNDED';
                    return (
                      <tr key={inv.id} className={`cursor-pointer ${isCancelled ? 'opacity-50' : ''}`} onClick={() => setSelectedInvoice(inv)}>
                        <td>
                          <span className="font-mono text-accent font-medium">{inv.id}</span>
                          {inv.isHeld && <span className="ml-1.5 text-[9px] bg-amber-500/10 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">HELD</span>}
                        </td>
                        <td>
                          <div>
                            <p className="font-medium text-foreground">{inv.customer}</p>
                            <p className="text-xs text-muted">{inv.phone}</p>
                          </div>
                        </td>
                        <td className="text-sm max-w-[180px] truncate">{inv.items.map(i => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`).join(', ')}</td>
                        <td className="font-semibold text-foreground">{formatFullCurrency(inv.total)}</td>
                        <td className="text-success font-medium">{formatFullCurrency(inv.amountPaid)}</td>
                        <td className={inv.balanceDue > 0 ? 'text-red-600 font-semibold' : 'text-muted'}>{inv.balanceDue > 0 ? formatFullCurrency(inv.balanceDue) : '—'}</td>
                        <td>
                          <span className="flex items-center gap-1.5 text-xs text-muted">
                            <MethodIcon className="w-3.5 h-3.5" /> {inv.paymentMethod}
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-col gap-1">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border w-fit ${paymentStatusColors[inv.paymentStatus]}`}>{inv.paymentStatus}</span>
                            {isCancelled && <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border w-fit ${invoiceStatusColors[inv.invoiceStatus]}`}>{inv.invoiceStatus}</span>}
                          </div>
                        </td>
                        <td className="text-muted whitespace-nowrap">{inv.date}</td>
                        <td>
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button onClick={() => handlePrintInvoice(inv)}
                              className="p-1.5 rounded-lg hover:bg-accent/10 text-muted hover:text-accent transition-colors" title="Print">
                              <Printer className="w-4 h-4" />
                            </button>
                            {inv.balanceDue > 0 && inv.invoiceStatus === 'ACTIVE' && (
                              <button onClick={() => { setSelectedInvoice(inv); setPaymentModalData({ ...paymentModalData, amount: inv.balanceDue }); setShowPaymentModal(true); }}
                                className="p-1.5 rounded-lg hover:bg-success/10 text-muted hover:text-success transition-colors" title="Record Payment">
                                <BadgeIndianRupee className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="text-center py-10 text-muted text-sm">No invoices match your filters</div>
            )}
            <div className="px-4 py-3 border-t border-border flex items-center justify-between text-xs text-muted">
              <span>Showing {filtered.length} of {invoices.length} invoices</span>
              <span>Total: {formatFullCurrency(filtered.reduce((s, i) => s + i.total, 0))} · Due: {formatFullCurrency(filtered.reduce((s, i) => s + i.balanceDue, 0))}</span>
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════
           HELD BILLS TAB
         ════════════════════════════════════════════════════════ */}
      {tab === 'held' && (
        <div className="space-y-4">
          {heldBills.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <PauseCircle className="w-12 h-12 mx-auto mb-3 text-muted/20" />
              <p className="text-sm font-medium text-muted">No held bills</p>
              <p className="text-xs text-muted mt-1">Bills you park from the POS will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {heldBills.map(inv => (
                <div key={inv.dbId} className="glass-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-accent font-semibold text-sm">{inv.id}</span>
                    <span className="text-xs text-muted">{inv.date} {inv.time}</span>
                  </div>
                  <div className="mb-3">
                    <p className="font-medium text-foreground">{inv.customer}</p>
                    <p className="text-xs text-muted">{inv.phone}</p>
                  </div>
                  <div className="text-xs text-muted mb-3">
                    {inv.items.map(i => `${i.name} x${i.qty}`).join(', ')}
                  </div>
                  <div className="flex items-center justify-between mb-4 pt-3 border-t border-border">
                    <span className="text-sm text-muted">Total</span>
                    <span className="text-lg font-bold text-accent">{formatFullCurrency(inv.total)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleFinalizeHeld(inv)} disabled={submitting}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50">
                      <PlayCircle className="w-3.5 h-3.5" /> Finalize
                    </button>
                    <button onClick={() => { setSelectedInvoice(inv); setShowCancelConfirm(true); }}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 bg-surface border border-border text-muted rounded-xl text-xs font-medium hover:text-red-600 hover:border-red-600/30 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           POS TAB
         ════════════════════════════════════════════════════════ */}
      {tab === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Left: Product Search + Catalog + Cart (3 cols) */}
          <div className="lg:col-span-3 space-y-5">
            {/* Product Search with Dropdown */}
            <div className="glass-card p-5" ref={productSearchRef}>
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Package className="w-4 h-4 text-accent" /> Add Products
              </h3>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input type="search" autoComplete="off" placeholder="Search by product name, SKU, or category..."
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                  onFocus={() => setShowProductDropdown(true)}
                  className="w-full pl-10 pr-4 py-3 bg-surface rounded-xl border border-border text-sm focus:ring-2 focus:ring-accent/30 focus:border-accent/50 outline-none transition-all" />
              </div>
              {/* Search results dropdown — shows on focus (all products) OR on type (filtered) */}
              {showProductDropdown && (
                <div className="mt-2 bg-surface border border-border rounded-xl shadow-lg max-h-[300px] overflow-y-auto z-20 relative">
                  {filteredProducts.filter(p => p.stock > 0).slice(0, 12).map(p => {
                    const inCart = posItems.find(i => i.id === p.id);
                    return (
                      <button key={p.id} onClick={() => addToPOS(p)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors text-left border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center overflow-hidden flex-shrink-0">
                            {p.image && p.image.includes('/') ? (
                              <img src={p.image.split(',')[0]} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-5 h-5 text-muted/30" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                            <p className="text-xs text-muted mt-0.5">{p.category} · <span className="font-mono">{p.sku}</span> · <span className={p.stock <= 5 ? 'text-red-600 font-medium' : ''}>{p.stock} in stock</span></p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <span className="text-sm font-semibold text-accent">{formatFullCurrency(p.price)}</span>
                          {inCart && <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full font-medium">x{inCart.qty}</span>}
                          <Plus className="w-4 h-4 text-accent/50" />
                        </div>
                      </button>
                    );
                  })}
                  {filteredProducts.filter(p => p.stock > 0).length === 0 && (
                    <p className="text-center text-muted text-xs py-8">No products found in stock</p>
                  )}
                </div>
              )}
            </div>

            {/* Quick Product Grid — always visible for fast selection */}
            {!showProductDropdown && (
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-accent" /> Quick Select
                  </h3>
                  <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">
                    {products.filter(p => p.stock > 0).length} products available
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[320px] overflow-y-auto pr-1">
                  {products.filter(p => p.stock > 0).slice(0, 18).map(p => {
                    const inCart = posItems.find(i => i.id === p.id);
                    return (
                      <button key={p.id} onClick={() => addToPOS(p)}
                        className={`relative flex flex-col items-start p-3.5 rounded-xl border transition-all text-left ${inCart ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface hover:border-accent/30 hover:bg-surface-hover'}`}>
                        <div className="flex items-center gap-2.5 w-full mb-2">
                          <div className="w-9 h-9 rounded-lg bg-surface-hover flex items-center justify-center overflow-hidden flex-shrink-0">
                            {p.image && p.image.includes('/') ? (
                              <img src={p.image.split(',')[0]} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-4 h-4 text-muted/30" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate leading-tight">{p.name}</p>
                            <p className="text-[10px] text-muted font-mono mt-0.5">{p.sku}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between w-full">
                          <span className="text-sm font-bold text-accent">{formatFullCurrency(p.price)}</span>
                          <span className={`text-[10px] ${p.stock <= 5 ? 'text-red-600 font-medium' : 'text-muted'}`}>{p.stock} left</span>
                        </div>
                        {inCart && (
                          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-accent text-white rounded-full text-[10px] font-bold flex items-center justify-center">{inCart.qty}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {products.filter(p => p.stock > 0).length === 0 && (
                  <div className="text-center py-10 text-muted">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No products in stock</p>
                  </div>
                )}
              </div>
            )}

            {/* Cart Items */}
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-accent" /> Cart
                  {posItems.length > 0 && (
                    <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">
                      {posItems.length} {posItems.length === 1 ? 'item' : 'items'} · {posItems.reduce((s, i) => s + i.qty, 0)} units
                    </span>
                  )}
                </h3>
                {posItems.length > 0 && (
                  <button onClick={clearPOS} className="text-xs text-red-600 hover:text-red-700 font-medium transition-colors flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Clear All
                  </button>
                )}
              </div>

              {posItems.length === 0 ? (
                <div className="text-center py-10 text-muted">
                  <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm font-medium">Cart is empty</p>
                  <p className="text-xs mt-1">Click products above or search to add items</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-12 gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-muted font-semibold border-b border-border">
                    <div className="col-span-5">Product</div>
                    <div className="col-span-2 text-center">Rate</div>
                    <div className="col-span-2 text-center">Qty</div>
                    <div className="col-span-2 text-right">Amount</div>
                    <div className="col-span-1"></div>
                  </div>
                  {posItems.map(item => (
                    <div key={item.id} className="grid grid-cols-12 gap-3 items-center bg-surface rounded-xl p-3">
                      <div className="col-span-5 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                        <p className="text-[10px] text-muted font-mono mt-0.5">{item.sku} · {item.category}</p>
                      </div>
                      <div className="col-span-2">
                        <input type="number" value={item.price} min="0"
                          onChange={e => updateItemPrice(item.id, parseInt(e.target.value) || 0)}
                          className="w-full text-center text-sm font-medium bg-transparent border border-border rounded-lg py-1.5 focus:border-accent/50 outline-none" />
                      </div>
                      <div className="col-span-2 flex items-center justify-center gap-1">
                        <button onClick={() => updateQty(item.id, item.qty - 1)} className="w-7 h-7 rounded-lg bg-surface-hover border border-border flex items-center justify-center text-muted hover:text-foreground transition-colors">
                          <Minus className="w-3 h-3" />
                        </button>
                        <input type="number" value={item.qty} min="1" max={item.stock}
                          onChange={e => updateQty(item.id, parseInt(e.target.value) || 1)}
                          className="w-10 text-center text-sm font-semibold bg-transparent border border-border rounded-lg py-1.5 focus:border-accent/50 outline-none" />
                        <button onClick={() => updateQty(item.id, item.qty + 1)} className="w-7 h-7 rounded-lg bg-surface-hover border border-border flex items-center justify-center text-muted hover:text-foreground transition-colors">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="col-span-2 text-right">
                        <p className="text-sm font-semibold text-foreground">{formatFullCurrency(item.price * item.qty)}</p>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button onClick={() => setPosItems(posItems.filter(i => i.id !== item.id))} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-600 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {/* Cart subtotal bar */}
                  <div className="flex items-center justify-between px-3 pt-3 border-t border-border">
                    <span className="text-xs text-muted font-medium">{posItems.reduce((s, i) => s + i.qty, 0)} units</span>
                    <span className="text-sm font-bold text-foreground">Subtotal: {formatFullCurrency(posSubtotal)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Bill Details & Summary (2 cols) */}
          <div className="lg:col-span-2 space-y-5">
            {/* Customer with Auto-complete */}
            <div className="glass-card p-5" ref={customerSearchRef}>
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-accent" /> Customer Details
              </h3>
              <div className="space-y-3">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                  <input type="text" placeholder="Customer name *" value={posCustomer.name}
                    onChange={e => handleCustomerSearch(e.target.value, 'name')}
                    className="w-full pl-9 pr-4 py-3 bg-surface border border-border rounded-xl text-sm placeholder:text-muted focus:outline-none focus:border-accent/50" />
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                  <input type="tel" placeholder="Phone number *" value={posCustomer.phone}
                    onChange={e => handleCustomerSearch(e.target.value, 'phone')}
                    className="w-full pl-9 pr-4 py-3 bg-surface border border-border rounded-xl text-sm placeholder:text-muted focus:outline-none focus:border-accent/50" />
                </div>
                {/* Customer suggestions dropdown */}
                {showCustomerDropdown && customerSuggestions.length > 0 && (
                  <div className="bg-surface border border-border rounded-xl shadow-lg max-h-[180px] overflow-y-auto">
                    {customerSuggestions.map(c => (
                      <button key={c.id} onClick={() => selectCustomer(c)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors text-left border-b border-border/50 last:border-0">
                        <User className="w-4 h-4 text-muted flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                          <p className="text-xs text-muted">{c.phone}{c.email ? ` · ${c.email}` : ''}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Returning customer banner */}
                <ReturningCustomerCard
                  profile={customerProfile}
                  loading={customerProfileLoading}
                  onApplyDiscount={(value, type) => {
                    setPosDiscount(value);
                    setPosDiscountType(type === 'percent' ? 'percent' : 'flat');
                  }}
                />
              </div>
            </div>

            {/* Salesperson */}
            {staffList.length > 0 && (
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Salesperson</h3>
                <select value={posSalesperson} onChange={e => setPosSalesperson(e.target.value)}
                  className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-accent/50">
                  <option value="">— None —</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.name} — {s.role}</option>)}
                </select>
              </div>
            )}

            {/* Discount */}
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Tag className="w-4 h-4 text-accent" /> Discount
              </h3>
              <div className="flex gap-2 mb-3">
                <button onClick={() => setPosDiscountType('flat')} className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all border ${posDiscountType === 'flat' ? 'bg-accent text-white border-accent' : 'bg-surface border-border text-muted hover:text-foreground'}`}>
                  <IndianRupee className="w-3 h-3 inline -mt-0.5 mr-0.5" /> Flat
                </button>
                <button onClick={() => setPosDiscountType('percent')} className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all border ${posDiscountType === 'percent' ? 'bg-accent text-white border-accent' : 'bg-surface border-border text-muted hover:text-foreground'}`}>
                  <Percent className="w-3 h-3 inline -mt-0.5 mr-0.5" /> Percent
                </button>
              </div>
              <input type="number" min="0" max={posDiscountType === 'percent' ? 100 : posSubtotal}
                placeholder={posDiscountType === 'percent' ? 'Enter %' : 'Enter amount'}
                value={posDiscount || ''} onChange={e => setPosDiscount(Number(e.target.value) || 0)}
                className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm placeholder:text-muted focus:outline-none focus:border-accent/50" />
              {posDiscountAmount > 0 && (
                <p className="text-xs text-success mt-2.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Saving {formatFullCurrency(posDiscountAmount)}
                </p>
              )}
            </div>

            {/* Split Payments */}
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-accent" /> Payment
                </h3>
                <button onClick={addPaymentSplit} className="text-xs text-accent hover:text-accent-hover font-medium flex items-center gap-1 transition-colors">
                  <SplitSquareHorizontal className="w-3 h-3" /> Split
                </button>
              </div>

              <div className="space-y-4">
                {posPayments.map((payment, idx) => (
                  <div key={idx} className="space-y-2.5">
                    {posPayments.length > 1 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">Payment {idx + 1}</span>
                        <button onClick={() => removePaymentSplit(idx)} className="text-muted hover:text-red-600 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      {paymentMethods.map(method => {
                        const Icon = paymentMethodIcons[method] || CreditCard;
                        return (
                          <button key={method} onClick={() => updatePaymentSplit(idx, 'method', method)}
                            className={`py-2 rounded-xl text-[11px] font-medium transition-all border flex items-center justify-center gap-1.5 ${payment.method === method ? 'bg-accent text-white border-accent' : 'bg-surface border-border text-muted hover:text-foreground'}`}>
                            <Icon className="w-3 h-3" /> {method}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2.5">
                      <div className="relative flex-1">
                        <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                        <input type="number" placeholder="Amount" min="0"
                          value={payment.amount || ''}
                          onChange={e => { paymentAutoFillRef.current = false; updatePaymentSplit(idx, 'amount', Number(e.target.value) || 0); }}
                          className="w-full pl-9 pr-3 py-2.5 bg-surface border border-border rounded-xl text-sm placeholder:text-muted focus:outline-none focus:border-accent/50" />
                      </div>
                      <input type="text" placeholder="Ref #"
                        value={payment.reference}
                        onChange={e => updatePaymentSplit(idx, 'reference', e.target.value)}
                        className="w-28 px-3 py-2.5 bg-surface border border-border rounded-xl text-xs placeholder:text-muted focus:outline-none focus:border-accent/50" />
                    </div>
                    {/* Quick amount buttons for first payment */}
                    {idx === 0 && posTotal > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => { paymentAutoFillRef.current = false; updatePaymentSplit(0, 'amount', posTotal); }}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
                          Full ({formatCurrency(posTotal)})
                        </button>
                        <button onClick={() => { paymentAutoFillRef.current = false; updatePaymentSplit(0, 'amount', Math.round(posTotal / 2)); }}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-surface-hover border border-border text-muted hover:text-foreground transition-colors">
                          50% ({formatCurrency(Math.round(posTotal / 2))})
                        </button>
                        {quickAmounts.filter(a => a <= posTotal && a !== posTotal).map(a => (
                          <button key={a} onClick={() => { paymentAutoFillRef.current = false; updatePaymentSplit(0, 'amount', a); }}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-surface-hover border border-border text-muted hover:text-foreground transition-colors">
                            {formatCurrency(a)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Payment totals */}
              {posTotal > 0 && (
                <div className="mt-4 pt-3 border-t border-border space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Paying</span>
                    <span className={`font-medium ${posTotalPayments >= posTotal ? 'text-success' : 'text-foreground'}`}>{formatFullCurrency(posTotalPayments)}</span>
                  </div>
                  {posBalanceDue > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted">Balance due</span>
                      <span className="font-medium text-red-600">{formatFullCurrency(posBalanceDue)}</span>
                    </div>
                  )}
                  {posTotalPayments > posTotal && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted">Change</span>
                      <span className="font-medium text-success">{formatFullCurrency(posTotalPayments - posTotal)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Due Date & Notes combined */}
            <div className="glass-card p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-accent" /> Due Date
                  <span className="text-[10px] text-muted font-normal">(optional)</span>
                </h3>
                <input type="date" value={posDueDate} onChange={e => setPosDueDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-accent/50" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Notes</h3>
                <textarea value={posNotes} onChange={e => setPosNotes(e.target.value)} rows={2}
                  placeholder="Additional notes (optional)..."
                  className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm resize-none placeholder:text-muted focus:outline-none focus:border-accent/50" />
              </div>
            </div>

            {/* Bill Total */}
            <div className="glass-card p-5 border-2 border-accent/20">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-accent" /> Bill Summary
              </h3>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Subtotal ({posItems.reduce((s, i) => s + i.qty, 0)} units)</span>
                  <span className="text-foreground font-medium">{formatFullCurrency(posSubtotal)}</span>
                </div>
                {posDiscountAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted">Discount {posDiscountType === 'percent' ? `(${posDiscount}%)` : ''}</span>
                    <span className="text-success font-medium">-{formatFullCurrency(posDiscountAmount)}</span>
                  </div>
                )}
                {posAdvancePaid > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted">Advance Paid</span>
                    <span className="text-success font-medium">-{formatFullCurrency(posAdvancePaid)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-muted">CGST ({gstRate / 2}%)</span>
                  <span className="text-foreground">{formatFullCurrency(posCgst)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">SGST ({gstRate / 2}%)</span>
                  <span className="text-foreground">{formatFullCurrency(posSgst)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-3 border-t border-border mt-1">
                  <span className="text-foreground">Total</span>
                  <span className="text-accent">{formatFullCurrency(posTotal)}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                disabled={posItems.length === 0 || !posCustomer.name || !posCustomer.phone || submitting || posTotalPayments === 0}
                onClick={() => handleGenerateInvoice(false)}
                className="w-full py-3.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Generating...</>
                ) : (
                  <><Receipt className="w-4 h-4" /> Generate Invoice</>
                )}
              </button>
              <button
                disabled={posItems.length === 0 || !posCustomer.name || !posCustomer.phone || submitting}
                onClick={() => handleGenerateInvoice(true)}
                className="w-full py-3 bg-surface border border-border text-muted hover:text-foreground hover:border-accent/30 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <PauseCircle className="w-4 h-4" /> Hold Bill
              </button>
              {(!posCustomer.name || !posCustomer.phone) && posItems.length > 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1 justify-center">
                  <AlertCircle className="w-3 h-3" /> Customer name and phone required
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           INVOICE DETAIL MODAL
         ════════════════════════════════════════════════════════ */}
      <Modal isOpen={!!selectedInvoice && !showPaymentModal && !showCreditNoteModal && !showCancelConfirm} onClose={() => setSelectedInvoice(null)} title="Invoice Details" size="lg">
        {selectedInvoice && (
          <div className="space-y-4">
            {/* Invoice Status Banner */}
            {selectedInvoice.invoiceStatus !== 'ACTIVE' && (
              <div className={`px-4 py-2.5 rounded-xl text-sm font-medium text-center border ${invoiceStatusColors[selectedInvoice.invoiceStatus]}`}>
                This invoice has been {selectedInvoice.invoiceStatus.toLowerCase()}
              </div>
            )}
            {selectedInvoice.isHeld && (
              <div className="px-4 py-2.5 rounded-xl text-sm font-medium text-center border bg-amber-500/10 text-amber-700 border-amber-500/20">
                This bill is on hold — stock has not been deducted
              </div>
            )}

            <div className="border border-border rounded-xl p-5 bg-surface">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <div>
                  <h3 className="text-xl font-bold text-accent">{storeSettings?.storeName || 'Furniture Store'}</h3>
                  {storeSettings?.address && <p className="text-xs text-muted mt-0.5">{storeSettings.address}</p>}
                  {storeSettings?.gstNumber && <p className="text-xs text-muted">GSTIN: {storeSettings.gstNumber}</p>}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-foreground">{selectedInvoice.id}</p>
                  <p className="text-xs text-muted">{selectedInvoice.date}{selectedInvoice.time ? ` · ${selectedInvoice.time}` : ''}</p>
                  {selectedInvoice.dueDate && <p className="text-xs text-warning mt-0.5">Due: {selectedInvoice.dueDate}</p>}
                </div>
              </div>

              {/* Customer & Salesperson */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Bill To</p>
                  <p className="text-sm font-medium text-foreground">{selectedInvoice.customer}</p>
                  <p className="text-xs text-muted">{selectedInvoice.phone}</p>
                </div>
                <div className="text-right">
                  {selectedInvoice.salesperson && (
                    <>
                      <p className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">Salesperson</p>
                      <p className="text-sm font-medium text-foreground">{selectedInvoice.salesperson}</p>
                    </>
                  )}
                </div>
              </div>

              {/* Items */}
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-[10px] uppercase tracking-wider text-muted font-semibold">#</th>
                    <th className="text-left py-2 text-[10px] uppercase tracking-wider text-muted font-semibold">Item</th>
                    <th className="text-center py-2 text-[10px] uppercase tracking-wider text-muted font-semibold">SKU</th>
                    <th className="text-center py-2 text-[10px] uppercase tracking-wider text-muted font-semibold">Qty</th>
                    <th className="text-right py-2 text-[10px] uppercase tracking-wider text-muted font-semibold">Rate</th>
                    <th className="text-right py-2 text-[10px] uppercase tracking-wider text-muted font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="py-2.5 text-muted">{idx + 1}</td>
                      <td className="py-2.5 text-foreground font-medium">{item.name}</td>
                      <td className="py-2.5 text-center text-muted font-mono text-xs">{item.sku || '—'}</td>
                      <td className="py-2.5 text-center text-foreground">{item.qty}</td>
                      <td className="py-2.5 text-right text-foreground">{formatFullCurrency(item.price)}</td>
                      <td className="py-2.5 text-right font-semibold text-foreground">{formatFullCurrency(item.price * item.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-72 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="text-foreground">{formatFullCurrency(selectedInvoice.subtotal)}</span></div>
                  {selectedInvoice.discount > 0 && (
                    <div className="flex justify-between"><span className="text-muted">Discount</span><span className="text-success">-{formatFullCurrency(selectedInvoice.discount)}</span></div>
                  )}
                  <div className="flex justify-between text-xs"><span className="text-muted">CGST ({gstRate / 2}%)</span><span className="text-foreground">{formatFullCurrency(selectedInvoice.cgst)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted">SGST ({gstRate / 2}%)</span><span className="text-foreground">{formatFullCurrency(selectedInvoice.sgst)}</span></div>
                  <div className="flex justify-between text-base font-bold pt-2 border-t border-border">
                    <span className="text-foreground">Total</span>
                    <span className="text-accent">{formatFullCurrency(selectedInvoice.total)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Amount Paid</span>
                    <span className="text-success font-medium">{formatFullCurrency(selectedInvoice.amountPaid)}</span>
                  </div>
                  {selectedInvoice.balanceDue > 0 && (
                    <div className="flex justify-between text-sm font-semibold">
                      <span className="text-red-600">Balance Due</span>
                      <span className="text-red-600">{formatFullCurrency(selectedInvoice.balanceDue)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment History */}
              {selectedInvoice.payments && selectedInvoice.payments.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border">
                  <p className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-2">Payment History</p>
                  <div className="space-y-1.5">
                    {selectedInvoice.payments.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs bg-surface-hover rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{p.method}</span>
                          {p.reference && <span className="text-muted font-mono">#{p.reference}</span>}
                          <span className="text-muted">{p.date}</span>
                        </div>
                        <span className="font-semibold text-success">{formatFullCurrency(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Credit Notes */}
              {selectedInvoice.creditNotes && selectedInvoice.creditNotes.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border">
                  <p className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-2">Credit Notes</p>
                  <div className="space-y-1.5">
                    {selectedInvoice.creditNotes.map((cn, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs bg-purple-500/5 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-purple-700">{cn.displayId}</span>
                          <span className="text-muted">{cn.reason}</span>
                          <span className="text-muted">{cn.date}</span>
                        </div>
                        <span className="font-semibold text-purple-700">-{formatFullCurrency(cn.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedInvoice.notes && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted"><span className="font-medium">Notes:</span> {selectedInvoice.notes}</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => handlePrintInvoice(selectedInvoice)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent-hover transition-colors">
                <Printer className="w-4 h-4" /> Print
              </button>
              {selectedInvoice.invoiceStatus === 'ACTIVE' && selectedInvoice.balanceDue > 0 && (
                <button onClick={() => { setPaymentModalData({ amount: selectedInvoice.balanceDue, method: 'Cash', reference: '', notes: '' }); setShowPaymentModal(true); }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-success text-white rounded-xl text-sm font-medium hover:bg-success/90 transition-colors">
                  <BadgeIndianRupee className="w-4 h-4" /> Record Payment
                </button>
              )}
              {selectedInvoice.invoiceStatus === 'ACTIVE' && (
                <>
                  <button onClick={() => { setCreditNoteData({ amount: '', reason: '' }); setShowCreditNoteModal(true); }}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-surface border border-border text-muted rounded-xl text-sm font-medium hover:text-purple-700 hover:border-purple-700/30 transition-colors">
                    <RotateCcw className="w-4 h-4" /> Credit Note
                  </button>
                  <button onClick={() => setShowCancelConfirm(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-surface border border-border text-muted rounded-xl text-sm font-medium hover:text-red-600 hover:border-red-600/30 transition-colors">
                    <Ban className="w-4 h-4" /> Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ─── RECORD PAYMENT MODAL ─── */}
      <Modal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="Record Payment" size="sm">
        {selectedInvoice && (
          <div className="space-y-4">
            <div className="p-3 bg-surface rounded-xl text-sm">
              <div className="flex justify-between"><span className="text-muted">Invoice</span><span className="font-mono font-medium text-accent">{selectedInvoice.id}</span></div>
              <div className="flex justify-between mt-1"><span className="text-muted">Balance Due</span><span className="font-semibold text-red-600">{formatFullCurrency(selectedInvoice.balanceDue)}</span></div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted mb-1.5 block">Amount *</label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                <input type="number" min="1" max={selectedInvoice.balanceDue} value={paymentModalData.amount}
                  onChange={e => setPaymentModalData({ ...paymentModalData, amount: e.target.value })}
                  className="w-full pl-9 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-accent/50" />
              </div>
              <div className="flex gap-1.5 mt-2">
                {[selectedInvoice.balanceDue, Math.round(selectedInvoice.balanceDue / 2)].filter(a => a > 0).map(a => (
                  <button key={a} onClick={() => setPaymentModalData({ ...paymentModalData, amount: a })}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-surface-hover border border-border text-muted hover:text-foreground transition-colors">
                    {a === selectedInvoice.balanceDue ? 'Full' : 'Half'} ({formatCurrency(a)})
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted mb-1.5 block">Payment Method</label>
              <div className="grid grid-cols-3 gap-1.5">
                {paymentMethods.map(method => {
                  const Icon = paymentMethodIcons[method] || CreditCard;
                  return (
                    <button key={method} onClick={() => setPaymentModalData({ ...paymentModalData, method })}
                      className={`py-2 rounded-xl text-xs font-medium transition-all border flex items-center justify-center gap-1.5 ${paymentModalData.method === method ? 'bg-accent text-white border-accent' : 'bg-surface border-border text-muted hover:text-foreground'}`}>
                      <Icon className="w-3 h-3" /> {method}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted mb-1.5 block">Reference / Transaction ID</label>
              <input type="text" placeholder="e.g. UPI Ref, Cheque No." value={paymentModalData.reference}
                onChange={e => setPaymentModalData({ ...paymentModalData, reference: e.target.value })}
                className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm placeholder:text-muted focus:outline-none focus:border-accent/50" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted mb-1.5 block">Notes</label>
              <input type="text" placeholder="Optional notes" value={paymentModalData.notes}
                onChange={e => setPaymentModalData({ ...paymentModalData, notes: e.target.value })}
                className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm placeholder:text-muted focus:outline-none focus:border-accent/50" />
            </div>
            <button onClick={handleRecordPayment} disabled={!paymentModalData.amount || submitting}
              className="w-full py-3 bg-success text-white rounded-xl text-sm font-semibold hover:bg-success/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {submitting ? 'Processing...' : <><BadgeIndianRupee className="w-4 h-4" /> Record Payment</>}
            </button>
          </div>
        )}
      </Modal>

      {/* ─── CREDIT NOTE MODAL ─── */}
      <Modal isOpen={showCreditNoteModal} onClose={() => setShowCreditNoteModal(false)} title="Create Credit Note" size="sm">
        {selectedInvoice && (
          <div className="space-y-4">
            <div className="p-3 bg-surface rounded-xl text-sm">
              <div className="flex justify-between"><span className="text-muted">Invoice</span><span className="font-mono font-medium text-accent">{selectedInvoice.id}</span></div>
              <div className="flex justify-between mt-1"><span className="text-muted">Invoice Total</span><span className="font-semibold">{formatFullCurrency(selectedInvoice.total)}</span></div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted mb-1.5 block">Credit Amount *</label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                <input type="number" min="1" max={selectedInvoice.total} value={creditNoteData.amount}
                  onChange={e => setCreditNoteData({ ...creditNoteData, amount: e.target.value })}
                  className="w-full pl-9 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-accent/50" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted mb-1.5 block">Reason *</label>
              <textarea value={creditNoteData.reason} onChange={e => setCreditNoteData({ ...creditNoteData, reason: e.target.value })}
                rows={2} placeholder="e.g. Product return, defective item, overcharge..."
                className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm resize-none placeholder:text-muted focus:outline-none focus:border-accent/50" />
            </div>
            <button onClick={handleCreateCreditNote} disabled={!creditNoteData.amount || !creditNoteData.reason || submitting}
              className="w-full py-3 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {submitting ? 'Processing...' : <><RotateCcw className="w-4 h-4" /> Create Credit Note</>}
            </button>
          </div>
        )}
      </Modal>

      {/* ─── CANCEL CONFIRM MODAL ─── */}
      <Modal isOpen={showCancelConfirm} onClose={() => setShowCancelConfirm(false)} title="Cancel Invoice" size="sm">
        {selectedInvoice && (
          <div className="space-y-4">
            <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
              <p className="text-sm text-red-700 font-medium">Are you sure you want to cancel invoice {selectedInvoice.id}?</p>
              <p className="text-xs text-red-600/70 mt-1">This will restore the product stock. This action cannot be undone.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-2.5 bg-surface border border-border text-foreground rounded-xl text-sm font-medium hover:bg-surface-hover transition-colors">
                Keep Invoice
              </button>
              <button onClick={handleCancelInvoice} disabled={submitting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                {submitting ? 'Cancelling...' : <><Ban className="w-4 h-4" /> Cancel Invoice</>}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
