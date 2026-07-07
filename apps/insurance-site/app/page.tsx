'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import Link from 'next/link'
import BrandMark from '@/components/BrandMark'

const display = { fontFamily: 'var(--font-oswald), system-ui, sans-serif' }
const mono = { fontFamily: 'ui-monospace, "Space Mono", monospace' }

/** Signature element: a New Jersey insurance ID card that mirrors the issued PDF. */
function InsuranceCard() {
  return (
    <div className="relative w-full max-w-md">
      <div
        className="relative overflow-hidden rounded-2xl border border-white/60 px-7 pb-6 pt-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.5)]"
        style={{ background: 'linear-gradient(155deg,#FBFAF4 0%,#EFECE1 55%,#F7F5EE 100%)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#1F5E3A]" style={display}>
            New Jersey
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5A6472]" style={display}>
            Auto ID Card
          </span>
        </div>
        <h3 className="mt-2 text-lg font-bold uppercase leading-tight text-[#12161C]" style={display}>
          Insurance Identification Card
        </h3>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#12161C]/10 pt-4 text-[13px]">
          {[
            ['Policy no.', 'NJ-2035252790'],
            ['Insured', 'Your name here'],
            ['Vehicle', '2021 Honda Accord'],
            ['Effective', 'JUL 07 2026'],
            ['Expires', 'AUG 06 2026'],
            ['Carrier', 'NJ Coverage'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8A94A3]" style={display}>
                {k}
              </dt>
              <dd className="truncate text-[#12161C]" style={k === 'Policy no.' ? mono : undefined}>
                {v}
              </dd>
            </div>
          ))}
        </dl>

        <div className="pointer-events-none absolute -right-3 top-8 -rotate-[10deg]">
          <span className="inline-block rounded-md border-[3px] border-[#1F5E3A] px-3 py-1 text-lg font-bold uppercase tracking-[0.15em] text-[#1F5E3A]/90" style={display}>
            Active
          </span>
        </div>
      </div>
      <div className="absolute -bottom-2 left-4 right-4 h-6 rounded-b-2xl bg-black/20 blur-xl" />
    </div>
  )
}

export default function Home() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user) router.push('/dashboard')
  }, [user, router])

  return (
    <div className="min-h-screen bg-[#F5F3EC] text-[#12161C]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[#12161C]/10 bg-[#F5F3EC]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <BrandMark href="/" />
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-full px-5 py-2.5 text-sm font-semibold text-[#12161C] hover:bg-[#12161C]/5" style={display}>
              Sign in
            </Link>
            <Link href="/purchase" className="rounded-full bg-[#1F5E3A] px-5 py-2.5 text-sm font-semibold uppercase tracking-wide text-[#F5F3EC] transition hover:bg-[#2E7D4F]" style={display}>
              Get covered
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero — the ID card is the thesis */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(circle at 14% 0%,rgba(31,94,58,0.08),transparent 42%),radial-gradient(circle at 88% 8%,rgba(232,163,61,0.05),transparent 44%)' }}
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5A6472]" style={display}>
              <span className="h-1.5 w-1.5 rounded-full bg-[#1F5E3A]" /> New Jersey · Auto coverage
            </span>
            <h1 className="mt-5 text-5xl font-bold uppercase leading-[0.98] tracking-tight text-[#12161C] sm:text-6xl" style={display}>
              Covered before
              <br />
              you pull off.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-[#3A352C]">
              Buy auto coverage online and get your New Jersey insurance ID card by
              email in minutes. Then manage every policy, vehicle, and payment in one
              clear dashboard.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/purchase" className="rounded-full bg-[#12161C] px-7 py-3.5 text-sm font-semibold uppercase tracking-wide text-[#F5F3EC] transition hover:-translate-y-0.5 hover:shadow-lg" style={display}>
                Get covered →
              </Link>
              <Link href="/login" className="rounded-full border border-[#12161C]/15 px-6 py-3.5 text-sm font-semibold text-[#12161C] transition hover:border-[#12161C]/40" style={display}>
                Sign in
              </Link>
            </div>
            <p className="mt-6 text-sm text-[#5A6472]">
              <span className="text-[#12161C]">1 mo $100</span> · <span className="text-[#12161C]">6 mo $500</span> ·{' '}
              <span className="text-[#12161C]">12 mo $900</span> · <span className="text-[#12161C]">$100/mo recurring</span>
            </p>
          </div>
          <div className="flex justify-center md:justify-end">
            <InsuranceCard />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="mb-10 max-w-lg">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5A6472]" style={display}>The process</span>
          <h2 className="mt-3 text-3xl font-bold uppercase tracking-tight text-[#12161C]" style={display}>
            Coverage in three steps.
          </h2>
        </div>
        <ol className="grid gap-5 sm:grid-cols-3">
          {[
            ['Add your details', 'Driver and vehicle info — VIN, make, model. A couple of minutes.'],
            ['Pick a term & pay', '1, 6, or 12 months, or $100/mo. Secure card payment.'],
            ['Get your ID card', 'Your New Jersey insurance ID card PDF is emailed instantly.'],
          ].map(([t, d], i) => (
            <li key={t} className="rounded-2xl border border-[#12161C]/8 bg-white p-6 shadow-[0_12px_32px_-12px_rgba(18,22,28,0.25)]">
              <span className="text-2xl font-bold text-[#1F5E3A]" style={mono}>{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-3 text-lg font-semibold text-[#12161C]" style={display}>{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5A6472]">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Coverage options */}
      <section className="border-y border-[#12161C]/8 bg-white/60 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mb-10 max-w-lg">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5A6472]" style={display}>What's included</span>
            <h2 className="mt-3 text-3xl font-bold uppercase tracking-tight text-[#12161C]" style={display}>
              Coverage we support.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['Liability', 'Damage you cause to others’ vehicles and property.'],
              ['Collision', 'Damage to your vehicle from collisions.'],
              ['Comprehensive', 'Theft, weather, vandalism, and non-collision losses.'],
              ['Uninsured motorist', 'Protection when the other driver has little or no insurance.'],
              ['Medical payments', 'Medical expenses for you and your passengers.'],
              ['Roadside assistance', 'Towing, lockouts, jumps — help when you’re stranded.'],
            ].map(([t, d]) => (
              <div key={t} className="flex gap-4 rounded-xl border border-[#12161C]/8 bg-white p-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1F5E3A]/12">
                  <svg className="h-5 w-5 text-[#1F5E3A]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-[#12161C]" style={display}>{t}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[#5A6472]">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-[#12161C]">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-14 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-bold uppercase text-[#F5F3EC]" style={display}>Ready when you are.</h2>
            <p className="mt-2 max-w-md text-sm text-[#F5F3EC]/70">
              Buy a policy now, or sign in to open your NJ Coverage dashboard.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/purchase" className="rounded-full bg-[#1F5E3A] px-7 py-3.5 text-sm font-semibold uppercase tracking-wide text-[#F5F3EC] transition hover:bg-[#2E7D4F]" style={display}>
              Get covered →
            </Link>
            <Link href="/signup" className="rounded-full border border-white/25 px-6 py-3.5 text-sm font-semibold text-[#F5F3EC] transition hover:bg-white/10" style={display}>
              Create account
            </Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col items-start justify-between gap-3 border-t border-[#12161C]/10 pt-6 text-sm text-[#5A6472] sm:flex-row sm:items-center">
          <BrandMark href="/" size="sm" />
          <p className="text-[#8A94A3]">NJ Coverage — auto insurance, issued and managed online.</p>
        </div>
      </footer>
    </div>
  )
}
