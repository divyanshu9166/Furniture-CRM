'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Contact, CustomField, Tag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users,
  Tags,
  Filter,
  Upload,
  CheckSquare,
  Loader2,
  ArrowRight,
  ArrowLeft,
  X,
} from 'lucide-react';

type AudienceType = 'all' | 'tags' | 'custom_field' | 'manual' | 'csv';
type CustomFieldOperator = 'is' | 'is_not' | 'contains';

interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

interface AudienceConfig {
  type: AudienceType;
  tagIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: { phone: string; name?: string }[];
  selectedContactIds?: string[];
  excludeTagIds?: string[];
}

interface Step2Props {
  audience: AudienceConfig;
  onUpdate: (audience: AudienceConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

const audienceOptions: {
  type: AudienceType;
  label: string;
  description: string;
  icon: typeof Users;
}[] = [
  {
    type: 'all',
    label: 'All Contacts',
    description: 'Send to every contact in your database',
    icon: Users,
  },
  {
    type: 'tags',
    label: 'Filter by Tags',
    description: 'Target contacts with specific tags',
    icon: Tags,
  },
  {
    type: 'custom_field',
    label: 'Custom Field',
    description: 'Filter by a custom field value',
    icon: Filter,
  },
  {
    type: 'manual',
    label: 'Select Contacts',
    description: 'Pick specific contacts from your list',
    icon: CheckSquare,
  },
  {
    type: 'csv',
    label: 'Upload CSV',
    description: 'Upload a list of phone numbers',
    icon: Upload,
  },
];

const OPERATOR_OPTIONS: { value: CustomFieldOperator; label: string }[] = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'contains', label: 'contains' },
];

const MANUAL_PAGE_SIZE = 20;

