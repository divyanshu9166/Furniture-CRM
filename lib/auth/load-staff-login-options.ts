export type StaffLoginOption = { id: number; name: string; role: string }

const loadError = 'Unable to load staff names. Please retry or contact your admin.'

export async function loadStaffLoginOptions(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<StaffLoginOption[]> {
  const response = await fetcher('/api/auth/staff-options', { cache: 'no-store', signal })
  if (!response.ok) throw new Error(loadError)
  const result = await response.json()
  if (result?.success !== true || !Array.isArray(result.data) || !result.data.every((item: StaffLoginOption) =>
    item && Number.isSafeInteger(item.id) && item.id > 0 && typeof item.name === 'string' && typeof item.role === 'string'
  )) throw new Error(loadError)
  return result.data.map(({ id, name, role }: StaffLoginOption) => ({ id, name, role }))
}
