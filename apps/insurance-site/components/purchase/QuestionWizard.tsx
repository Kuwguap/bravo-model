'use client'

import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'

/**
 * Six-question driving-history wizard shown between plan selection and Stripe
 * checkout. Every answer path is "approvable" — the wizard never blocks; the
 * answers are surfaced via the `onComplete` callback for downstream use.
 */

export interface QuestionAnswers {
  licenseYears: string
  drivingPoints: string
  accidents: string
  tickets: string
  licenseSuspended: string
  dui: string
}

interface Question {
  id: keyof QuestionAnswers
  label: string
  options: { value: string; label: string }[]
}

export const PURCHASE_QUESTIONS: Question[] = [
  {
    id: 'licenseYears',
    label: 'How many years have you had a valid driver’s license?',
    options: [
      { value: '<1', label: 'Less than 1 year' },
      { value: '1-3', label: '1 – 3 years' },
      { value: '3-5', label: '3 – 5 years' },
      { value: '5-10', label: '5 – 10 years' },
      { value: '10+', label: '10+ years' },
    ],
  },
  {
    id: 'drivingPoints',
    label: 'How many points are currently on your driving record?',
    options: [
      { value: '0', label: '0' },
      { value: '1-3', label: '1 – 3' },
      { value: '4-6', label: '4 – 6' },
      { value: '7+', label: '7 or more' },
    ],
  },
  {
    id: 'accidents',
    label: 'How many accidents have you had in the last 3 years?',
    options: [
      { value: '0', label: 'None' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3+', label: '3 or more' },
    ],
  },
  {
    id: 'tickets',
    label: 'How many tickets or violations have you had in the last 3 years?',
    options: [
      { value: '0', label: 'None' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3+', label: '3 or more' },
    ],
  },
  {
    id: 'licenseSuspended',
    label: 'Has your driver’s license ever been suspended?',
    options: [
      { value: 'no', label: 'No' },
      { value: 'yes', label: 'Yes' },
    ],
  },
  {
    id: 'dui',
    label: 'Have you ever been convicted of driving under the influence (DUI / DWI)?',
    options: [
      { value: 'no', label: 'No' },
      { value: 'yes', label: 'Yes' },
    ],
  },
]

interface QuestionWizardProps {
  onComplete: (answers: QuestionAnswers) => void
  onCancel: () => void
}

export default function QuestionWizard ({
  onComplete,
  onCancel,
}: QuestionWizardProps) {
  const [stepIdx, setStepIdx] = useState(0)
  const [answers, setAnswers] = useState<Partial<QuestionAnswers>>({})

  const step = PURCHASE_QUESTIONS[stepIdx]
  const total = PURCHASE_QUESTIONS.length
  const progressPct = Math.round(((stepIdx + 1) / total) * 100)

  function answer (value: string) {
    const next: Partial<QuestionAnswers> = { ...answers, [step.id]: value }
    setAnswers(next)
    if (stepIdx + 1 >= total) {
      onComplete(next as QuestionAnswers)
    } else {
      setStepIdx(stepIdx + 1)
    }
  }

  function back () {
    if (stepIdx === 0) {
      onCancel()
      return
    }
    setStepIdx(stepIdx - 1)
  }

  const currentValue = answers[step.id]

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={back}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#5A6472] transition hover:bg-[#ECE8DD] hover:text-[#12161C]"
        >
          <ChevronLeft className="size-4" />
          {stepIdx === 0 ? (
            <>
              <span className="hidden sm:inline">Back to plans</span>
              <span className="sm:hidden">Plans</span>
            </>
          ) : (
            'Back'
          )}
        </button>

        {/* Step counter — explicit pill so it stays legible on every viewport. */}
        <span
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#EEF6F0] px-3 py-1 text-xs font-semibold text-[#164A2E] ring-1 ring-[#B7D9C4]"
          aria-label={`Question ${stepIdx + 1} of ${total}`}
        >
          <span className="font-bold tabular-nums">{stepIdx + 1}</span>
          <span className="text-[#1F5E3A]/80">of</span>
          <span className="tabular-nums">{total}</span>
        </span>
      </div>

      <div className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-[#E4E7EC]">
        <div
          className="h-full rounded-full bg-[#1F5E3A] transition-all duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="rounded-2xl border border-[#E4E7EC] bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-2xl font-bold leading-tight text-[#12161C] sm:text-3xl">
          {step.label}
        </h2>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {step.options.map(opt => {
            const isActive = currentValue === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => answer(opt.value)}
                className={[
                  'group flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D4F]',
                  isActive
                    ? 'border-[#1F5E3A] bg-[#EEF6F0] text-[#123D26] shadow-sm'
                    : 'border-[#E4E7EC] bg-white text-[#1A2028] hover:border-[#2E7D4F] hover:bg-[#EEF6F0]/40',
                ].join(' ')}
              >
                <span>{opt.label}</span>
                <span
                  aria-hidden
                  className={[
                    'inline-flex size-5 items-center justify-center rounded-full border-2 transition',
                    isActive
                      ? 'border-[#1F5E3A] bg-[#1F5E3A] text-white'
                      : 'border-[#CBD1DA] bg-white text-transparent group-hover:border-[#2E7D4F]',
                  ].join(' ')}
                >
                  <svg viewBox="0 0 16 16" className="size-3 fill-current">
                    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L7.25 10.19l5.97-5.97a.75.75 0 0 1 1.06 0Z" />
                  </svg>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-[#6B7480]">
        Take 30 seconds to answer a few questions to proceed to checkout.
      </p>
    </div>
  )
}
