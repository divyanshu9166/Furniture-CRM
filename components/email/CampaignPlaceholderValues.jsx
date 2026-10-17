'use client';

import { useState } from 'react';
import { applyEditableEmailValues, findEditableEmailPlaceholders } from '@/lib/email-content';

export default function CampaignPlaceholderValues({ form, onChange, disabled }) {
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const issues = findEditableEmailPlaceholders(form.subject, form.body, form.isABTest ? { subject: form.variantBSubject, body: form.variantBBody } : null);
  const keys = [...new Set(issues.map(issue => issue.key))];
  const valueFor = key => typeof values[key] === 'string' ? values[key] : '';
  if (!keys.length) return <p role="status" className="text-xs text-muted">No unresolved editable placeholders in the active subject/body. Save the campaign to persist your changes.</p>;
  return <section aria-label="Campaign placeholder values" className="space-y-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
    <h3 className="text-sm font-semibold text-foreground">Fill template values before sending</h3>
    <p className="text-xs text-muted">Enter each actual value once and apply it to every matching occurrence in this campaign&apos;s active subject, HTML and A/B variant. Customer/store personalization stays automatic. The original template is not changed.</p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {keys.map(key => <label key={key} className="min-w-0 space-y-1 text-xs text-muted">
        <span className="block font-medium text-foreground break-all">{key}</span>
        <input type="text" value={valueFor(key)} maxLength={500} disabled={disabled} placeholder={`Actual value for ${key}`} onChange={event => { setValues(current => ({ ...current, [key]: event.target.value })); setError(''); }} className="w-full min-w-0 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground" />
        <span className="block">Remaining in: {issues.filter(issue => issue.key === key).map(issue => `${issue.label} (${issue.count})`).join(', ')}</span>
      </label>)}
    </div>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <button type="button" disabled={disabled || keys.some(key => !valueFor(key).trim())} className="rounded-xl border border-border px-3 py-2 text-sm text-accent disabled:opacity-50" onClick={() => {
      try { onChange(applyEditableEmailValues(form, values)); setError(''); }
      catch (failure) { setError(failure.message || 'Could not apply values. Review the fields.'); }
    }}>Apply values to campaign</button>
    <p className="text-xs text-muted">Then click Save Changes. Applying values alone does not save or send an email.</p>
  </section>;
}
