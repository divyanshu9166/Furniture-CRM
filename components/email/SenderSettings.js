'use client';
import { Plus, Trash2 } from 'lucide-react';

export default function SenderSettings({ config, onChange, testFrom, onTestFromChange, disabled = false }) {
  const aliases = Array.isArray(config.smtpAliases) ? config.smtpAliases : [];
  const primary = config.smtpUser.trim().toLowerCase();
  const senders = [{ email: primary, name: config.smtpFromName }, ...aliases].filter(sender => sender.email.trim());
  const defaultEmail = config.smtpFromEmail || primary;
  const selectedTest = senders.some(sender => sender.email === testFrom) ? testFrom : defaultEmail;
  const updateAlias = (index, key, value) => onChange({ ...config,
    smtpAliases: aliases.map((alias, i) => i === index ? { ...alias, [key]: value } : alias),
    smtpFromEmail: key === 'email' && aliases[index].email === defaultEmail ? value : config.smtpFromEmail,
  });
  return (
    <section className="space-y-4 border-t border-border pt-5" aria-label="Sender aliases">
      <div className="ui-actions flex items-center justify-between gap-3">
        <div className="min-w-0"><h3 className="text-sm font-semibold">Sender aliases</h3><p className="text-xs text-muted mt-1">SMTP login stays on the main mailbox. Add only aliases already authorized by your email provider.</p></div>
        <button type="button" disabled={disabled || aliases.length >= 20} onClick={() => onChange({ ...config, smtpAliases: [...aliases, { email: '', name: '' }] })}
          className="flex items-center justify-center gap-2 border border-border rounded-xl px-3 py-2 text-sm disabled:opacity-50"><Plus className="w-4 h-4" />Add Alias</button>
      </div>
      {aliases.map((alias, index) => (
        <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] items-end gap-3 rounded-xl border border-border p-3">
          <label className="text-xs text-muted">Alias email {index + 1}
            <input aria-label={`Alias email ${index + 1}`} type="email" disabled={disabled} value={alias.email} placeholder="sales@your-domain.com" maxLength={254}
              onChange={e => updateAlias(index, 'email', e.target.value.trim().toLowerCase())} className="block w-full mt-1.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm" /></label>
          <label className="text-xs text-muted">Display name (optional)
            <input aria-label={`Alias display name ${index + 1}`} disabled={disabled} value={alias.name} maxLength={150} placeholder={config.smtpFromName || 'Uses mailbox display name'}
              onChange={e => updateAlias(index, 'name', e.target.value)} className="block w-full mt-1.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm" /></label>
          <button type="button" disabled={disabled} aria-label={`Remove alias ${index + 1}`} onClick={() => onChange({ ...config,
            smtpAliases: aliases.filter((_, i) => i !== index), smtpFromEmail: defaultEmail === alias.email ? primary : defaultEmail,
          })} className="ui-icon-button justify-self-end rounded-xl p-3 border border-border text-red-500"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-xs text-muted">Default sender
          <select aria-label="Default sender" disabled={disabled} value={defaultEmail} onChange={e => onChange({ ...config, smtpFromEmail: e.target.value })}
            className="block w-full mt-1.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm">
            {!senders.some(sender => sender.email === defaultEmail) && <option value={defaultEmail}>{defaultEmail || 'Enter SMTP mailbox first'} — unavailable</option>}
            {senders.map((sender, index) => <option key={index} value={sender.email}>{sender.name || config.smtpFromName || 'Sender'} — {sender.email}{index === 0 ? ' (mailbox)' : ''}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">Test email sender
          <select aria-label="Test email sender" disabled={disabled} value={selectedTest} onChange={e => onTestFromChange(e.target.value)}
            className="block w-full mt-1.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm">
            {!senders.length && <option value="">Enter SMTP mailbox first</option>}
            {senders.map((sender, index) => <option key={index} value={sender.email}>{sender.email}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted">The default applies to new campaigns and transactional emails. Each campaign can choose a different sender. Replies go to the chosen address. Test every alias and inspect received From/Reply-To headers; connection testing alone does not verify alias authorization or inbox delivery.</p>
    </section>
  );
}
