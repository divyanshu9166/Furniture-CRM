'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, CheckCircle2, Download, FileSpreadsheet, History, Mail,
  Megaphone, MessageSquare, RefreshCw, Upload, Users,
} from 'lucide-react';
import { getCampaigns } from '@/app/actions/campaigns';
import { bulkImportContacts } from '@/app/actions/contacts';
import Modal from '@/components/Modal';

const MAX_IMPORT_ROWS = 5000;
const COLUMN_ALIASES = {
  name: ['name', 'full name', 'customer name', 'contact name', 'naam'],
  phone: ['phone', 'mobile', 'phone number', 'mobile number', 'contact', 'number', 'mob', 'ph'],
  email: ['email', 'e-mail', 'email address', 'mail'],
  address: ['address', 'addr', 'locality', 'area'],
  city: ['city', 'town', 'district', 'location'],
  source: ['source', 'lead source', 'channel'],
  notes: ['notes', 'note', 'remarks', 'comment'],
};

function mapColumns(headers) {
  return headers.reduce((map, header, index) => {
    const value = String(header).trim().toLowerCase();
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(value) && map[field] === undefined) map[field] = index;
    }
    return map;
  }, {});
}

function toContact(row, columns) {
  const value = (field) => columns[field] === undefined ? '' : String(row[columns[field]] ?? '').trim();
  return {
    name: value('name'), phone: value('phone'), email: value('email') || undefined,
    address: value('address') || undefined, city: value('city') || undefined,
    source: value('source') || undefined, notes: value('notes') || undefined,
  };
}

const legacyStatusClass = {
  Draft: 'bg-surface-hover text-muted border border-border',
  Scheduled: 'bg-amber-500/10 text-amber-600',
  Sent: 'bg-success-light text-success',
};

