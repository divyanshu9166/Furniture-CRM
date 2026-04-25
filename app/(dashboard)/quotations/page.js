'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  CalendarDays,
  Eye,
  FileText,
  Image as ImageIcon,
  IndianRupee,
  Package,
  Pencil,
  Phone,
  Plus,
  Printer,
  Search,
  Upload,
  User,
  X,
} from 'lucide-react'
import Modal from '@/components/Modal'
import { createQuotation, getQuotationStats, getQuotations, updateQuotation, updateQuotationStatus } from '@/app/actions/quotations'
import { getProducts } from '@/app/actions/products'
import { getStoreSettings } from '@/app/actions/settings'

const statusColors = {
  DRAFT: 'bg-gray-500/10 text-gray-700 border-gray-500/20',
  SENT: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  APPROVED: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  REJECTED: 'bg-red-500/10 text-red-700 border-red-500/20',
}

const defaultTerms = [
  'Extra work will be accounted separately.',
  '50% payment in advance with purchase order.',
  'Balance payment before dispatch of goods.',
  'GST at applicable rate will be charged extra.',
  'Labour to load/unload vehicle is at consignee expense.',
  'Packing charge and freight are at actual basis.',
  'Once order is confirmed, amendment or cancellation is not allowed.',
]

const createBlankItem = () => ({
  productId: '',
  name: '',
  sku: '',
  description: '',
  quantity: 1,
  rate: 0,
  referenceImage: '',
})

const createInitialForm = () => ({
  customer: '',
  phone: '',
  email: '',
  dispatchAddress: '',
  date: new Date().toISOString().split('T')[0],
  validUntil: '',
  projectName: '',
  deliveryMode: 'CARGO BY ROAD',
  roadPermit: 'REQUIRED',
  contactPerson: '',
  installationPercent: 5,
  freightCharge: 0,
  loadingCharge: 0,
  gstPercent: 18,
  notes: '',
  termsText: defaultTerms.join('\n'),
  items: [createBlankItem()],
})

function formatDateDisplay(dateValue) {
  if (!dateValue) return '-'
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return String(dateValue)
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function buildFormFromQuotation(quotation) {
  const mappedItems = Array.isArray(quotation?.items) && quotation.items.length > 0
    ? quotation.items.map(item => ({
        productId: item.productId || '',
        name: item.name || '',
        sku: item.sku || '',
        description: item.description || '',
        quantity: Number(item.quantity) || 1,
        rate: Number(item.rate) || 0,
        referenceImage: item.referenceImage || '',
      }))
    : [createBlankItem()]

  return {
    customer: quotation?.customer || '',
    phone: quotation?.phone || '',
    email: quotation?.email || '',
    dispatchAddress: quotation?.dispatchAddress || '',
    date: quotation?.date || new Date().toISOString().split('T')[0],
    validUntil: quotation?.validUntil || '',
    projectName: quotation?.projectName || '',
    deliveryMode: quotation?.deliveryMode || 'CARGO BY ROAD',
    roadPermit: quotation?.roadPermit || 'REQUIRED',
    contactPerson: quotation?.contactPerson || '',
    installationPercent: Number(quotation?.installationPercent) || 0,
    freightCharge: Number(quotation?.freightCharge) || 0,
    loadingCharge: Number(quotation?.loadingCharge) || 0,
    gstPercent: Number(quotation?.gstPercent) || 18,
    notes: quotation?.notes || '',
    termsText: Array.isArray(quotation?.termsAndConditions) && quotation.termsAndConditions.length > 0
      ? quotation.termsAndConditions.join('\n')
      : defaultTerms.join('\n'),
    items: mappedItems,
  }
}

function formatCurrency(amount) {
  return `Rs. ${Number(amount || 0).toLocaleString('en-IN')}`
}

function computeTotals(items, installationPercent, freightCharge, loadingCharge, gstPercent) {
  const normalizedItems = items.map(item => {
    const quantity = Math.max(1, Number(item.quantity) || 1)
    const rate = Math.max(0, Number(item.rate) || 0)
    return {
      ...item,
      quantity,
      rate,
      amount: quantity * rate,
    }
  })

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.amount, 0)
  const installationCharge = Math.round((subtotal * (Number(installationPercent) || 0)) / 100)
  const freight = Math.max(0, Number(freightCharge) || 0)
  const loading = Math.max(0, Number(loadingCharge) || 0)
  const totalBeforeTax = subtotal + installationCharge + freight + loading
  const gstAmount = Math.round((totalBeforeTax * (Number(gstPercent) || 0)) / 100)
  const grandTotal = totalBeforeTax + gstAmount

  return {
    normalizedItems,
    subtotal,
    installationCharge,
    freight,
    loading,
    totalBeforeTax,
    gstAmount,
    grandTotal,
  }
}

