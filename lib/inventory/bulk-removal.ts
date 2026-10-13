type RemovalResult = { success: boolean; error?: string; data?: { movedIds: number[]; errors: { id: number; error: string }[] } }

// Short requests avoid one huge server action timing out after partial progress.
// Never retry an ambiguous response automatically: refresh first.
export async function removeInChunks(ids: number[], remove: (chunk: number[]) => Promise<RemovalResult>, progress?: (done: number, total: number) => void) {
  const selected = [...new Set(ids)]
  const movedIds: number[] = []; const errors: { id: number; error: string }[] = []
  for (let offset = 0; offset < selected.length; offset += 25) {
    const chunk = selected.slice(offset, offset + 25)
    let result: RemovalResult
    try { result = await remove(chunk) } catch { result = { success: false, error: 'Request interrupted. Refresh before retrying; some items may already be in Drafts.' } }
    if (!result.success || !result.data || !Array.isArray(result.data.movedIds) || !Array.isArray(result.data.errors)) {
      errors.push(...selected.slice(offset).map(id => ({ id, error: result.error || 'Unable to confirm deletion. Refresh before retrying.' })))
      break
    }
    const moved = new Set(result.data.movedIds.filter(id => chunk.includes(id)))
    const failed = new Map(result.data.errors.filter(row => chunk.includes(row.id)).map(row => [row.id, row.error]))
    for (const id of chunk) {
      if (moved.has(id) && !failed.has(id)) movedIds.push(id)
      else errors.push({ id, error: failed.get(id) || 'No confirmed result for this item. Refresh before retrying.' })
    }
    progress?.(Math.min(offset + chunk.length, selected.length), selected.length)
  }
  return { movedIds, errors }
}
