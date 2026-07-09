'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import BrandMark from '@/components/BrandMark'
import { PURCHASE_PLANS, getPlan } from '@/lib/purchase/plans'
import { useAuth } from '@/lib/auth-context'
import QuestionWizard, {
  type QuestionAnswers,
} from '@/components/purchase/QuestionWizard'
import ApprovedScreen from '@/components/purchase/ApprovedScreen'

type Stage =
  | { kind: 'plans' }
  | { kind: 'questions'; planKey: string }
  | { kind: 'approved'; planKey: string; answers: QuestionAnswers }

export default function PurchasePage () {
  const { user, authReady, logout } = useAuth()
  const [stage, setStage] = useState<Stage>({ kind: 'plans' })
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const startCheckout = useCallback(async (planKey: string, answers: QuestionAnswers) => {
    setErr('')
    setBusy(planKey)
    try {
      const r = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey, prequalAnswers: answers }),
      })
      const j = (await r.json()) as { ok?: boolean; url?: string; error?: string }
      if (!r.ok || !j.ok || !j.url) {
        setErr(j.error ?? 'Could not start checkout. Is Stripe configured?')
        setStage({ kind: 'plans' })
        return
      }
      window.location.href = j.url
    } catch {
      setErr('Network error. Try again.')
      setStage({ kind: 'plans' })
    } finally {
      setBusy(null)
    }
  }, [])

  const planLabel = (() => {
    if (stage.kind === 'plans') return ''
    return getPlan(stage.planKey)?.label ?? stage.planKey
  })()

  return (
    <div className="min-h-screen bg-[#F5F3EC]">
      <nav className="sticky top-0 z-50 border-b border-[#E4E7EC]/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <BrandMark href={user ? '/dashboard' : '/'} />
          <div className="flex items-center gap-3">
            {!authReady ? null : user ? (
              <>
                <span className="hidden max-w-[180px] truncate text-sm font-medium text-[#5A6472] sm:inline">
                  {user.name}
                </span>
                <Link
                  href="/dashboard"
                  className="text-sm font-semibold text-[#164A2E] hover:text-[#1F5E3A]"
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    void logout().finally(() => {
                      if (typeof window !== 'undefined') {
                        window.location.assign('/login')
                      }
                    })
                  }}
                  className="rounded-xl border border-[#CBD1DA] bg-white px-3 py-1.5 text-sm font-semibold text-[#1A2028] shadow-sm transition hover:bg-[#F5F3EC]"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link href="/login" className="text-sm font-semibold text-[#232B36]">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-12">
        {stage.kind === 'plans' ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-widest text-[#1F5E3A]">
              Tri State Coverage
            </p>
            <h1 className="mt-2 text-3xl font-bold text-[#12161C] md:text-4xl">
              Purchase auto insurance
            </h1>
            <p className="mt-3 text-[#5A6472]">
              Pay securely with card, then enter your driver and vehicle details. You&apos;ll receive
              your proof-of-insurance PDF by email right away.
            </p>

            {err && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                {err}
              </div>
            )}

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {PURCHASE_PLANS.map(plan => (
                <div
                  key={plan.key}
                  className="flex flex-col rounded-2xl border border-[#E4E7EC] bg-white p-6 shadow-sm"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-lg font-bold text-[#12161C]">{plan.label}</h2>
                    <span className="text-xl font-bold text-[#164A2E]">{plan.priceLabel}</span>
                  </div>
                  <p className="mt-1 text-sm text-[#6B7480]">{plan.description}</p>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      setErr('')
                      setStage({ kind: 'questions', planKey: plan.key })
                    }}
                    className="mt-6 w-full rounded-xl bg-[#1F5E3A] py-3 text-sm font-bold text-white hover:bg-[#1F5E3A] disabled:opacity-50"
                  >
                    Buy with card
                  </button>
                </div>
              ))}
            </div>

            <p className="mt-10 text-center text-xs text-[#6B7480]">
              After payment you&apos;ll complete name, address, phone, email, VIN, and color — then tap{' '}
              <strong>Get insured</strong> for your PDF.
            </p>
          </>
        ) : null}

        {stage.kind === 'questions' ? (
          <QuestionWizard
            onCancel={() => setStage({ kind: 'plans' })}
            onComplete={answers =>
              setStage({ kind: 'approved', planKey: stage.planKey, answers })
            }
          />
        ) : null}

        {stage.kind === 'approved' ? (
          <ApprovedScreen
            planLabel={planLabel}
            countdownSeconds={3}
            onCountdownComplete={() => {
              void startCheckout(stage.planKey, stage.answers)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