export function Step2SelectAudience({
  audience,
  onUpdate,
  onNext,
  onBack,
}: Step2Props) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [manualContacts, setManualContacts] = useState<Contact[]>([]);
  const [manualSearch, setManualSearch] = useState('');
  const [manualPage, setManualPage] = useState(0);
  const [manualTotal, setManualTotal] = useState(0);
  const [manualLoading, setManualLoading] = useState(false);

  // Tags are used both by the primary "Filter by Tags" audience type
  // AND by the exclude-list below — so always load once on mount.
  useEffect(() => {
    async function fetchTags() {
      setLoadingTags(true);
      try {
        const supabase = createClient();
        const { data } = await supabase.from('tags').select('*').order('name');
        setTags(data ?? []);
      } finally {
        setLoadingTags(false);
      }
    }
    fetchTags();
  }, []);

  // Lazy-load custom fields only when that audience type is active.
  useEffect(() => {
    if (audience.type !== 'custom_field') return;
    async function fetchFields() {
      setLoadingFields(true);
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('custom_fields')
          .select('*')
          .order('field_name');
        setCustomFields(data ?? []);
      } finally {
        setLoadingFields(false);
      }
    }
    fetchFields();
  }, [audience.type]);

  const fetchManualContacts = useCallback(async () => {
    if (audience.type !== 'manual') return;
    setManualLoading(true);
    try {
      const supabase = createClient();
      const from = manualPage * MANUAL_PAGE_SIZE;
      const to = from + MANUAL_PAGE_SIZE - 1;

      let query = supabase
        .from('contacts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (manualSearch.trim()) {
        const term = `%${manualSearch.trim()}%`;
        query = query.or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      setManualContacts(data ?? []);
      setManualTotal(count ?? 0);
    } catch {
      setManualContacts([]);
      setManualTotal(0);
    } finally {
      setManualLoading(false);
    }
  }, [audience.type, manualPage, manualSearch]);

  useEffect(() => {
    fetchManualContacts();
  }, [fetchManualContacts]);

  const fetchEstimatedCount = useCallback(async () => {
    setLoadingCount(true);
    try {
      const supabase = createClient();

      // Base query — produces the superset before exclude is applied.
      let baseIds: Set<string> | null = null; // null means "all contacts"

      if (audience.type === 'all') {
        // Handled below — full-table count adjusted by excludes.
      } else if (
        audience.type === 'tags' &&
        audience.tagIds &&
        audience.tagIds.length > 0
      ) {
        const { data } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.tagIds);
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (
        audience.type === 'custom_field' &&
        audience.customField?.fieldId &&
        audience.customField.value
      ) {
        const { fieldId, operator, value } = audience.customField;
        let q = supabase
          .from('contact_custom_values')
          .select('contact_id')
          .eq('custom_field_id', fieldId);
        if (operator === 'is') q = q.eq('value', value);
        else if (operator === 'is_not') q = q.neq('value', value);
        else q = q.ilike('value', `%${value}%`);
        const { data } = await q;
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (
        audience.type === 'manual' &&
        audience.selectedContactIds &&
        audience.selectedContactIds.length > 0
      ) {
        baseIds = new Set(audience.selectedContactIds);
      } else if (
        audience.type === 'csv' &&
        audience.csvContacts &&
        audience.csvContacts.length > 0
      ) {
        setEstimatedCount(audience.csvContacts.length);
        return;
      } else {
        // Partially-configured audience — wait for the user to finish.
        setEstimatedCount(null);
        return;
      }

      // Apply exclude tags
      let excludeSet: Set<string> | null = null;
      if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
        const { data: excludeRows } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.excludeTagIds);
        excludeSet = new Set((excludeRows ?? []).map((r) => r.contact_id));
      }

      if (baseIds) {
        const effective = [...baseIds].filter(
          (id) => !excludeSet?.has(id),
        );
        setEstimatedCount(effective.length);
      } else {
        // "All" — fetch the total, then subtract exclude set if any.
        const { count } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true });
        const total = count ?? 0;
        setEstimatedCount(excludeSet ? Math.max(0, total - excludeSet.size) : total);
      }
    } finally {
      setLoadingCount(false);
    }
  }, [
    audience.type,
    audience.tagIds,
    audience.customField,
    audience.csvContacts,
    audience.selectedContactIds,
    audience.excludeTagIds,
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEstimatedCount();
  }, [fetchEstimatedCount]);

  function toggleTag(tagId: string) {
    const current = audience.tagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, tagIds: updated });
  }

  function toggleExcludeTag(tagId: string) {
    const current = audience.excludeTagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, excludeTagIds: updated });
  }

  function updateCustomField(patch: Partial<CustomFieldFilter>) {
    const prev = audience.customField ?? {
      fieldId: '',
      operator: 'is' as CustomFieldOperator,
      value: '',
    };
    onUpdate({ ...audience, customField: { ...prev, ...patch } });
  }

  function toggleManualContact(contactId: string) {
    const current = audience.selectedContactIds ?? [];
    const updated = current.includes(contactId)
      ? current.filter((id) => id !== contactId)
      : [...current, contactId];
    onUpdate({ ...audience, selectedContactIds: updated });
  }

  function clearManualSelection() {
    onUpdate({ ...audience, selectedContactIds: [] });
  }

  function toggleManualPageSelection() {
    const pageIds = manualContacts.map((contact) => contact.id);
    if (pageIds.length === 0) return;
    const current = new Set(audience.selectedContactIds ?? []);
    const allSelected = pageIds.every((id) => current.has(id));
    let updated: string[];
    if (allSelected) {
      updated = (audience.selectedContactIds ?? []).filter(
        (id) => !pageIds.includes(id),
      );
    } else {
      updated = [...new Set([...(audience.selectedContactIds ?? []), ...pageIds])];
    }
    onUpdate({ ...audience, selectedContactIds: updated });
  }

  const selectedContactIds = audience.selectedContactIds ?? [];
  const selectedContactSet = new Set(selectedContactIds);
  const manualTotalPages = Math.max(1, Math.ceil(manualTotal / MANUAL_PAGE_SIZE));
  const manualFrom = manualTotal === 0 ? 0 : manualPage * MANUAL_PAGE_SIZE + 1;
  const manualTo = Math.min((manualPage + 1) * MANUAL_PAGE_SIZE, manualTotal);
  const manualHasPrev = manualPage > 0;
  const manualHasNext = manualPage + 1 < manualTotalPages;
  const manualPageSelected =
    manualContacts.length > 0 &&
    manualContacts.every((contact) => selectedContactSet.has(contact.id));

  const isValid =
    audience.type === 'all' ||
    (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) ||
    (audience.type === 'custom_field' &&
      !!audience.customField?.fieldId &&
      audience.customField.value.length > 0) ||
    (audience.type === 'manual' && selectedContactIds.length > 0) ||
    (audience.type === 'csv' &&
      audience.csvContacts &&
      audience.csvContacts.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Select Audience</h2>
        <p className="mt-1 text-sm text-muted">
          Choose who will receive this broadcast.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {audienceOptions.map((option) => {
          const isSelected = audience.type === option.type;
          const Icon = option.icon;
          return (
            <button
              key={option.type}
              onClick={() =>
                onUpdate({
                  ...audience,
                  type: option.type,
                  // Wipe shape fields from other types to avoid stale
                  // config leaking across selections.
                  tagIds: option.type === 'tags' ? audience.tagIds : undefined,
                  customField:
                    option.type === 'custom_field'
                      ? audience.customField
                      : undefined,
                  csvContacts:
                    option.type === 'csv' ? audience.csvContacts : undefined,
                  selectedContactIds:
                    option.type === 'manual'
                      ? audience.selectedContactIds
                      : undefined,
                })
              }
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? 'border-accent bg-accent ring-1 ring-accent'
                  : 'border-border bg-surface hover:border-border'
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  isSelected
                    ? 'bg-accent text-accent'
                    : 'bg-surface-light text-muted'
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{option.label}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {option.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {audience.type === 'tags' && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-3 text-sm font-medium text-foreground">Select Tags</p>
          {loadingTags ? (
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          ) : tags.length === 0 ? (
            <p className="text-xs text-muted">
              No tags found. Create tags in Settings.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = audience.tagIds?.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      isSelected
                        ? 'border-accent bg-accent text-accent'
                        : 'border-border bg-surface-light text-foreground hover:border-border'
                    }`}
                  >
                    <span
                      className="mr-1.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {audience.type === 'custom_field' && (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-medium text-foreground">Custom Field Filter</p>
          {loadingFields ? (
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          ) : customFields.length === 0 ? (
            <p className="text-xs text-muted">
              No custom fields defined. Create one in Settings → Custom Fields.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)]">
              <select
                value={audience.customField?.fieldId ?? ''}
                onChange={(e) => updateCustomField({ fieldId: e.target.value })}
                className="h-9 rounded-lg border border-border bg-surface-light px-2.5 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                <option value="">Select field…</option>
                {customFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.field_name}
                  </option>
                ))}
              </select>
              <select
                value={audience.customField?.operator ?? 'is'}
                onChange={(e) =>
                  updateCustomField({
                    operator: e.target.value as CustomFieldOperator,
                  })
                }
                className="h-9 rounded-lg border border-border bg-surface-light px-2.5 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                {OPERATOR_OPTIONS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={audience.customField?.value ?? ''}
                onChange={(e) => updateCustomField({ value: e.target.value })}
                placeholder="Value"
                className="h-9 rounded-lg border border-border bg-surface-light px-2.5 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
          )}
        </div>
      )}

      {audience.type === 'manual' && (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">Select Contacts</p>
              <p className="mt-1 text-xs text-muted">
                Choose specific contacts to receive this broadcast.
              </p>
            </div>
            {selectedContactIds.length > 0 && (
              <button
                type="button"
                onClick={clearManualSelection}
                className="text-xs font-medium text-muted hover:text-foreground"
              >
                Clear selection
              </button>
            )}
          </div>

          <Input
            value={manualSearch}
            onChange={(e) => {
              setManualSearch(e.target.value);
              setManualPage(0);
            }}
            placeholder="Search by name, phone, or email..."
            className="border-border bg-surface-light text-foreground placeholder:text-muted"
          />

          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {manualTotal > 0
                ? `Showing ${manualFrom}-${manualTo} of ${manualTotal}`
                : 'No contacts found.'}
            </span>
            <button
              type="button"
              onClick={toggleManualPageSelection}
              className="text-xs font-medium text-muted hover:text-foreground"
            >
              {manualPageSelected ? 'Clear page' : 'Select page'}
            </button>
          </div>

          <div className="rounded-xl border border-border bg-surface-light">
            <ScrollArea className="h-56">
              {manualLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-accent" />
                </div>
              ) : manualContacts.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-xs text-muted">
                  No contacts available.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {manualContacts.map((contact) => (
                    <label
                      key={contact.id}
                      className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-surface"
                    >
                      <input
                        type="checkbox"
                        checked={selectedContactSet.has(contact.id)}
                        onChange={() => toggleManualContact(contact.id)}
                        className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">
                          {contact.name || 'Unnamed'}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {contact.phone}
                          {contact.email ? ` | ${contact.email}` : ''}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setManualPage((p) => Math.max(0, p - 1))}
              disabled={!manualHasPrev}
              className="border-border text-foreground"
            >
              Previous
            </Button>
            <span className="text-xs text-muted">
              Page {manualPage + 1} of {manualTotalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setManualPage((p) => (manualHasNext ? p + 1 : p))}
              disabled={!manualHasNext}
              className="border-border text-foreground"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Exclude list — applies regardless of audience type */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <X className="h-4 w-4 text-red-400" />
          <p className="text-sm font-medium text-foreground">
            Exclude contacts with these tags
          </p>
          <span className="text-xs text-muted">(optional)</span>
        </div>
        {tags.length === 0 ? (
          <p className="text-xs text-muted">No tags available.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isExcluded = audience.excludeTagIds?.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleExcludeTag(tag.id)}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    isExcluded
                      ? 'border-red-500/30 bg-red-500/10 text-red-300'
                      : 'border-border bg-surface-light text-foreground hover:border-border'
                  }`}
                >
                  <span
                    className="mr-1.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Audience Summary */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-2 text-sm font-medium text-foreground">Audience Summary</p>
        {loadingCount ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            <span className="text-xs text-muted">Calculating…</span>
          </div>
        ) : estimatedCount !== null ? (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" />
            <span className="text-sm text-foreground">
              {estimatedCount.toLocaleString()}
            </span>
            <span className="text-xs text-muted">estimated recipients</span>
          </div>
        ) : (
          <p className="text-xs text-muted">
            Select an audience type to see the estimate.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!isValid}
          className="bg-accent text-foreground hover:bg-accent disabled:opacity-50"
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