function getAbsoluteImageUrl(url) {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${window.location.origin}${url}`
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildPrintHtml(quotation, storeSettings) {
  const storeName = storeSettings?.storeName || 'Furniture Store'
  const storeAddress = storeSettings?.address || ''
  const storePhone = storeSettings?.phone || ''
  const storeEmail = storeSettings?.email || ''

  const itemRows = quotation.items
    .map((item, idx) => {
      const img = item.referenceImage
        ? `<img src="${escapeHtml(getAbsoluteImageUrl(item.referenceImage))}" alt="reference" style="width:110px;height:70px;object-fit:cover;border:1px solid #999;" />`
        : '<span style="color:#666;font-size:10px;">No image</span>'

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>
            <div style="font-weight:700;">${escapeHtml(item.name || '-')}</div>
            ${item.description ? `<div style="font-size:10px;color:#333;white-space:pre-wrap;">${escapeHtml(item.description)}</div>` : ''}
          </td>
          <td style="text-align:center;">${img}</td>
          <td style="text-align:center;">${item.quantity}</td>
          <td style="text-align:right;">${Number(item.rate || 0).toLocaleString('en-IN')}</td>
          <td style="text-align:right;">${Number(item.amount || 0).toLocaleString('en-IN')}</td>
        </tr>
      `
    })
    .join('')

  const terms = (quotation.termsAndConditions || [])
    .map((term, idx) => `<li${idx === 6 ? ' class="highlight"' : ''}>${idx + 1}. ${escapeHtml(term)}</li>`)
    .join('')

  return `
    <html>
      <head>
        <title>${escapeHtml(quotation.id)} - Quotation</title>
        <style>
          @page { size: A4 portrait; margin: 8mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
          .sheet { border: 3px solid #111; }
          .center { text-align: center; }
          .title { font-weight: 700; text-decoration: underline; margin-top: 6px; }
          .company { font-size: 42px; font-weight: 800; color: #06a9d6; line-height: 1.05; margin: 2px 0; letter-spacing: 0.5px; }
          .meta { font-size: 11px; margin-bottom: 4px; }
          .meta.small { font-size: 10px; margin-bottom: 2px; }
          table { width: 100%; border-collapse: collapse; }
          td, th { border: 1.5px solid #111; padding: 4px 6px; font-size: 11px; vertical-align: top; }
          .blue { background: #0ea5d8; color: white; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
          .section { margin-top: 0; }
          .totals td { font-size: 11px; }
          .totals td:first-child { text-align: right; font-weight: 700; }
          .totals td:last-child { text-align: right; width: 180px; }
          .totals tr.bar td { background:#0ea5d8; color:#fff; font-weight:700; }
          .totals tr.final td { background:#d9f4ff; font-weight:700; }
          .terms { margin: 10px 8px 12px; font-size: 11px; color:#6b4d8e; }
          .terms h4 { margin: 0 0 6px; font-size: 12px; text-decoration: underline; }
          .terms ul { margin: 0; padding: 0; list-style: none; }
          .terms li { margin: 2px 0; }
          .terms li.highlight { background:#0ea5d8; color:#fff; padding:1px 4px; }
          .bank { margin: 10px 8px 12px; font-size: 11px; color:#6b4d8e; }
          .bank strong.brand { color:#06a9d6; }
          .bank p { margin: 3px 0; }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="center">
            <div class="title">QUOTATION</div>
            <div class="company">${escapeHtml(storeName).toUpperCase()}</div>
            <div class="meta small">Factory Address :- ${escapeHtml(storeAddress)}</div>
            <div class="meta small">Mob :- ${escapeHtml(storePhone)} ${storeEmail ? `| ${escapeHtml(storeEmail)}` : ''}</div>
          </div>

          <table class="section">
            <tr>
              <td style="width:12%;font-weight:700;">TO,</td>
              <td style="width:48%;font-weight:700;">${escapeHtml(quotation.customer || '-')}</td>
              <td style="width:20%;font-weight:700;">QUOTATION NO.</td>
              <td style="width:20%;">${escapeHtml(quotation.id || '-')}</td>
            </tr>
            <tr>
              <td style="font-weight:700;">SITE:</td>
              <td>${escapeHtml(quotation.dispatchAddress || '-')}</td>
              <td style="font-weight:700;">DATE</td>
              <td>${escapeHtml(formatDateDisplay(quotation.date))}</td>
            </tr>
            <tr>
              <td style="font-weight:700;">MODE</td>
              <td>${escapeHtml(quotation.deliveryMode || '-')}</td>
              <td style="font-weight:700;">ROAD PERMIT</td>
              <td>${escapeHtml(quotation.roadPermit || '-')}</td>
            </tr>
            <tr>
              <td style="font-weight:700;">EMAIL</td>
              <td>${escapeHtml(quotation.email || '-')}</td>
              <td style="font-weight:700;">CONTACT PERSON</td>
              <td>${escapeHtml(quotation.contactPerson || '-')}</td>
            </tr>
          </table>

          <table class="section">
            <thead>
              <tr>
                <th class="blue" style="width:6%;">S.NO</th>
                <th class="blue" style="width:42%;">PRODUCT DESCRIPTION</th>
                <th class="blue" style="width:30%;">REFERENCE IMAGE</th>
                <th class="blue" style="width:7%;">QTY.</th>
                <th class="blue" style="width:7%;">RATE</th>
                <th class="blue" style="width:8%;">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>

          <table class="totals section">
            <tr class="bar"><td>TOTAL Rs.</td><td>${Number(quotation.subtotal || 0).toLocaleString('en-IN')}</td></tr>
            <tr><td>INSTALLATION @${quotation.installationPercent || 0}%</td><td>${Number(quotation.installationCharge || 0).toLocaleString('en-IN')}</td></tr>
            <tr><td>FREIGHT CHARGES</td><td>${Number(quotation.freightCharge || 0).toLocaleString('en-IN')}</td></tr>
            <tr><td>LABOUR UNLOADING</td><td>${Number(quotation.loadingCharge || 0).toLocaleString('en-IN')}</td></tr>
            <tr class="bar"><td>GRAND TOTAL</td><td>${Number(quotation.totalBeforeTax || 0).toLocaleString('en-IN')}</td></tr>
            <tr><td>ADD. GST @${quotation.gstPercent || 0}%</td><td>${Number(quotation.gstAmount || 0).toLocaleString('en-IN')}</td></tr>
            <tr class="final"><td><strong>FINAL AMOUNT</strong></td><td><strong>${Number(quotation.grandTotal || 0).toLocaleString('en-IN')}</strong></td></tr>
          </table>

          <div class="terms">
            <h4>Terms & Conditions</h4>
            <ul>${terms}</ul>
          </div>

          <div class="bank">
            <p><strong>Bank Details</strong></p>
            <p>Make Cheques in favor of <strong class="brand">${escapeHtml(storeName).toUpperCase()}</strong></p>
            <p>For custom account details, please update from your internal finance records.</p>
          </div>
        </div>
      </body>
    </html>
  `
}

