"use client";

import { useEffect, useState } from "react";
import { listSectionAccounts, saveSectionAccess } from "@/app/actions/section-access";
import { allowedSections, sections } from "@/lib/section-catalog";

export default function SectionAccessSettings() {
  const [accounts, setAccounts] = useState(null);
  const [selected, setSelected] = useState("");
  const [overrides, setOverrides] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listSectionAccounts().then(result => {
      if (cancelled) return;
      setAccounts(result.success ? result.data : []);
      if (!result.success) setMessage({ error: result.error });
    }).catch(() => {
      if (!cancelled) {
        setAccounts([]);
        setMessage({ error: "Unable to load login accounts. Refresh to retry." });
      }
    });
    return () => { cancelled = true; };
  }, []);

  const account = accounts?.find(user => String(user.id) === selected);
  const enabled = account ? allowedSections(account.role, overrides) : [];
  async function save() {
    if (!account || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveSectionAccess(account.id, overrides);
      if (result.success) {
        setAccounts(rows => rows.map(row => row.id === account.id ? { ...row, overrides } : row));
        setMessage({ text: "Section access saved. Ask the user to refresh the CRM menu." });
      } else setMessage({ error: result.error });
    } catch {
      setMessage({ error: "Could not save permissions. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-5 space-y-4 rounded-xl border border-border bg-surface p-4 md:p-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Section access by account</h2>
        <p className="mt-1 text-sm text-muted">
          Choose which sections each Staff or Manager login can open. Settings stays admin-only.
          Existing restrictions on privileged actions still apply. Related sections may share basic lookup data.
        </p>
      </div>
      <label className="block text-sm text-foreground">
        Staff or Manager login
        <select value={selected} disabled={!accounts?.length || saving} onChange={event => {
          const id = event.target.value;
          setSelected(id);
          setOverrides(accounts.find(user => String(user.id) === id)?.overrides ?? {});
          setMessage(null);
        }} className="mt-1 block w-full max-w-lg rounded-lg border border-border bg-background p-2.5">
          <option value="">{accounts === null ? "Loading accounts…" : accounts.length ? "Select a login" : "No active Staff or Manager logins"}</option>
          {accounts?.map(user => (
            <option key={user.id} value={user.id}>{user.name} — {user.email} ({user.role})</option>
          ))}
        </select>
      </label>
      {account && (
        <>
          <fieldset disabled={saving} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-sm text-muted">{enabled.length} sections enabled</legend>
            {Object.entries(sections).map(([key, section]) => (
              <label key={key} className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm text-foreground">
                <input type="checkbox" checked={enabled.includes(key)} className="size-4 accent-[var(--accent)]"
                  onChange={event => setOverrides(old => ({ ...old, [key]: event.target.checked }))} />
                {section.label}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={saving} onClick={() => setOverrides({})}
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground">
              Use role defaults
            </button>
            <button type="button" disabled={saving} onClick={save}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {saving ? "Saving…" : "Save section access"}
            </button>
          </div>
        </>
      )}
      {message && <p role={message.error ? "alert" : "status"}
        className={message.error ? "text-sm text-red-600" : "text-sm text-green-600"}>
        {message.error || message.text}
      </p>}
    </section>
  );
}
