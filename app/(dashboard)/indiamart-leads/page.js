import { getIndiaMartConfig, getIndiaMartLeads } from '@/app/actions/indiamart'
import IndiaMartLeadsClient from './IndiaMartLeadsClient'

export default async function IndiaMartLeadsPage() {
  const [configRes, leadsRes] = await Promise.all([
    getIndiaMartConfig(),
    getIndiaMartLeads(500),
  ])
  const initialError = !configRes.success
    ? configRes.error || 'Failed to load IndiaMART configuration.'
    : (!leadsRes.success ? leadsRes.error || 'Failed to load IndiaMART leads.' : null)

  return (
    <IndiaMartLeadsClient
      initialConfig={configRes.success ? configRes.data : null}
      initialRows={leadsRes.success ? leadsRes.data : []}
      initialError={initialError}
    />
  )
}
