'use client';

import { useCallback, useEffect, useState } from 'react';
import { getEmailSendingSafety, resetEmailSendingSafety, reportEmailProviderSuspension } from '@/app/actions/email-campaigns';

export default function SendingSafetyPanel({ reloadKey }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true); setError(''); setConfirmed(false);
    try {
      const result = await getEmailSendingSafety();
      if (result.success) setState(result.data);
      else { setState(null); setError(result.error); }
    } catch { setState(null); setError('Could not load sending safety. Please refresh.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load, reloadKey]);
  return <section className="space-y-3 rounded-xl border border-border p-4" aria-label="Email sending safety">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold text-foreground">Sending safety — saved SMTP mailbox</h3>
      <button type="button" disabled={busy} onClick={load} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">Refresh safety status</button>
    </div>
    <p className="text-sm text-muted">SMTP connection testing checks login, not permission to send or inbox delivery. Provider suspension is separate from this CRM safety stop. Aliases share the main mailbox gate.</p>
    {error && <p role="alert" className="text-sm text-danger break-words">{error}</p>}
    {state && <p role="status" className={`text-sm break-words ${state.blocked ? 'text-danger' : 'text-muted'}`}>{state.mailbox}: {state.blocked ? 'CRM sending stopped. ' + state.reason : 'No recorded CRM safety stop. This does not verify the provider mailbox is active or that messages reach inboxes.'}</p>}
    {state && !state.blocked && state.canReset && <>
      <p className="text-sm text-muted">If Hostinger sent a suspension notice after SMTP accepted a message, report it here to stop further CRM sends for this saved mailbox and every alias. This does not cancel a message already in flight or stop other apps.</p>
      <button type="button" disabled={busy} className="rounded-lg border border-danger px-3 py-2 text-sm text-danger disabled:opacity-50" onClick={async () => {
        if (!window.confirm(`Hostinger/provider has suspended ${state.mailbox}? Stop further CRM emails for this saved mailbox and all aliases until an administrator confirms provider recovery.`)) return;
        setBusy(true); setError('');
        try {
          const result = await reportEmailProviderSuspension({ mailboxKey: state.mailboxKey, acknowledge: true });
          if (!result.success) { setError(result.error); return; }
          await load();
        } catch { setError('Could not record the provider suspension. Do not send or retry; refresh safety status.'); }
        finally { setBusy(false); }
      }}>Provider suspended sending — stop CRM emails</button>
    </>}
    {state?.blocked && <>
      <p className="text-sm text-muted">First review provider Email Logs, unknown devices/app passwords, sending limits and recipient consent. Resolve the suspension with the provider. Resetting below does not unsuspend Hostinger, replay failed messages, or resume paused campaigns.</p>
      {state.canReset && <>
        <label className="flex items-start gap-2 text-sm text-foreground"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} className="mt-1" />I have secured the mailbox, reviewed provider logs and confirmed the provider has restored sending.</label>
        <button type="button" disabled={!confirmed || busy} className="rounded-lg border border-danger px-3 py-2 text-sm text-danger disabled:opacity-50" onClick={async () => {
          setBusy(true); setError('');
          try {
            const result = await resetEmailSendingSafety({ blockedAt: state.blockedAt, mailboxKey: state.mailboxKey, acknowledge: confirmed });
            if (!result.success) { setError(result.error); return; }
            await load();
          } catch { setError('Could not reset the stop. Refresh before trying again.'); }
          finally { setBusy(false); setConfirmed(false); }
        }}>Reset CRM stop after provider recovery</button>
      </>}
    </>}
  </section>;
}