function QuotationSheetPreview({ quotation, storeSettings }) {
  const toINR = value => Number(value || 0).toLocaleString('en-IN')
  const terms = Array.isArray(quotation.termsAndConditions) && quotation.termsAndConditions.length > 0
    ? quotation.termsAndConditions
    : defaultTerms
  const items = Array.isArray(quotation.items) ? quotation.items : []

  return (
    <div className="bg-white text-black border-[3px] border-black rounded-sm overflow-hidden text-[10px]">
      <div className="text-center border-b-2 border-black">
        <p className="font-bold text-[12px] underline mt-1">QUOTATION</p>
        <p className="font-extrabold text-[24px] md:text-[30px] tracking-wide text-[#06a9d6] leading-tight px-2 mt-1">
          {(storeSettings?.storeName || 'Furniture Store').toUpperCase()}
        </p>
        <p className="px-2 text-[10px]">Factory Address :- {storeSettings?.address || 'Store address not set'}</p>
        <p className="px-2 pb-1 text-[10px]">
          Mob :- {storeSettings?.phone || ''}
          {storeSettings?.email ? ` | ${storeSettings.email}` : ''}
        </p>
      </div>

      <table className="w-full border-collapse text-[10px]">
        <tbody>
          <tr>
            <td className="border border-black p-1 font-semibold w-[12%]">TO,</td>
            <td className="border border-black p-1 font-semibold w-[48%]">{quotation.customer || 'Customer Name'}</td>
            <td className="border border-black p-1 font-semibold w-[20%]">QUOTATION NO.</td>
            <td className="border border-black p-1 w-[20%]">{quotation.id || 'Auto'}</td>
          </tr>
          <tr>
            <td className="border border-black p-1 font-semibold">SITE</td>
            <td className="border border-black p-1 whitespace-pre-wrap">{quotation.dispatchAddress || '-'}</td>
            <td className="border border-black p-1 font-semibold">DATE</td>
            <td className="border border-black p-1">{formatDateDisplay(quotation.date)}</td>
          </tr>
          <tr>
            <td className="border border-black p-1 font-semibold">MODE</td>
            <td className="border border-black p-1">{quotation.deliveryMode || '-'}</td>
            <td className="border border-black p-1 font-semibold">ROAD PERMIT</td>
            <td className="border border-black p-1">{quotation.roadPermit || '-'}</td>
          </tr>
          <tr>
            <td className="border border-black p-1 font-semibold">EMAIL</td>
            <td className="border border-black p-1">{quotation.email || '-'}</td>
            <td className="border border-black p-1 font-semibold">CONTACT PERSON</td>
            <td className="border border-black p-1">{quotation.contactPerson || '-'}</td>
          </tr>
        </tbody>
      </table>

      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="border border-black bg-[#0ea5d8] text-white font-bold p-1 w-[6%]">S.NO</th>
            <th className="border border-black bg-[#0ea5d8] text-white font-bold p-1 w-[42%]">PRODUCT DISCRIPTION</th>
            <th className="border border-black bg-[#0ea5d8] text-white font-bold p-1 w-[30%]">REFERENCE IMAGE</th>
            <th className="border border-black bg-[#0ea5d8] text-white font-bold p-1 w-[7%]">QTY.</th>
            <th className="border border-black bg-[#0ea5d8] text-white font-bold p-1 w-[7%]">RATE</th>
            <th className="border border-black bg-[#0ea5d8] text-white font-bold p-1 w-[8%]">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={`${item.name}-${idx}`}>
              <td className="border border-black p-1 text-center align-top">{idx + 1}</td>
              <td className="border border-black p-1 align-top">
                <p className="font-semibold">{item.name || 'Item name'}</p>
                {item.description && <p className="whitespace-pre-wrap">{item.description}</p>}
              </td>
              <td className="border border-black p-1 align-top text-center">
                {item.referenceImage ? (
                  <Image
                    src={item.referenceImage}
                    alt="reference"
                    width={96}
                    height={64}
                    unoptimized
                    className="w-24 h-16 object-cover border border-gray-400 mx-auto"
                  />
                ) : (
                  <span className="text-[9px] text-gray-600">No image</span>
                )}
              </td>
              <td className="border border-black p-1 text-center align-top">{item.quantity}</td>
                <td className="border border-black p-1 text-right align-top">{toINR(item.rate)}</td>
                <td className="border border-black p-1 text-right align-top">{toINR(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="w-full border-collapse text-[10px]">
        <tbody>
          <tr>
            <td className="border border-black p-1 text-right font-semibold bg-[#0ea5d8] text-white">TOTAL Rs.</td>
            <td className="border border-black p-1 text-right w-[28%] bg-[#0ea5d8] text-white font-semibold">{toINR(quotation.subtotal)}</td>
          </tr>
          <tr>
            <td className="border border-black p-1 text-right font-semibold">INSTALLATION @{Number(quotation.installationPercent || 0)}%</td>
            <td className="border border-black p-1 text-right">{toINR(quotation.installationCharge)}</td>
          </tr>
          <tr>
            <td className="border border-black p-1 text-right font-semibold">FREIGHT CHARGES</td>
            <td className="border border-black p-1 text-right">{toINR(quotation.freightCharge)}</td>
          </tr>
          <tr>
            <td className="border border-black p-1 text-right font-semibold">LABOUR UNLOADING</td>
            <td className="border border-black p-1 text-right">{toINR(quotation.loadingCharge)}</td>
          </tr>
          <tr>
            <td className="border border-black p-1 text-right font-semibold bg-[#0ea5d8] text-white">GRAND TOTAL</td>
            <td className="border border-black p-1 text-right bg-[#0ea5d8] text-white font-semibold">{toINR(quotation.totalBeforeTax)}</td>
          </tr>
          <tr>
            <td className="border border-black p-1 text-right font-semibold">ADD. GST @{Number(quotation.gstPercent || 0)}%</td>
            <td className="border border-black p-1 text-right">{toINR(quotation.gstAmount)}</td>
          </tr>
          <tr>
            <td className="border border-black p-1 text-right font-bold bg-[#e8f7fc]">FINAL AMOUNT</td>
            <td className="border border-black p-1 text-right font-bold bg-[#e8f7fc]">{toINR(quotation.grandTotal)}</td>
          </tr>
        </tbody>
      </table>

      <div className="p-2 border-t-2 border-black">
        <h4 className="text-[11px] font-bold underline mb-1">Terms & Conditions</h4>
        <ul className="space-y-0.5">
          {terms.map((term, idx) => (
            <li key={`${term}-${idx}`} className={`text-[#6b4d8e] ${idx === 6 ? 'bg-[#0ea5d8] text-white px-1' : ''}`}>
              {idx + 1}. {term}
            </li>
          ))}
        </ul>
      </div>

      <div className="px-2 pb-2 text-[10px] text-[#6b4d8e]">
        <p>Make Cheques in Favor of <span className="text-[#06a9d6] font-bold">{(storeSettings?.storeName || 'Furniture Store').toUpperCase()}</span>.</p>
        <p>Please Deposit The Entered Amount In Our Following Account</p>
      </div>
    </div>
  )
}

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState([])
  const [products, setProducts] = useState([])
  const [storeSettings, setStoreSettings] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showGenerator, setShowGenerator] = useState(false)
  const [editingQuotationId, setEditingQuotationId] = useState(null)
  const [selectedQuotation, setSelectedQuotation] = useState(null)
  const [uploadingIndex, setUploadingIndex] = useState(null)
  const [form, setForm] = useState(createInitialForm())

  const loadData = useCallback(async () => {
    const [qRes, pRes, sRes, statRes] = await Promise.all([
      getQuotations(),
      getProducts(),
      getStoreSettings(),
      getQuotationStats(),
    ])

    if (qRes.success) setQuotations(qRes.data)
    if (pRes.success) setProducts(pRes.data)
    if (sRes.success) setStoreSettings(sRes.data)
    if (statRes.success) setStats(statRes.data)

    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const computed = useMemo(
    () => computeTotals(form.items, form.installationPercent, form.freightCharge, form.loadingCharge, form.gstPercent),
    [form.items, form.installationPercent, form.freightCharge, form.loadingCharge, form.gstPercent]
  )

  const previewQuotation = useMemo(() => {
    const termsAndConditions = form.termsText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    return {
      id: 'PREVIEW',
      customer: form.customer,
      phone: form.phone,
      email: form.email,
      dispatchAddress: form.dispatchAddress,
      date: form.date,
      deliveryMode: form.deliveryMode,
      roadPermit: form.roadPermit,
      contactPerson: form.contactPerson,
      items: computed.normalizedItems,
      subtotal: computed.subtotal,
      installationPercent: Number(form.installationPercent) || 0,
      installationCharge: computed.installationCharge,
      freightCharge: computed.freight,
      loadingCharge: computed.loading,
      totalBeforeTax: computed.totalBeforeTax,
      gstPercent: Number(form.gstPercent) || 0,
      gstAmount: computed.gstAmount,
      grandTotal: computed.grandTotal,
      termsAndConditions: termsAndConditions.length > 0 ? termsAndConditions : defaultTerms,
    }
  }, [form, computed])

  const filteredQuotations = useMemo(() => {
    return quotations.filter(quotation => {
      const inSearch =
        quotation.id.toLowerCase().includes(search.toLowerCase()) ||
        quotation.customer.toLowerCase().includes(search.toLowerCase()) ||
        quotation.phone.toLowerCase().includes(search.toLowerCase())

      const inStatus = statusFilter === 'ALL' || quotation.statusKey === statusFilter
      return inSearch && inStatus
    })
  }, [quotations, search, statusFilter])

  const isEditMode = editingQuotationId !== null

  const openNewQuotationModal = () => {
    setEditingQuotationId(null)
    setForm(createInitialForm())
    setShowGenerator(true)
  }

  const openEditQuotationModal = quotation => {
    setEditingQuotationId(quotation.dbId)
    setForm(buildFormFromQuotation(quotation))
    setSelectedQuotation(null)
    setShowGenerator(true)
  }

  const updateItem = (index, patch) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    }))
  }

  const addItem = () => {
    setForm(prev => ({ ...prev, items: [...prev.items, createBlankItem()] }))
  }

  const removeItem = index => {
    setForm(prev => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((_, idx) => idx !== index) : prev.items,
    }))
  }

  const handleProductSelect = (index, productIdValue) => {
    const productId = productIdValue ? parseInt(productIdValue) : ''
    const product = products.find(p => p.id === productId)

    if (!product) {
      updateItem(index, { productId: '', name: '', sku: '', rate: 0, description: '' })
      return
    }

    updateItem(index, {
      productId: product.id,
      name: product.name,
      sku: product.sku,
      description: product.description || '',
      rate: product.price,
    })
  }

  const handleReferenceImageUpload = async (index, files) => {
    const file = files?.[0]
    if (!file) return

    setUploadingIndex(index)

    try {
      const formData = new FormData()
      formData.set('folder', 'quotations')
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()

      if (data.success && data.urls?.[0]) {
        updateItem(index, { referenceImage: data.urls[0] })
      } else {
        alert(data.error || 'Image upload failed')
      }
    } catch (error) {
      console.error(error)
      alert('Image upload failed. Please try again.')
    } finally {
      setUploadingIndex(null)
    }
  }

  const handleCreateQuotation = async e => {
    e.preventDefault()

    if (!form.customer.trim() || !form.phone.trim()) {
      alert('Customer name and phone are required')
      return
    }

    const termsAndConditions = form.termsText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    const payload = {
      customer: form.customer.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      dispatchAddress: form.dispatchAddress.trim(),
      date: form.date,
      validUntil: form.validUntil || undefined,
      projectName: form.projectName.trim(),
      deliveryMode: form.deliveryMode.trim(),
      roadPermit: form.roadPermit.trim(),
      contactPerson: form.contactPerson.trim(),
      installationPercent: Number(form.installationPercent) || 0,
      freightCharge: Number(form.freightCharge) || 0,
      loadingCharge: Number(form.loadingCharge) || 0,
      gstPercent: Number(form.gstPercent) || 0,
      notes: form.notes.trim(),
      termsAndConditions,
      items: computed.normalizedItems.map(item => ({
        productId: item.productId || undefined,
        name: item.name.trim(),
        sku: item.sku?.trim(),
        description: item.description?.trim(),
        quantity: Number(item.quantity) || 1,
        rate: Number(item.rate) || 0,
        referenceImage: item.referenceImage || undefined,
      })),
    }

    setSaving(true)

    const result = isEditMode
      ? await updateQuotation({ id: editingQuotationId, ...payload })
      : await createQuotation(payload)

    if (result.success) {
      setForm(createInitialForm())
      setEditingQuotationId(null)
      setShowGenerator(false)
      await loadData()
      setSelectedQuotation(result.data)
    } else {
      alert(result.error || 'Failed to create quotation')
    }

    setSaving(false)
  }

  const handleStatusChange = async (quotationId, status) => {
    const result = await updateQuotationStatus({ id: quotationId, status })
    if (!result.success) {
      alert(result.error || 'Unable to update status')
      return
    }

    await loadData()
    if (selectedQuotation?.dbId === quotationId) {
      const fresh = await getQuotations()
      if (fresh.success) {
        const updated = fresh.data.find(item => item.dbId === quotationId)
        if (updated) setSelectedQuotation(updated)
      }
    }
  }

  const handlePrint = quotation => {
    const printWindow = window.open('', '_blank', 'width=900,height=1200')
    if (!printWindow) return

    printWindow.document.write(buildPrintHtml(quotation, storeSettings))
    printWindow.document.close()
    printWindow.focus()

    setTimeout(() => {
      printWindow.print()
    }, 300)
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-72 bg-surface rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-surface rounded-2xl" />
          ))}
        </div>
        <div className="h-64 bg-surface rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-[fade-in_0.3s_ease]">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quotation Generator</h1>
          <p className="text-sm text-muted mt-1">Generate structured quotations with inventory-linked items and reference images</p>
        </div>
        <button
          onClick={openNewQuotationModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" /> New Quotation
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent-light"><FileText className="w-5 h-5 text-accent" /></div>
          <div>
            <p className="text-xs text-muted">Total Quotations</p>
            <p className="text-lg font-bold text-foreground">{stats?.total || 0}</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10"><CalendarDays className="w-5 h-5 text-blue-700" /></div>
          <div>
            <p className="text-xs text-muted">Draft + Sent</p>
            <p className="text-lg font-bold text-blue-700">{(stats?.draft || 0) + (stats?.sent || 0)}</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10"><Package className="w-5 h-5 text-emerald-700" /></div>
          <div>
            <p className="text-xs text-muted">Approved</p>
            <p className="text-lg font-bold text-emerald-700">{stats?.approved || 0}</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10"><IndianRupee className="w-5 h-5 text-purple-700" /></div>
          <div>
            <p className="text-xs text-muted">Quoted Value</p>
            <p className="text-lg font-bold text-purple-700">{formatCurrency(stats?.totalValue || 0)}</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by quotation no, customer, or phone"
              className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-xl border border-border text-sm"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto hide-scrollbar">
            {['ALL', 'DRAFT', 'SENT', 'APPROVED', 'REJECTED'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === status ? 'bg-accent text-white' : 'text-muted hover:text-foreground hover:bg-surface-hover'
                }`}
              >
                {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Quotation No.</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotations.map(quotation => (
                <tr key={quotation.dbId}>
                  <td>
                    <span className="font-mono text-accent font-medium">{quotation.id}</span>
                  </td>
                  <td>
                    <p className="font-medium text-foreground">{quotation.customer}</p>
                    <p className="text-xs text-muted">{quotation.phone}</p>
                  </td>
                  <td>{quotation.date}</td>
                  <td>{quotation.items.length}</td>
                  <td className="font-semibold text-foreground">{formatCurrency(quotation.grandTotal)}</td>
                  <td>
                    <select
                      value={quotation.statusKey}
                      onChange={e => handleStatusChange(quotation.dbId, e.target.value)}
                      className={`px-2 py-1 rounded-lg text-xs border ${statusColors[quotation.statusKey]}`}
                    >
                      {['DRAFT', 'SENT', 'APPROVED', 'REJECTED'].map(status => (
                        <option key={status} value={status}>{status.charAt(0) + status.slice(1).toLowerCase()}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditQuotationModal(quotation)}
                        className="p-1.5 rounded-lg hover:bg-accent/10 text-muted hover:text-accent transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setSelectedQuotation(quotation)}
                        className="p-1.5 rounded-lg hover:bg-accent/10 text-muted hover:text-accent transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handlePrint(quotation)}
                        className="p-1.5 rounded-lg hover:bg-accent/10 text-muted hover:text-accent transition-colors"
                        title="Print"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredQuotations.length === 0 && (
            <div className="text-center py-10 text-sm text-muted">No quotations found for current filters</div>
          )}
        </div>
      </div>

      <Modal
        isOpen={showGenerator}
        onClose={() => {
          setShowGenerator(false)
          setEditingQuotationId(null)
          setForm(createInitialForm())
        }}
        title={isEditMode ? 'Edit Quotation' : 'Create Quotation'}
        size="xl"
      >
        <form onSubmit={handleCreateQuotation} className="space-y-5">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Customer Name *</label>
                  <input
                    value={form.customer}
                    onChange={e => setForm(prev => ({ ...prev, customer: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Phone *</label>
                  <input
                    value={form.phone}
                    onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Contact Person</label>
                  <input
                    value={form.contactPerson}
                    onChange={e => setForm(prev => ({ ...prev, contactPerson: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Site / Dispatch Address</label>
                <textarea
                  rows={2}
                  value={form.dispatchAddress}
                  onChange={e => setForm(prev => ({ ...prev, dispatchAddress: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Valid Until</label>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={e => setForm(prev => ({ ...prev, validUntil: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Delivery Mode</label>
                  <input
                    value={form.deliveryMode}
                    onChange={e => setForm(prev => ({ ...prev, deliveryMode: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Road Permit</label>
                  <input
                    value={form.roadPermit}
                    onChange={e => setForm(prev => ({ ...prev, roadPermit: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Quotation Items</h3>
                  <button
                    type="button"
                    onClick={addItem}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted hover:text-accent hover:border-accent/40"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>

                {form.items.map((item, index) => {
                  const amount = (Number(item.quantity) || 0) * (Number(item.rate) || 0)

                  return (
                    <div key={index} className="bg-surface border border-border rounded-xl p-3 space-y-2">
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-12 md:col-span-6">
                          <label className="block text-[11px] text-muted mb-1">Inventory Product</label>
                          <select
                            value={item.productId}
                            onChange={e => handleProductSelect(index, e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-xs"
                          >
                            <option value="">Select from inventory</option>
                            {products.map(product => (
                              <option key={product.id} value={product.id}>
                                {product.name} ({product.sku}) - Stock: {product.stock}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-12 md:col-span-6">
                          <label className="block text-[11px] text-muted mb-1">Item Name *</label>
                          <input
                            value={item.name}
                            onChange={e => updateItem(index, { name: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg text-xs"
                            required
                          />
                        </div>
                        <div className="col-span-12">
                          <label className="block text-[11px] text-muted mb-1">Description</label>
                          <textarea
                            rows={2}
                            value={item.description}
                            onChange={e => updateItem(index, { description: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg text-xs resize-none"
                          />
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <label className="block text-[11px] text-muted mb-1">Qty</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={e => updateItem(index, { quantity: parseInt(e.target.value || '1') })}
                            className="w-full px-2 py-2 rounded-lg text-xs"
                          />
                        </div>
                        <div className="col-span-4 md:col-span-3">
                          <label className="block text-[11px] text-muted mb-1">Rate</label>
                          <input
                            type="number"
                            min="0"
                            value={item.rate}
                            onChange={e => updateItem(index, { rate: parseInt(e.target.value || '0') })}
                            className="w-full px-2 py-2 rounded-lg text-xs"
                          />
                        </div>
                        <div className="col-span-4 md:col-span-3">
                          <label className="block text-[11px] text-muted mb-1">Amount</label>
                          <div className="w-full px-2 py-2 rounded-lg text-xs bg-surface-hover border border-border text-right font-medium">
                            {formatCurrency(amount)}
                          </div>
                        </div>
                        <div className="col-span-12 md:col-span-4">
                          <label className="block text-[11px] text-muted mb-1">Reference Image</label>
                          <div className="flex items-center gap-2">
                            <label className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-border text-xs text-muted hover:text-accent hover:border-accent/40 cursor-pointer">
                              <Upload className="w-3.5 h-3.5" />
                              {uploadingIndex === index ? 'Uploading...' : 'Upload'}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => handleReferenceImageUpload(index, e.target.files)}
                                disabled={uploadingIndex === index}
                              />
                            </label>
                            {item.referenceImage && (
                              <Image
                                src={item.referenceImage}
                                alt="reference"
                                width={48}
                                height={40}
                                unoptimized
                                className="w-12 h-10 rounded border border-border object-cover"
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      {form.items.length > 1 && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                          >
                            <X className="w-3.5 h-3.5" /> Remove
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Installation %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.installationPercent}
                    onChange={e => setForm(prev => ({ ...prev, installationPercent: parseFloat(e.target.value || '0') }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Freight</label>
                  <input
                    type="number"
                    min="0"
                    value={form.freightCharge}
                    onChange={e => setForm(prev => ({ ...prev, freightCharge: parseInt(e.target.value || '0') }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Loading</label>
                  <input
                    type="number"
                    min="0"
                    value={form.loadingCharge}
                    onChange={e => setForm(prev => ({ ...prev, loadingCharge: parseInt(e.target.value || '0') }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">GST %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.gstPercent}
                    onChange={e => setForm(prev => ({ ...prev, gstPercent: parseFloat(e.target.value || '0') }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Terms & Conditions (one per line)</label>
                <textarea
                  rows={6}
                  value={form.termsText}
                  onChange={e => setForm(prev => ({ ...prev, termsText: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Live Preview (sample-matching format)</h3>
              <div className="border border-border rounded-xl p-2 bg-surface max-h-[72vh] overflow-auto">
                <QuotationSheetPreview quotation={previewQuotation} storeSettings={storeSettings} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div className="text-sm text-muted">
              Final Amount: <span className="font-semibold text-foreground">{formatCurrency(previewQuotation.grandTotal)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowGenerator(false)}
                className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              >
                {saving ? 'Saving...' : isEditMode ? 'Update Quotation' : 'Save Quotation'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!selectedQuotation} onClose={() => setSelectedQuotation(null)} title="Quotation Preview" size="xl">
        {selectedQuotation && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm text-muted">Quotation</p>
                <p className="font-mono text-accent font-semibold">{selectedQuotation.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-xs border ${statusColors[selectedQuotation.statusKey]}`}>
                  {selectedQuotation.status}
                </span>
                <button
                  onClick={() => openEditQuotationModal(selectedQuotation)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs text-muted hover:text-accent hover:border-accent/40"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => handlePrint(selectedQuotation)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs text-muted hover:text-accent hover:border-accent/40"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
              </div>
            </div>
            <QuotationSheetPreview quotation={selectedQuotation} storeSettings={storeSettings} />
          </div>
        )}
      </Modal>
    </div>
  )
}