export default function MarketingPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [columns, setColumns] = useState({});
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef(null);

  const loadCampaigns = async () => {
    setPageError('');
    const result = await getCampaigns();
    if (result.success) setCampaigns(result.data);
    else setPageError(result.error || 'Unable to load campaign history.');
  };

  useEffect(() => {
    let cancelled = false;
    async function loadInitialCampaigns() {
      const result = await getCampaigns();
      if (cancelled) return;
      if (result.success) setCampaigns(result.data);
      else setPageError(result.error || 'Unable to load campaign history.');
      setLoading(false);
    }
    void loadInitialCampaigns();
    return () => { cancelled = true; };
  }, []);

  const openImport = () => {
    setImportRows([]); setHeaders([]); setColumns({}); setImportError(''); setImportResult(null); setShowImport(true);
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError(''); setImportResult(null); setImportRows([]); setHeaders([]); setColumns({});

    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Choose a file smaller than 10 MB.');
      const xlsxModule = await import('xlsx');
      const XLSX = xlsxModule.default ?? xlsxModule;
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!Array.isArray(data) || data.length < 2) throw new Error('The file needs a header row and at least one contact.');

      const nextHeaders = data[0].map((cell) => String(cell).trim());
      const nextRows = data.slice(1).filter((row) => row.some((cell) => String(cell).trim()));
      if (nextRows.length > MAX_IMPORT_ROWS) throw new Error(`Import up to ${MAX_IMPORT_ROWS.toLocaleString()} contacts at a time.`);
      const nextColumns = mapColumns(nextHeaders);
      if (nextColumns.name === undefined || nextColumns.phone === undefined) {
        throw new Error('Required columns missing: include both Name and Phone.');
      }
      setHeaders(nextHeaders); setImportRows(nextRows); setColumns(nextColumns);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to read this file. Use CSV, XLS, or XLSX.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const submitImport = async () => {
    setImporting(true); setImportError('');
    const result = await bulkImportContacts(importRows.map((row) => toContact(row, columns)));
    setImporting(false);
    if (result.success) {
      setImportResult(result.data); setImportRows([]); setHeaders([]); setColumns({});
    } else setImportError(result.error || 'Unable to import contacts.');
  };

  const downloadTemplate = () => {
    const csv = 'Name,Phone,Email,Address,City,Source,Notes\nRahul Sharma,9876543210,rahul@example.com,123 MG Road,Mumbai,Walk-in,VIP customer';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'contacts_import_template.csv'; anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-[fade-in_0.35s_ease-out]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Marketing Hub</h1>
          <p className="mt-1 text-sm text-muted">Create and send campaigns from the connected channel workspace.</p>
        </div>
        <button onClick={openImport} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-accent/30 hover:bg-surface-hover">
          <Upload className="h-4 w-4" /> Import contacts
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChannelCard href="/email-marketing" icon={Mail} title="Email campaigns" description="Create email templates, choose subscribed recipients, send campaigns, and review delivery engagement." action="Open Email Marketing" tone="bg-info-light text-info" />
        <ChannelCard href="/whatsapp-marketing?tab=broadcasts" icon={MessageSquare} title="WhatsApp broadcasts" description="Use approved WhatsApp templates, audience filters, delivery status, and message automation in one workspace." action="Open WhatsApp Marketing" tone="bg-success-light text-success" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InfoCard icon={Megaphone} title="Channel-first delivery" text="Every send happens through its configured Email or WhatsApp integration." />
        <InfoCard icon={Users} title="Consent-aware audiences" text="Email campaigns target subscribed contacts only; WhatsApp uses its own contact audience." />
        <InfoCard icon={History} title="Existing data preserved" text={`${campaigns.length} legacy campaign record${campaigns.length === 1 ? '' : 's'} remain available below.`} />
      </div>

      <section className="glass-card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold text-foreground">Legacy campaign history</h2><p className="mt-1 text-xs text-muted">Records created by the previous planner. They are kept for reference; new sends belong in the channel workspaces above.</p></div>
          <button onClick={() => { setLoading(true); loadCampaigns().finally(() => setLoading(false)); }} className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-accent hover:underline sm:self-auto"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
        {pageError ? <div className="p-5 text-sm text-red-600">{pageError}</div> : loading ? (
          <div className="space-y-3 p-5 animate-pulse"><div className="h-12 rounded-xl bg-surface" /><div className="h-12 rounded-xl bg-surface" /></div>
        ) : campaigns.length === 0 ? (
          <div className="px-5 py-12 text-center"><History className="mx-auto mb-3 h-9 w-9 text-muted/40" /><p className="text-sm font-medium text-foreground">No legacy campaigns</p><p className="mt-1 text-xs text-muted">Start a new campaign from Email Marketing or WhatsApp Marketing.</p></div>
        ) : (
          <div className="divide-y divide-border">{campaigns.map((campaign) => <div key={campaign.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{campaign.name}</p><p className="mt-1 text-xs text-muted">{campaign.channel} · {campaign.audience.toLocaleString()} planned audience{campaign.scheduledDate ? ` · ${campaign.scheduledDate}` : ''}</p></div><span className={`badge w-fit text-[11px] ${legacyStatusClass[campaign.status] || legacyStatusClass.Draft}`}>{campaign.status}</span></div>)}</div>
        )}
      </section>

      <Modal isOpen={showImport} onClose={() => !importing && setShowImport(false)} title="Import contacts" size="lg">
        <div className="space-y-4">
          <div className="rounded-xl border border-info/20 bg-info-light/30 p-3 text-xs text-muted"><div className="flex items-start gap-2"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-info" /><div><p className="font-medium text-foreground">CSV, XLS, and XLSX supported</p><p className="mt-1">Name and Phone are required. Phone numbers must be valid 10-digit Indian mobile numbers. Import up to 5,000 contacts per file.</p></div></div></div>
          <button onClick={downloadTemplate} className="inline-flex items-center gap-2 text-xs font-medium text-accent hover:underline"><Download className="h-3.5 w-3.5" /> Download sample template</button>
          {!importResult && importRows.length === 0 && <><input ref={inputRef} type="file" accept=".csv,.xls,.xlsx" onChange={handleFile} className="hidden" /><button onClick={() => inputRef.current?.click()} className="w-full rounded-xl border-2 border-dashed border-border p-8 text-center transition-colors hover:border-accent/40"><Upload className="mx-auto mb-2 h-7 w-7 text-muted" /><p className="text-sm font-medium text-foreground">Choose contact file</p><p className="mt-1 text-xs text-muted">Maximum file size: 10 MB</p></button></>}
          {importError && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700">{importError}</p>}
          {importRows.length > 0 && !importResult && <div className="space-y-3"><div className="flex items-center justify-between"><p className="text-sm font-medium text-foreground">{importRows.length.toLocaleString()} contacts ready to validate</p><button onClick={() => { setImportRows([]); setHeaders([]); setColumns({}); }} disabled={importing} className="text-xs text-muted hover:text-foreground">Clear</button></div><div className="overflow-x-auto rounded-xl border border-border"><table className="min-w-full text-xs"><thead className="bg-surface"><tr>{headers.slice(0, 5).map((header, index) => <th key={`${header}-${index}`} className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted">{header}</th>)}</tr></thead><tbody>{importRows.slice(0, 5).map((row, index) => <tr key={index} className="border-t border-border">{row.slice(0, 5).map((cell, cellIndex) => <td key={cellIndex} className="max-w-36 truncate px-3 py-2 text-foreground">{String(cell)}</td>)}</tr>)}</tbody></table></div><button onClick={submitImport} disabled={importing} className="inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50">{importing ? <><RefreshCw className="h-4 w-4 animate-spin" /> Importing...</> : <><Upload className="h-4 w-4" /> Import contacts</>}</button></div>}
          {importResult && <div className="space-y-3"><div className="flex items-start gap-3 rounded-xl border border-success/20 bg-success-light p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" /><div><p className="text-sm font-semibold text-foreground">Import complete</p><p className="mt-1 text-xs text-muted">{importResult.created} added · {importResult.skipped} skipped due to invalid or duplicate data.</p></div></div><button onClick={() => setShowImport(false)} className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover">Done</button></div>}
        </div>
      </Modal>
    </div>
  );
}

function ChannelCard({ href, icon: Icon, title, description, action, tone }) {
  return <Link href={href} className="glass-card group block p-6 transition-all hover:-translate-y-0.5 hover:border-accent/30"><div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></div><h2 className="text-lg font-semibold text-foreground">{title}</h2><p className="mt-2 min-h-10 text-sm leading-6 text-muted">{description}</p><span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">{action}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></Link>;
}

function InfoCard({ icon: Icon, title, text }) {
  return <div className="glass-card flex gap-3 p-4"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><div><p className="text-sm font-semibold text-foreground">{title}</p><p className="mt-1 text-xs leading-5 text-muted">{text}</p></div></div>;
}
