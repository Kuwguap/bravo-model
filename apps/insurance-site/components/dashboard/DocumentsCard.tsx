'use client'

import { useState } from 'react'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import {
  downloadDashboardPdf,
  openDashboardPdfView,
} from '@/lib/dashboard-document'
import { insuranceCardDownloadFilename } from '@/lib/pdf-download-name'

const INSURANCE_CARD_API = '/api/insurance-card-pdf'
const POLICY_DECL_API = '/api/documents/policy-declaration'

const DOC_BTN =
  'btn-touch w-full sm:w-auto rounded-xl border border-[#E4E7EC] bg-white px-4 text-sm font-semibold text-[#1A2028] shadow-sm transition hover:bg-[#F5F3EC] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
const DOC_BTN_PRIMARY =
  'btn-touch w-full sm:w-auto rounded-xl bg-[#1F5E3A] px-4 text-sm font-semibold text-white shadow-md shadow-[#123D26]/15 transition hover:bg-[#2E7D4F] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'

export type DocumentsCardVehicle = {
  vehicleId: string | null
  vehicleName: string
  policyNumber: string
  insuranceCardPdfPath: string | null | undefined
}

type Props = {
  policyholderName: string
  insuranceCardPath: string | null | undefined
  hasActivePolicy: boolean
  vehicles?: DocumentsCardVehicle[]
}

export default function DocumentsCard ({
  policyholderName,
  insuranceCardPath,
  hasActivePolicy,
  vehicles,
}: Props) {
  const [busy, setBusy] = useState<
    | 'card-view'
    | 'card-dl'
    | 'decl-view'
    | 'decl-dl'
    | { kind: 'veh-view' | 'veh-dl'; vehicleId: string }
    | null
  >(null)
  const [err, setErr] = useState('')

  const allVehicles = (vehicles ?? []).filter(v => !!v.vehicleId)
  const perVehicleCards = allVehicles.filter(v => !!v.insuranceCardPdfPath)
  const hasPerVehicleCards = allVehicles.length > 1 && perVehicleCards.length > 0

  const insuranceCardAvailable =
    isSupabaseConfigured() &&
    (!!insuranceCardPath || perVehicleCards.length > 0)

  const fname = insuranceCardDownloadFilename(policyholderName, insuranceCardPath ?? null)

  async function runView (apiUrl: string, title: string, busyKey: typeof busy) {
    setBusy(busyKey)
    setErr('')
    try {
      openDashboardPdfView(apiUrl, title)
    } catch {
      setErr('Could not open document.')
    } finally {
      window.setTimeout(() => setBusy(null), 500)
    }
  }

  async function runDownload (
    apiUrl: string,
    filename: string,
    busyKey: typeof busy
  ) {
    setBusy(busyKey)
    setErr('')
    try {
      await downloadDashboardPdf(apiUrl, filename)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Download failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="surface-card p-4 sm:p-6 md:p-8">
      <h2 className="text-lg font-semibold text-[#12161C]">Documents</h2>
      <p className="mt-1 text-sm text-[#6B7480]">
        View or download your insurance documents. On mobile, tap View for a
        full-screen reader you can pinch-zoom.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {hasPerVehicleCards ? (
          <div className="rounded-2xl border border-[#E4E7EC] bg-[#F5F3EC]/60 p-4 lg:col-span-1">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#DCEDE3] text-[#1F5E3A]">
                <span aria-hidden>📄</span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-[#12161C]">Insurance cards</p>
                <p className="text-xs text-[#6B7480]">
                  {perVehicleCards.length} of {allVehicles.length} vehicles have
                  a card on file
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-3">
              {perVehicleCards.map(v => {
                const vehicleId = v.vehicleId as string
                const viewBusy =
                  typeof busy === 'object' && busy?.kind === 'veh-view' && busy.vehicleId === vehicleId
                const dlBusy =
                  typeof busy === 'object' && busy?.kind === 'veh-dl' && busy.vehicleId === vehicleId
                const apiUrl = `${INSURANCE_CARD_API}?vehicleId=${encodeURIComponent(vehicleId)}`
                const viewUrl = `${apiUrl}&inline=1`
                const label = v.vehicleName || 'Vehicle'
                return (
                  <li
                    key={vehicleId}
                    className="rounded-xl border border-[#E4E7EC] bg-white p-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#12161C] break-words">
                        {label}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-[#6B7480] break-all">
                        {v.policyNumber || '—'}
                      </p>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          void runView(viewUrl, `Insurance card — ${label}`, {
                            kind: 'veh-view',
                            vehicleId,
                          })
                        }
                        className={DOC_BTN}
                      >
                        {viewBusy ? 'Opening…' : 'View'}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          void runDownload(
                            apiUrl,
                            insuranceCardDownloadFilename(
                              `${policyholderName} — ${label}`,
                              v.insuranceCardPdfPath ?? null
                            ),
                            { kind: 'veh-dl', vehicleId }
                          )
                        }
                        className={DOC_BTN_PRIMARY}
                      >
                        {dlBusy ? 'Saving…' : 'Download'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#E4E7EC] bg-[#F5F3EC]/60 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#DCEDE3] text-[#1F5E3A]">
                <span aria-hidden>📄</span>
              </div>
              <div>
                <p className="font-semibold text-[#12161C]">Insurance card</p>
                <p className="text-xs text-[#6B7480]">NY FS-20 PDF</p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={!insuranceCardAvailable || busy !== null}
                onClick={() =>
                  void runView(
                    `${INSURANCE_CARD_API}?inline=1`,
                    'Insurance card',
                    'card-view'
                  )
                }
                className={DOC_BTN}
              >
                {busy === 'card-view' ? 'Opening…' : 'View'}
              </button>
              <button
                type="button"
                disabled={!insuranceCardAvailable || busy !== null}
                onClick={() => void runDownload(INSURANCE_CARD_API, fname, 'card-dl')}
                className={DOC_BTN_PRIMARY}
              >
                {busy === 'card-dl' ? 'Saving…' : 'Download'}
              </button>
            </div>
            {!insuranceCardAvailable && (
              <p className="mt-3 text-xs text-[#6B7480]">
                Issued once your agent uploads it after purchase.
              </p>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-[#E4E7EC] bg-[#F5F3EC]/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#DCEDE3] text-[#1F5E3A]">
              <span aria-hidden>📄</span>
            </div>
            <div>
              <p className="font-semibold text-[#12161C]">Policy declaration</p>
              <p className="text-xs text-[#6B7480]">Generated on demand</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={!hasActivePolicy || busy !== null}
              onClick={() =>
                void runView(
                  `${POLICY_DECL_API}?inline=1`,
                  'Policy declaration',
                  'decl-view'
                )
              }
              className={DOC_BTN}
            >
              {busy === 'decl-view' ? 'Opening…' : 'View'}
            </button>
            <button
              type="button"
              disabled={!hasActivePolicy || busy !== null}
              onClick={() =>
                void runDownload(POLICY_DECL_API, 'policy-declaration.pdf', 'decl-dl')
              }
              className={DOC_BTN_PRIMARY}
            >
              {busy === 'decl-dl' ? 'Saving…' : 'Download'}
            </button>
          </div>
          {!hasActivePolicy && (
            <p className="mt-3 text-xs text-[#6B7480]">
              Available once a policy is active.
            </p>
          )}
        </div>
      </div>

      {err && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 break-words">
          {err}
        </p>
      )}
    </section>
  )
}

