import { ExternalLink } from 'lucide-react'
import { usePoll } from '../../app/data'
import { bank, plural } from '../../app/format'
import { Page, PageHeader } from '../../components/v2/shell'
import { Badge, ButtonLink, EmptyState, Stack, Table, Td, Th, Tr } from '../../components/v2/ui'
import { api } from '../../lib/api'

export default function Vendors() {
  const { data } = usePoll(() => api.records(), 10000)
  const vendors = data?.vendors ?? []
  const openPos = (id: string) => (data?.pos ?? []).filter(p => p.vendor_id === id && p.status === 'open').length
  const sheet = data?.tab_urls?.Vendors ?? data?.sheet_url

  return (
    <>
      <PageHeader title="Vendors"
        actions={sheet ? <ButtonLink href={sheet} target="_blank" rel="noreferrer" icon={<ExternalLink size={16} />}>Open spreadsheet</ButtonLink> : undefined} />
      <Page>
        {data && vendors.length === 0 ? (
          <div className="rounded-panel border border-line bg-surface"><EmptyState>No vendors.</EmptyState></div>
        ) : (
          <Table footer={plural(vendors.length, 'vendor')}>
            <thead><tr><Th>Vendor</Th><Th>Vendor ID</Th><Th>Status</Th><Th>Bank account</Th><Th>Phone on file</Th><Th align="right">Open POs</Th></tr></thead>
            <tbody>
              {vendors.map(v => (
                <Tr key={v.vendor_id}>
                  <Td className="whitespace-nowrap"><Stack primary={v.legal_name} secondary={v.aliases?.length ? `Also ${v.aliases.join(', ')}` : undefined} /></Td>
                  <Td className="tabular-nums text-fg-muted">{v.vendor_id}</Td>
                  <Td>{v.approved ? <Badge tone="success">Approved</Badge> : <Badge tone="warning">Not approved</Badge>}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{bank(v.bank_name, v.bank_account)}</Td>
                  <Td className="whitespace-nowrap tabular-nums text-fg-muted">{v.phone_on_file}</Td>
                  <Td numeric>{openPos(v.vendor_id)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Page>
    </>
  )
}
