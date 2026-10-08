'use client';

export default function SenderSelect({ value, onChange, senders = [], defaultEmail = '', disabled = false }) {
  const selected = value || defaultEmail;
  return (
    <div>
      <label htmlFor="campaign-from-email" className="block text-xs font-medium text-muted mb-1.5">Send From / Alias</label>
      <select id="campaign-from-email" value={selected} disabled={disabled} onChange={e => onChange(e.target.value)}
        className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm">
        {!senders.length && <option value="">Configure SMTP in Settings → Email Setup</option>}
        {selected && !senders.some(sender => sender.email === selected) && <option value={selected}>{selected} — unavailable; select another sender</option>}
        {senders.map(sender => <option key={sender.email} value={sender.email}>{sender.name || 'Sender'} — {sender.email}{sender.email === defaultEmail ? ' (default)' : ''}</option>)}
      </select>
      <p className="text-xs text-muted mt-1.5">Replies go to this address. This sender is saved with the campaign and used for immediate, scheduled, A/B and automated emails.</p>
    </div>
  );
}
