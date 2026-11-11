import { ChevronDown, ChevronRight } from 'lucide-react'
import { Fragment, useState } from 'react'
import { usePoll } from '../../app/data'
import { cx, day, money, plural } from '../../app/format'
import { Page, PageHeader } from '../../components/v2/shell'
import { Badge, ButtonLink, EmptyState, Table, Td, Th, Tr } from '../../components/v2/ui'
import { api } from '../../lib/api'
import { ExternalLink } from 'lucide-react'


export default function PurchaseOrders() {
  const { data } = usePoll(() => api.records(), 6000)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const vendor = (id: string) => data?.vendors.find(v => v.vendor_id === id)?.legal_name ?? id
  const pos = data?.pos ?? []
  const toggle = (k: string) => setOpen(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const sheet = data?.tab_urls?.POs ?? data?.sheet_url

  return (
    <>
      <PageHeader title="Purchase orders"
        actions={sheet ? <ButtonLink href={sheet} target="_blank" rel="noreferrer" icon={<ExternalLink size={16} />}>Open spreadsheet</ButtonLink> : undefined} />
      <Page>
        {data && pos.length === 0 ? (
          <div className="rounded-panel border border-line bg-surface"><EmptyState>No purchase orders.</EmptyState></div>
        ) : (
          <Table minWidth={900} footer={`${plural(pos.length, 'purchase order')} · ${money(pos.reduce((a, p) => a + p.total, 0))}`}>
            <thead><tr>
              <Th className="w-8" aria-label="Expand" /><Th>PO</Th><Th>Vendor</Th><Th>Description</Th><Th align="right">Created</Th>
              <Th align="right">Amount</Th><Th align="right">Billed</Th><Th align="right">Remaining</Th><Th>Status</Th>
            </tr></thead>
            <tbody>
              {pos.map(p => {
                const isOpen = open.has(p.po_number)
                return (
                  <Fragment key={p.po_number}>
                    <Tr onClick={() => toggle(p.po_number)}>
                      <Td className="text-fg-subtle">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</Td>
                      <Td>{p.po_number}</Td>
                      <Td className="whitespace-nowrap">{vendor(p.vendor_id)}</Td>
                      <Td wrap className="text-fg-muted">{p.description}</Td>
                      <Td numeric className="text-fg-muted">{day(p.created_date)}</Td>
                      <Td numeric>{money(p.total)}</Td>
                      <Td numeric className={cx(p.amount_invoiced > p.total + 0.005 && 'text-danger-fg')}>{money(p.amount_invoiced)}</Td>
                      <Td numeric className={cx(p.remaining < -0.005 && 'font-medium text-danger-fg')}>{money(p.remaining)}</Td>
                      <Td><Badge>{p.status === 'open' ? 'Open' : 'Closed'}</Badge></Td>
                    </Tr>
                    {isOpen && (
                      <tr className="border-b border-line">
                        <td />
                        <td colSpan={8} className="pb-3 pr-4">
                          <table className="w-full text-table">
                            <thead><tr className="text-caption text-fg-subtle">
                              <th className="h-8 text-left font-medium">Line</th><th className="text-left font-medium">Item code</th><th className="text-left font-medium">Description</th>
                              <th className="text-right font-medium">Ordered</th><th className="text-right font-medium">Received</th><th className="text-right font-medium">Billed</th>
                              <th className="text-right font-medium">Remaining</th><th className="text-right font-medium">Unit price</th>
                            </tr></thead>
                            <tbody>
                              {p.lines.map((l: any) => (
                                <tr key={l.line_no} className="border-t border-line">
                                  <td className="h-8">{l.line_no}</td><td className="text-fg-muted">{l.sku}</td><td>{l.description}</td>
                                  <td className="text-right tabular-nums">{l.qty_ordered}</td><td className="text-right tabular-nums">{l.qty_received}</td><td className="text-right tabular-nums">{l.qty_invoiced}</td>
                                  <td className={cx('text-right tabular-nums', l.qty_remaining < 0 && 'text-danger-fg')}>{l.qty_remaining}</td><td className="text-right tabular-nums">{money(l.unit_price)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </Table>
        )}
      </Page>
    </>
  )
}
