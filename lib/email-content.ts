const automaticVariables = new Set(['customerName', 'storeName', 'storePhone', 'storeEmail', 'storeAddress', 'storeUrl'])

/** Templates may keep editable placeholders; live campaigns must resolve them. */
export function assertEmailContentReady(subject: string, body: string, variantB?: { subject?: string; body?: string } | null) {
  const unresolved = new Set<string>()
  for (const content of [subject, body, variantB?.subject || '', variantB?.body || '']) {
    for (const match of content.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
      if (!automaticVariables.has(match[1])) unresolved.add(match[1])
    }
  }
  if (unresolved.size) throw new Error(`Replace these editable placeholders with actual values before sending: ${[...unresolved].join(', ')}. Only customerName and storeName/storePhone/storeEmail/storeAddress/storeUrl are filled automatically.`)
}
