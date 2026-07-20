'use client';

import { useState, useEffect } from 'react';
import {
    Search, Plus, Phone, MessageSquare, Clock, CalendarClock, CheckCircle2,
    XCircle, RotateCcw, Trash2, Pencil, AlertTriangle, User, Tag, Settings2, RefreshCw, Send,
} from 'lucide-react';
import {
    getFollowUps, createFollowUp, updateFollowUp, updateFollowUpStatus,
    deleteFollowUp, getFollowUpCounts,
    getReminderConfig, updateReminderConfig, runFollowUpRemindersNow,
} from '@/app/actions/follow-ups';
import { getStaff } from '@/app/actions/staff';
import { dueLabel, dueBucket, daysUntil } from '@/lib/follow-ups';
import { LEAD_SOURCE_OPTIONS } from '@/lib/lead-sources';
import { FOLLOW_UP_PRIORITIES } from '@/lib/validations/follow-up';
import Modal from '@/components/Modal';
import { useAlertToast } from '@/components/AlertToastProvider';

const TABS = [
    { key: 'OPEN', label: 'Open' },
    { key: 'ALL', label: 'All' },
    { key: 'PENDING', label: 'Pending' },
    { key: 'REMINDED', label: 'Reminded' },
    { key: 'CONTACTED', label: 'Contacted' },
    { key: 'CONVERTED', label: 'Converted' },
    { key: 'LOST', label: 'Lost' },
];

const statusBadge = {
    PENDING: 'bg-info-light text-info',
    REMINDED: 'bg-purple-light text-purple',
    CONTACTED: 'bg-accent-light text-accent',
    CONVERTED: 'bg-success-light text-success',
    LOST: 'bg-danger-light text-danger',
};
const statusLabel = { PENDING: 'Pending', REMINDED: 'Reminded', CONTACTED: 'Contacted', CONVERTED: 'Converted', LOST: 'Lost' };

const priorityBadge = {
    High: 'bg-danger-light text-danger',
    Medium: 'bg-warning-light text-warning',
    Low: 'bg-surface-hover text-muted',
};

const channelMeta = {
    whatsapp: { label: 'WhatsApp', cls: 'text-success bg-success-light' },
    instagram: { label: 'Instagram', cls: 'text-pink bg-pink-light' },
    facebook: { label: 'Facebook', cls: 'text-info bg-info-light' },
};

const dueBadgeClass = (date) => {
    const b = dueBucket(new Date(date), new Date());
    if (b === 'overdue') return 'bg-danger-light text-danger';
    if (b === 'today') return 'bg-warning-light text-warning';
    return 'bg-teal-light text-teal';
};

const normalizePhone = (v) => {
    const digits = String(v || '').replace(/\D/g, '').replace(/^0+/, '');
    if (!digits) return '';
    return digits.length === 10 ? `91${digits}` : digits;
};
const waUrl = (phone, msg) => {
    const n = normalizePhone(phone);
    return n ? `https://wa.me/${n}?text=${encodeURIComponent(msg)}` : '';
};

