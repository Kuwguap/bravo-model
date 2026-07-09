'use client'

import type { DashboardInvoice } from '@/lib/supabase/dashboard-data'

function dollarLabel (cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`
}

function dateLabel (iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function statusChip (status: DashboardInvoice['status']) {
  switch (status) {
    case 'paid':
      return { label: 'Paid', cls: 'bg-[#EEF6F0] text-[#1F5E3A] ring-[#B7D9C4]', icon: '✓' }
    case 'due':
      return { label: 'Due', cls: 'bg-amber-50 text-amber-800 ring-amber-200', icon: '•' }
    case 'pending':
      return { label: 'Processing', cls: 'bg-[#EEF6F0] text-[#164A2E] ring-[#B7D9C4]', icon: '…' }
    case 'failed':
      return { label: 'Failed', cls: 'bg-red-50 text-red-700 ring-red-200', icon: '!' }
    case 'refunded':
      return { label: 'Refunded', cls: 'bg-[#ECE8DD] text-[#232B36] ring-[#E4E7EC]', icon: '↺' }
    case 'void':
      return { label: 'Void', cls: 'bg-[#ECE8DD] text-[#5A6472] ring-[#E4E7EC]', icon: '-' }
  }
}

export default function BillingHistoryCard ({ invoices }: { invoices: DashboardInvoice[] }) {
  return (
    <section className="surface-card p-6 md:p-8">
      <h2 className="text-lg font-semibold text-[#12161C]">Billing history</h2>
      <p className="mt-1 text-sm text-[#6B7480]">
        Every charge attempt against your policy — synced from Stripe.
      </p>

      {invoices.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-[#E4E7EC] bg-[#F5F3EC] px-4 py-6 text-center text-sm text-[#6B7480]">
          No invoices yet. Your billing history will appear here once your first payment posts.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-[#ECE8DD]">
          {invoices.map(inv => {
            const chip = statusChip(inv.status)
            return (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-4 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#12161C]">{inv.periodLabel}</p>
                  <p className="text-xs text-[#6B7480]">
                    {inv.status === 'paid' && inv.paidAtIso
                      ? `Paid ${dateLabel(inv.paidAtIso)}`
                      : `Due ${dateLabel(inv.dueDateIso)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${chip.cls}`}
                  >
                    <span aria-hidden>{chip.icon}</span>
                    {chip.label}
                  </span>
                  <span className="font-semibold text-[#12161C]">
                    {dollarLabel(inv.amountCents)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
