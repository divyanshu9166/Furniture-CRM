'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import Modal from '@/components/Modal';
import { getWalkinRequirements, updateWalkinRequirements } from '@/app/actions/walkin-requirements';
import { safeAction } from '@/lib/safe-action';

const loadRequirements = safeAction(getWalkinRequirements);
const saveRequirements = safeAction(updateWalkinRequirements);

export default function RequirementManager({ isOpen, onClose, onSaved }) {
  const [options, setOptions] = useState([]);
  const [revision, setRevision] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);

  const reload = async () => {
    setLoading(true);
    setRevision(null);
    setError('');
    const result = await loadRequirements();
    if (result.success) {
      setOptions(result.data.options);
      setRevision(result.data.revision);
      setConflict(false);
    } else setError(result.error);
    setLoading(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setRevision(null);
      setError('');
      setConflict(false);
      const result = await loadRequirements();
      if (!active) return;
      if (result.success) {
        setOptions(result.data.options);
        setRevision(result.data.revision);
      } else setError(result.error);
      setLoading(false);
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [isOpen]);

  const move = (index, direction) => {
    setOptions(current => {
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  };

  const save = async (event) => {
    event.preventDefault();
    if (saving || loading || revision === null || conflict) return;
    setSaving(true);
    setError('');
    const result = await saveRequirements({ options, revision });
    if (result.success) {
      onSaved(result.data);
      onClose();
    } else {
      setError(result.error);
      setConflict(Boolean(result.conflict));
    }
    setSaving(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!saving) onClose(); }} title="Manage Requirements" size="lg">
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-muted">Add, rename, remove or reorder choices for reception and QR registrations. Changes apply to new visits only; existing records keep their original requirement.</p>
        {loading ? <p className="text-sm text-muted" role="status">Loading requirements...</p> : revision !== null && (
          <fieldset disabled={saving || conflict} className="space-y-2 min-w-0">
            {options.map((option, index) => (
              <div key={index} className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-xl border border-border p-2">
                <label htmlFor={`requirement-option-${index}`} className="sr-only">Requirement {index + 1}</label>
                <input id={`requirement-option-${index}`} value={option} maxLength={100} required
                  onChange={event => setOptions(current => current.map((value, i) => i === index ? event.target.value : value))}
                  placeholder="e.g. Auditorium Seating" className="w-full sm:flex-1 sm:w-auto min-w-0 px-3 py-2 rounded-lg bg-surface border border-border text-sm text-foreground" />
                <div className="flex gap-1 ml-auto">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move requirement ${index + 1} up`} className="p-2 rounded-lg hover:bg-surface-hover disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === options.length - 1} aria-label={`Move requirement ${index + 1} down`} className="p-2 rounded-lg hover:bg-surface-hover disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                  <button type="button" onClick={() => setOptions(current => current.filter((_, i) => i !== index))} disabled={options.length === 1} aria-label={`Remove requirement ${index + 1}`} className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
            <button type="button" disabled={options.length >= 100} onClick={() => setOptions(current => [...current, ''])} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-accent hover:bg-accent-light disabled:opacity-50"><Plus className="w-4 h-4" /> Add Requirement</button>
          </fieldset>
        )}
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        {!loading && (conflict || revision === null) && <button type="button" onClick={reload} className="text-sm text-accent underline">Reload latest list (discards unsaved edits)</button>}
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <button type="button" disabled={saving} onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-muted hover:bg-surface-hover">Cancel</button>
          <button type="submit" disabled={loading || saving || revision === null || conflict} className="px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-50">{saving ? 'Saving...' : 'Save Requirements'}</button>
        </div>
      </form>
    </Modal>
  );
}
