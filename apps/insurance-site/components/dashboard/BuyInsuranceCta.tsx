'use client'

import Link from 'next/link'

type Props = {
  hasActivePolicy: boolean
}

/**
 * Always-visible buy / renew / add-vehicle CTA on the dashboard.
 * Wording adapts to whether the user already has an active policy.
 */
export default function BuyInsuranceCta ({ hasActivePolicy }: Props) {
  const title = hasActivePolicy
    ? 'Add a vehicle or renew early'
    : 'Get covered today'
  const subtitle = hasActivePolicy
    ? 'Buy a new policy for another vehicle, or renew your current coverage ahead of time.'
    : 'Pick a plan, enter your driver and vehicle details, and get your NY FS-20 ID card by email.'
  const cta = hasActivePolicy ? 'Buy another policy' : 'Buy insurance now'

  return (
    <section className="surface-card flex flex-col gap-4 bg-gradient-to-br from-[#EEF6F0] to-[#EEF6F0] p-6 md:flex-row md:items-center md:justify-between md:p-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1F5E3A]">
          Coverage
        </p>
        <h2 className="mt-1 text-xl font-bold text-[#12161C]">{title}</h2>
        <p className="mt-1 max-w-xl text-sm text-[#232B36]">{subtitle}</p>
      </div>
      <Link
        href="/purchase"
        className="btn-primary-brand inline-flex items-center justify-center px-6 py-3 text-sm font-bold uppercase tracking-wide"
      >
        {cta}
      </Link>
    </section>
  )
}