export default function FollowUpsPage() {
    const { notify } = useAlertToast();
    const [items, setItems] = useState([]);
    const [counts, setCounts] = useState({ overdue: 0, dueToday: 0, upcoming: 0, converted: 0 });
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [tab, setTab] = useState('OPEN');
    const [search, setSearch] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [toDelete, setToDelete] = useState(null);
    // Reminder settings
    const [showSettings, setShowSettings] = useState(false);
    const [cfg, setCfg] = useState({ enabled: false, templateName: '', language: 'en_US' });
    const [cfgLoaded, setCfgLoaded] = useState(false);
    const [savingCfg, setSavingCfg] = useState(false);
    const [running, setRunning] = useState(false);

    const openSettings = async () => {
        setShowSettings(true);
        if (!cfgLoaded) {
            const res = await getReminderConfig();
            if (res.success) { setCfg(res.data); setCfgLoaded(true); }
            else notify(res.error || 'Could not load settings', { variant: 'danger' });
        }
    };

    const saveCfg = async () => {
        setSavingCfg(true);
        const res = await updateReminderConfig(cfg);
        setSavingCfg(false);
        if (res.success) { setCfg(res.data); notify('Reminder settings saved', { variant: 'success' }); }
        else notify(res.error || 'Failed to save', { variant: 'danger' });
    };

    const runNow = async () => {
        setRunning(true);
        const res = await runFollowUpRemindersNow();
        setRunning(false);
        if (res.success) {
            const s = res.data;
            if (!s.enabled) notify('Reminders are disabled — enable them first', { variant: 'warning' });
            else notify(`Reminders run: ${s.sent} sent, ${s.skipped} skipped, ${s.failed} failed`, { variant: 'success' });
            await refresh();
        } else {
            notify(res.error || 'Failed to run reminders', { variant: 'danger' });
        }
    };

    const refresh = async (t = tab) => {
        try {
            const [res, c] = await Promise.all([getFollowUps(t), getFollowUpCounts()]);
            if (res.success) setItems(res.data);
            if (c.success) setCounts(c.data);
        } catch (err) {
            notify(err?.message || 'Could not refresh follow-ups', { variant: 'danger' });
        }
    };

    useEffect(() => {
        let active = true;
        setLoading(true);
        setLoadError(null);
        // A single failing action must never leave the page stuck on the
        // loading skeleton — always clear `loading`, and surface a retry.
        Promise.all([getFollowUps(tab), getFollowUpCounts()])
            .then(([res, c]) => {
                if (!active) return;
                if (res.success) setItems(res.data);
                else setLoadError(res.error || 'Failed to load follow-ups');
                if (c.success) setCounts(c.data);
            })
            .catch(err => {
                if (active) setLoadError(err?.message || 'Failed to load follow-ups');
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [tab]);

    useEffect(() => {
        getStaff().then(res => {
            if (res.success) setStaff(res.data.filter(s => s.status === 'Active'));
        });
    }, []);

    const filtered = items.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        (f.interest || '').toLowerCase().includes(search.toLowerCase()) ||
        (f.phone || '').includes(search)
    );

    const handleCreate = async (e) => {
        e.preventDefault();
        const f = e.target;
        setSaving(true);
        const res = await createFollowUp({
            name: f.name.value,
            phone: f.phone.value,
            email: f.email.value,
            source: f.source.value || undefined,
            interest: f.interest.value,
            budget: f.budget.value,
            reason: f.reason.value,
            followUpDate: f.followUpDate.value,
            priority: f.priority.value,
            assignedToId: f.assignedToId.value ? Number(f.assignedToId.value) : null,
            notes: f.notes.value,
        });
        setSaving(false);
        if (res.success) {
            setShowAdd(false);
            notify('Follow-up added', { variant: 'success' });
            await refresh();
        } else {
            notify(res.error || 'Failed to add follow-up', { variant: 'danger' });
        }
    };

    const handleEdit = async (e) => {
        e.preventDefault();
        const f = e.target;
        setSaving(true);
        const res = await updateFollowUp({
            id: editing.id,
            followUpDate: f.followUpDate.value,
            priority: f.priority.value,
            reason: f.reason.value,
            interest: f.interest.value,
            budget: f.budget.value,
            assignedToId: f.assignedToId.value ? Number(f.assignedToId.value) : null,
            notes: f.notes.value,
        });
        setSaving(false);
        if (res.success) {
            setEditing(null);
            notify('Follow-up updated', { variant: 'success' });
            await refresh();
        } else {
            notify(res.error || 'Failed to update', { variant: 'danger' });
        }
    };

    const changeStatus = async (id, status) => {
        const res = await updateFollowUpStatus({ id, status });
        if (res.success) { await refresh(); notify(`Marked ${statusLabel[status]}`, { variant: 'success' }); }
        else notify(res.error || 'Failed', { variant: 'danger' });
    };

    const confirmDelete = async () => {
        if (!toDelete) return;
        const res = await deleteFollowUp(toDelete.id);
        setToDelete(null);
        if (res.success) { await refresh(); notify('Follow-up removed', { variant: 'info' }); }
        else notify(res.error || 'Failed to delete', { variant: 'danger' });
    };

    if (loading) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="h-8 w-48 bg-surface rounded-lg" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-surface rounded-2xl" />)}</div>
                <div className="h-64 bg-surface rounded-2xl" />
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="space-y-6 animate-[fade-in_0.4s_ease-out]">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-foreground">Follow-ups</h1>
                    <p className="text-xs md:text-sm text-muted mt-1">Interested customers to reconnect with on a future date</p>
                </div>
                <div className="glass-card py-16 text-center">
                    <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-danger opacity-70" />
                    <p className="text-sm font-medium text-foreground">Couldn&apos;t load follow-ups</p>
                    <p className="text-xs text-muted mt-1 max-w-md mx-auto">{loadError}</p>
                    <button
                        onClick={() => { setLoading(true); setLoadError(null); refresh().finally(() => setLoading(false)); }}
                        className="tap-press-sm mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all"
                    >
                        <RefreshCw className="w-4 h-4" /> Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-[fade-in_0.5s_ease-out] min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-foreground">Follow-ups</h1>
                    <p className="text-xs md:text-sm text-muted mt-1">Interested customers to reconnect with on a future date</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={openSettings} title="Reminder settings" className="tap-press-sm flex items-center gap-2 px-3 py-2.5 bg-surface border border-border hover:border-accent/30 text-foreground rounded-xl text-sm font-medium transition-all">
                        <Settings2 className="w-4 h-4" /> <span className="hidden sm:inline">Reminders</span>
                    </button>
                    <button onClick={() => setShowAdd(true)} className="tap-press-sm flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">
                        <Plus className="w-4 h-4" /> Add Follow-up
                    </button>
                </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
                <div className="glass-card p-4 flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-danger-light"><AlertTriangle className="w-5 h-5 text-danger" /></div>
                    <div><p className="text-xs text-muted">Overdue</p><p className="text-lg font-bold text-foreground">{counts.overdue}</p></div>
                </div>
                <div className="glass-card p-4 flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-warning-light"><CalendarClock className="w-5 h-5 text-warning" /></div>
                    <div><p className="text-xs text-muted">Due Today</p><p className="text-lg font-bold text-foreground">{counts.dueToday}</p></div>
                </div>
                <div className="glass-card p-4 flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-teal-light"><Clock className="w-5 h-5 text-teal" /></div>
                    <div><p className="text-xs text-muted">Upcoming</p><p className="text-lg font-bold text-foreground">{counts.upcoming}</p></div>
                </div>
                <div className="glass-card p-4 flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-success-light"><CheckCircle2 className="w-5 h-5 text-success" /></div>
                    <div><p className="text-xs text-muted">Converted</p><p className="text-lg font-bold text-foreground">{counts.converted}</p></div>
                </div>
            </div>

            {/* Search + tabs */}
            <div className="space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone or interest..."
                        className="w-full md:max-w-md pl-10 pr-4 py-2.5 bg-surface rounded-xl border border-border text-sm" />
                </div>
                <div className="seg-row">
                    {TABS.map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)} data-active={tab === t.key} className="seg-pill">{t.label}</button>
                    ))}
                </div>
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <div className="glass-card py-16 text-center text-muted">
                    <CalendarClock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium text-foreground">No follow-ups here</p>
                    <p className="text-xs mt-1">Add one manually, or convert an interested lead from the Leads page.</p>
                </div>
            ) : (
                <div className="space-y-2.5">
                    {filtered.map((f, i) => {
                        const isOpen = f.status === 'PENDING' || f.status === 'REMINDED' || f.status === 'CONTACTED';
                        return (
                            <div key={f.id} className="m-card animate-list-in" style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}>
                                <div className="flex items-start gap-3">
                                    <div className="w-11 h-11 rounded-full bg-accent/10 flex items-center justify-center text-sm font-semibold text-accent flex-shrink-0">
                                        {f.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <p className="text-sm font-semibold text-foreground truncate">{f.name}</p>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                {f.status === 'PENDING' && <span className={`badge ${dueBadgeClass(f.followUpDate)}`}>{dueLabel(new Date(f.followUpDate), new Date())}</span>}
                                                {f.status === 'REMINDED' && <span className="badge bg-purple-light text-purple">Awaiting reply</span>}
                                                <span className={`badge ${statusBadge[f.status]}`}>{statusLabel[f.status]}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-muted">
                                            <span>{f.phone}</span>
                                            {f.interest && <><span className="text-border">·</span><span className="truncate">🛋️ {f.interest}</span></>}
                                            {f.budget && <><span className="text-border">·</span><span className="text-accent font-medium">{f.budget}</span></>}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                            <span className="inline-flex items-center gap-1 text-[10px] text-muted"><CalendarClock className="w-3 h-3" /> {f.followUpDate}</span>
                                            <span className={`badge text-[10px] ${(channelMeta[f.channel] || channelMeta.whatsapp).cls}`}>{(channelMeta[f.channel] || channelMeta.whatsapp).label}</span>
                                            <span className={`badge text-[10px] ${priorityBadge[f.priority] || priorityBadge.Medium}`}>{f.priority}</span>
                                            {f.assignedTo && <span className="inline-flex items-center gap-1 text-[10px] text-muted"><User className="w-3 h-3" /> {f.assignedTo}</span>}
                                            {f.fromLead && <span className="inline-flex items-center gap-1 text-[10px] text-purple bg-purple-light rounded-md px-1.5 py-0.5"><Tag className="w-2.5 h-2.5" /> From Lead</span>}
                                        </div>
                                        {f.reason && <p className="text-xs text-muted mt-2 italic">“{f.reason}”</p>}

                                        {(f.channel === 'instagram' || f.channel === 'facebook') && f.status === 'PENDING' && daysUntil(new Date(f.followUpDate), new Date()) > 7 && (
                                            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning-light text-warning px-2.5 py-1.5 text-[11px] leading-snug">
                                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                                <span>Meta only allows {channelMeta[f.channel].label} messages within 7 days of the customer&apos;s last reply. This reminder may not deliver until they message again.</span>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex items-center gap-1 mt-2.5 pt-2.5 border-t border-border flex-wrap">
                                            {f.phone && (
                                                <>
                                                    <a href={`tel:${f.phone}`} className="tap-press-sm inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20">
                                                        <Phone className="w-3.5 h-3.5" /> Call
                                                    </a>
                                                    <button onClick={() => { const u = waUrl(f.phone, `Hello ${f.name}, following up regarding your enquiry${f.interest ? ` about ${f.interest}` : ''}.`); if (u) window.open(u, '_blank', 'noopener,noreferrer'); else notify('Phone number missing', { variant: 'danger' }); }}
                                                        className="tap-press-sm inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface border border-border text-muted hover:text-foreground">
                                                        <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                                                    </button>
                                                </>
                                            )}
                                            <button onClick={() => setEditing(f)} className="tap-press-sm p-2 rounded-lg hover:bg-surface-hover text-muted hover:text-accent" title="Reschedule / edit"><Pencil className="w-4 h-4" /></button>
                                            {isOpen ? (
                                                <>
                                                    {(f.status === 'PENDING' || f.status === 'REMINDED') && (
                                                        <button onClick={() => changeStatus(f.id, 'CONTACTED')} className="tap-press-sm inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-accent-light text-accent hover:bg-accent/20">Mark Contacted</button>
                                                    )}
                                                    <button onClick={() => changeStatus(f.id, 'CONVERTED')} className="tap-press-sm inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-success-light text-success hover:bg-success/20"><CheckCircle2 className="w-3.5 h-3.5" /> Converted</button>
                                                    <button onClick={() => changeStatus(f.id, 'LOST')} className="tap-press-sm inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-danger-light text-danger hover:bg-danger/20"><XCircle className="w-3.5 h-3.5" /> Lost</button>
                                                </>
                                            ) : (
                                                <button onClick={() => changeStatus(f.id, 'PENDING')} className="tap-press-sm inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface border border-border text-muted hover:text-foreground"><RotateCcw className="w-3.5 h-3.5" /> Reopen</button>
                                            )}
                                            <button onClick={() => setToDelete(f)} className="tap-press-sm p-2 rounded-lg hover:bg-danger-light text-muted hover:text-danger ml-auto" title="Remove"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add modal */}
            <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Follow-up">
                <form className="space-y-4" onSubmit={handleCreate}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-muted mb-1.5">Customer Name *</label>
                            <input name="name" required placeholder="Full name" className="w-full" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted mb-1.5">Phone *</label>
                            <input name="phone" type="tel" required placeholder="+91..." className="w-full" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-muted mb-1.5">Email</label>
                            <input name="email" type="email" placeholder="customer@email.com" className="w-full" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted mb-1.5">Source</label>
                            <select name="source" className="w-full" defaultValue="">
                                <option value="">Select source</option>
                                {LEAD_SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-muted mb-1.5">Product Interest</label>
                            <input name="interest" placeholder="e.g. L-Shaped Sofa" className="w-full" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted mb-1.5">Budget</label>
                            <input name="budget" placeholder="₹00,000" className="w-full" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-muted mb-1.5">Follow-up Date *</label>
                            <input name="followUpDate" type="date" required className="w-full" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted mb-1.5">Priority</label>
                            <select name="priority" className="w-full" defaultValue="Medium">
                                {FOLLOW_UP_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted mb-1.5">Assign Salesperson</label>
                        <select name="assignedToId" className="w-full" defaultValue="">
                            <option value="">Unassigned</option>
                            {staff.map(s => <option key={s.id} value={s.id}>{s.name} — {s.role}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted mb-1.5">When are they buying? (reason)</label>
                        <input name="reason" placeholder="e.g. Buying after 2 months / after Diwali" className="w-full" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted mb-1.5">Notes</label>
                        <textarea name="notes" rows={2} placeholder="Any specific preferences..." className="w-full" />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors">Cancel</button>
                        <button type="submit" disabled={saving} className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50">{saving ? 'Saving...' : 'Add Follow-up'}</button>
                    </div>
                </form>
            </Modal>

            {/* Edit modal */}
            <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit Follow-up">
                {editing && (
                    <form className="space-y-4" onSubmit={handleEdit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-muted mb-1.5">Follow-up Date *</label>
                                <input name="followUpDate" type="date" required defaultValue={editing.followUpDate} className="w-full" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted mb-1.5">Priority</label>
                                <select name="priority" className="w-full" defaultValue={editing.priority}>
                                    {FOLLOW_UP_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-muted mb-1.5">Product Interest</label>
                                <input name="interest" defaultValue={editing.interest || ''} className="w-full" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted mb-1.5">Budget</label>
                                <input name="budget" defaultValue={editing.budget || ''} className="w-full" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted mb-1.5">Assign Salesperson</label>
                            <select name="assignedToId" className="w-full" defaultValue={editing.assignedToId || ''}>
                                <option value="">Unassigned</option>
                                {staff.map(s => <option key={s.id} value={s.id}>{s.name} — {s.role}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted mb-1.5">Reason</label>
                            <input name="reason" defaultValue={editing.reason || ''} className="w-full" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted mb-1.5">Notes</label>
                            <textarea name="notes" rows={2} defaultValue={editing.notes || ''} className="w-full" />
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button type="button" onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors">Cancel</button>
                            <button type="submit" disabled={saving} className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Delete confirm */}
            <Modal isOpen={!!toDelete} onClose={() => setToDelete(null)} title="Remove Follow-up" size="sm">
                {toDelete && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted">Remove the follow-up for <strong className="text-foreground">{toDelete.name}</strong>? This cannot be undone.</p>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setToDelete(null)} className="px-4 py-2 rounded-lg text-sm text-muted hover:bg-surface-hover">Cancel</button>
                            <button onClick={confirmDelete} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm">Remove</button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Reminder settings */}
            <Modal isOpen={showSettings} onClose={() => setShowSettings(false)} title="WhatsApp Reminder Settings">
                <div className="space-y-4">
                    <p className="text-sm text-muted">
                        On a follow-up&apos;s scheduled date, the system sends <strong className="text-foreground">one</strong> approved
                        WhatsApp template to the contact, then marks it Reminded. The customer&apos;s reply re-opens the chat for your
                        agent/chatbot. Runs automatically once a day.
                    </p>

                    <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface border border-border">
                        <span className="text-sm font-medium text-foreground">Enable scheduled reminders</span>
                        <input type="checkbox" checked={cfg.enabled} onChange={e => setCfg(c => ({ ...c, enabled: e.target.checked }))}
                            className="w-5 h-5 accent-[var(--color-accent)]" />
                    </label>

                    <div>
                        <label className="block text-xs font-medium text-muted mb-1.5">Approved template name</label>
                        <input value={cfg.templateName} onChange={e => setCfg(c => ({ ...c, templateName: e.target.value }))}
                            placeholder="e.g. follow_up_reminder" className="w-full" />
                        <p className="text-[11px] text-muted mt-1">Must be approved in Meta WhatsApp Manager. Body variable <code>{'{{1}}'}</code> is filled with the customer&apos;s name.</p>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-muted mb-1.5">Template language</label>
                        <input value={cfg.language} onChange={e => setCfg(c => ({ ...c, language: e.target.value }))}
                            placeholder="en_US" className="w-full md:max-w-[200px]" />
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-border flex-wrap">
                        <button onClick={runNow} disabled={running}
                            className="tap-press-sm inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-surface border border-border text-foreground hover:border-accent/30 disabled:opacity-50">
                            {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Run now
                        </button>
                        <div className="flex items-center gap-3">
                            <button onClick={() => setShowSettings(false)} className="px-4 py-2 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors">Close</button>
                            <button onClick={saveCfg} disabled={savingCfg}
                                className="px-5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-semibold disabled:opacity-50">{savingCfg ? 'Saving...' : 'Save'}</button>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
