'use client'

import type {
  DashboardInsuranceData,
  DashboardPolicy,
} from '@/lib/supabase/dashboard-data'
import { termPremiumCentsFromMonthly } from '@/lib/billing/plan-pricing'

function dollarLabel (cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`
}

function dateLabel (iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function planTermLabel (planKey: string): string {
  if (planKey === '12m') return '12-month term'
  if (planKey === '6m') return '6-month term'
  if (planKey === '1m') return '1-month term'
  return 'Policy term'
}

function buildVehicleLabel (vehicle: DashboardInsuranceData | null | undefined): string {
  if (!vehicle) return ''
  const yr = String(vehicle.modelYear ?? '').trim()
  const make = String(vehicle.vehicleMake ?? '').trim()
  const model = String(vehicle.vehicleModel ?? '').trim()
  const composed = [yr, make, model].filter(Boolean).join(' ').trim()
  if (composed) return composed
  const fallback = String(vehicle.vehicleName ?? '').trim()
  return fallback && fallback !== '—' ? fallback : ''
}

function StatusBadge ({ status }: { status: DashboardPolicy['status'] }) {
  const styles: Record<DashboardPolicy['status'], { label: string; cls: string; dot: string }> = {
    active: {
      label: 'Active',
      cls: 'bg-[#EEF6F0] text-[#164A2E] ring-[#B7D9C4]',
      dot: 'bg-[#2E7D4F]',
    },
    pending: {
      label: 'Pending',
      cls: 'bg-amber-50 text-amber-800 ring-amber-200',
      dot: 'bg-amber-500',
    },
    lapsed: {
      label: 'Lapsed',
      cls: 'bg-red-50 text-red-800 ring-red-200',
      dot: 'bg-red-500',
    },
    cancelled: {
      label: 'Cancelled',
      cls: 'bg-[#ECE8DD] text-[#232B36] ring-[#E4E7EC]',
      dot: 'bg-[#8A94A3]',
    },
  }
  const s = styles[status]
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  )
}

type Props = {
  policy: DashboardPolicy
  /**
   * Vehicle linked to this policy (via `policies.vehicle_id`). When present,
   * the card renders the year/make/model + VIN above the policy stats so
   * multi-vehicle customers can tell their policies apart.
   */
  vehicle?: DashboardInsuranceData | null
  /**
   * When true, renders a "Primary vehicle" badge (used for the oldest / first
   * vehicle on multi-policy accounts).
   */
  isPrimary?: boolean
  /**
   * Optional heading override — defaults to "Your policy". Multi-policy
   * dashboards pass "Policy #2", "Policy #3", etc.
   */
  heading?: string
}

export default function PolicyOverviewCard ({
  policy,
  vehicle,
  isPrimary,
  heading,
}: Props) {
  const vehicleLabel = buildVehicleLabel(vehicle)
  const showVehicleBlock = !!vehicle && (vehicleLabel || (vehicle.vin && vehicle.vin !== '—'))
  return (
    <section className="surface-card p-4 sm:p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-[#12161C]">
            {heading ?? 'Your policy'}
          </h2>
          {isPrimary && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF6F0] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#164A2E] ring-1 ring-inset ring-[#B7D9C4]">
              <span aria-hidden>★</span> Primary vehicle
            </span>
          )}
        </div>
        <StatusBadge status={policy.status} />
      </div>

      {showVehicleBlock && vehicle && (
        <div className="mt-4 rounded-2xl border border-[#E4E7EC] bg-[#F5F3EC]/60 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-[#6B7480]">
            Insured vehicle
          </p>
          <p className="mt-1 text-base font-semibold text-[#12161C]">
            {vehicleLabel || 'Vehicle on file'}
          </p>
          {vehicle.vin && vehicle.vin !== '—' && (
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-[#6B7480]">
              VIN {vehicle.vin}
            </p>
          )}
        </div>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-y-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-[#6B7480]">
            Policy number
          </dt>
          <dd className="mt-1 break-all font-mono text-base font-bold text-[#12161C]">
            {policy.policyNumber}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-[#6B7480]">
            Policy term
          </dt>
          <dd className="mt-1 text-base font-semibold text-[#12161C]">
            {planTermLabel(policy.planKey)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-[#6B7480]">
            Renewal date
          </dt>
          <dd className="mt-1 text-base font-semibold text-[#12161C]">
            {dateLabel(policy.renewalDateIso)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-[#6B7480]">
            Policy premium
          </dt>
          <dd className="mt-1 text-base font-semibold text-[#12161C]">
            {dollarLabel(termPremiumCentsFromMonthly(policy.planKey, policy.monthlyPremiumCents))}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-[#6B7480]">
            Current period ends
          </dt>
          <dd className="mt-1 text-base font-semibold text-[#12161C]">
            {dateLabel(policy.currentPeriodEndIso)}
          </dd>
        </div>
      </dl>
    </section>
  )
}
