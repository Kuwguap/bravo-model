'use client'

import { useEffect, useState } from 'react'
import type { InsuranceData } from '@/lib/auth-context'
import { useAuth } from '@/lib/auth-context'
import VinDecodeTrigger from '@/components/VinDecodeTrigger'
import type { DecodedVinPayload } from '@/lib/vin/decode-vin'

type VehicleCardProps = {
  policyholderName: string
  vehicle: InsuranceData
}

type Draft = {
  vehicleName: string
  vin: string
  modelYear: string
  vehicleMake: string
  vehicleModel: string
  trimLevel: string
  bodyClass: string
}

function toDraft (v: InsuranceData): Draft {
  return {
    vehicleName: v.vehicleName === '—' ? '' : v.vehicleName,
    vin: v.vin === '—' ? '' : v.vin,
    modelYear: v.modelYear ?? '',
    vehicleMake: v.vehicleMake ?? '',
    vehicleModel: v.vehicleModel ?? '',
    trimLevel: v.trimLevel ?? '',
    bodyClass: v.bodyClass ?? '',
  }
}

export default function VehicleCard ({ policyholderName, vehicle }: VehicleCardProps) {
  const { updateVehicleDetails } = useAuth()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => toDraft(vehicle))
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  useEffect(() => {
    if (!editing) setDraft(toDraft(vehicle))
  }, [vehicle, editing])

  const subtitleParts = [vehicle.modelYear, vehicle.vehicleMake, vehicle.vehicleModel].filter(
    Boolean
  )

  async function save () {
    setSaveErr('')
    setSaving(true)
    try {
      await updateVehicleDetails({
        vehicleName: draft.vehicleName.trim() || '—',
        vin: draft.vin.trim() || '—',
        modelYear: draft.modelYear.trim(),
        vehicleMake: draft.vehicleMake.trim(),
        vehicleModel: draft.vehicleModel.trim(),
        trimLevel: draft.trimLevel.trim(),
        bodyClass: draft.bodyClass.trim(),
      })
      setEditing(false)
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  function applyDecode (d: DecodedVinPayload) {
    setDraft(prev => ({
      ...prev,
      vin: d.vin,
      vehicleName: d.suggestedVehicleName,
      modelYear: d.modelYear,
      vehicleMake: d.vehicleMake,
      vehicleModel: d.vehicleModel,
      trimLevel: d.trimLevel,
      bodyClass: d.bodyClass,
    }))
  }

  return (
    <div className="surface-card p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-[#12161C]">Your vehicle</h2>
        <span className="rounded-full bg-[#DCEDE3] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#164A2E]">
          Active
        </span>
      </div>

      {!editing ? (
        <>
          <div className="mb-8 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#EEF6F0] ring-1 ring-[#1F5E3A]/15">
              <svg className="h-8 w-8 text-[#1F5E3A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-xl font-bold text-[#164A2E]">{vehicle.vehicleName}</h3>
              {subtitleParts.length > 0 ? (
                <p className="truncate text-sm text-[#5A6472]">{subtitleParts.join(' · ')}</p>
              ) : null}
              <p className="truncate text-sm text-[#6B7480]">Policy {vehicle.policyNumber}</p>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between gap-4 border-b border-[#ECE8DD] py-3">
              <span className="text-[#5A6472]">Vehicle</span>
              <span className="max-w-[60%] truncate text-right font-medium text-[#12161C]">
                {vehicle.vehicleName}
              </span>
            </div>
            <div className="flex justify-between gap-4 border-b border-[#ECE8DD] py-3">
              <span className="text-[#5A6472]">VIN</span>
              <span className="font-mono text-sm font-medium text-[#12161C]">{vehicle.vin}</span>
            </div>
            {(vehicle.trimLevel || vehicle.bodyClass) && (
              <div className="flex justify-between gap-4 border-b border-[#ECE8DD] py-3">
                <span className="text-[#5A6472]">Style</span>
                <span className="max-w-[60%] text-right text-sm text-[#12161C]">
                  {[vehicle.trimLevel, vehicle.bodyClass].filter(Boolean).join(' · ') || '—'}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4 border-b border-[#ECE8DD] py-3">
              <span className="text-[#5A6472]">Policy number</span>
              <span className="max-w-[55%] truncate text-right font-medium text-[#12161C]">
                {vehicle.policyNumber}
              </span>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <span className="text-[#5A6472]">Annual premium</span>
              <span className="text-lg font-bold text-[#1F5E3A]">${vehicle.premium.toFixed(2)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setDraft(toDraft(vehicle))
              setEditing(true)
              setSaveErr('')
            }}
            className="mt-6 w-full rounded-xl border border-[#B7D9C4] bg-[#EEF6F0] py-2.5 text-sm font-semibold text-[#123D26] transition hover:bg-[#DCEDE3]"
          >
            Edit vehicle details
          </button>
        </>
      ) : (
        <div className="space-y-4 border-t border-[#ECE8DD] pt-6">
          <p className="text-sm text-[#5A6472]">
            Decode fills fields from the free NHTSA VIN database — adjust anything before saving.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[12rem] flex-1">
              <span className="mb-1 block text-xs font-semibold text-[#5A6472]">VIN</span>
              <input
                className="w-full rounded-xl border border-[#E4E7EC] px-3 py-2 font-mono text-sm"
                value={draft.vin}
                onChange={e =>
                  setDraft(d => ({
                    ...d,
                    vin: e.target.value.toUpperCase().replace(/\s+/g, ''),
                  }))}
                maxLength={17}
              />
            </label>
            <VinDecodeTrigger vin={draft.vin} onDecoded={applyDecode} disabled={saving} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[#5A6472]">Year</span>
              <input
                className="w-full rounded-xl border border-[#E4E7EC] px-3 py-2 text-sm"
                value={draft.modelYear}
                onChange={e => setDraft(d => ({ ...d, modelYear: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[#5A6472]">Make</span>
              <input
                className="w-full rounded-xl border border-[#E4E7EC] px-3 py-2 text-sm"
                value={draft.vehicleMake}
                onChange={e => setDraft(d => ({ ...d, vehicleMake: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[#5A6472]">Model</span>
              <input
                className="w-full rounded-xl border border-[#E4E7EC] px-3 py-2 text-sm"
                value={draft.vehicleModel}
                onChange={e => setDraft(d => ({ ...d, vehicleModel: e.target.value }))}
              />
            </label>
            <label className="block sm:col-span-1">
              <span className="mb-1 block text-xs font-semibold text-[#5A6472]">Trim</span>
              <input
                className="w-full rounded-xl border border-[#E4E7EC] px-3 py-2 text-sm"
                value={draft.trimLevel}
                onChange={e => setDraft(d => ({ ...d, trimLevel: e.target.value }))}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-[#5A6472]">Body class</span>
              <input
                className="w-full rounded-xl border border-[#E4E7EC] px-3 py-2 text-sm"
                value={draft.bodyClass}
                onChange={e => setDraft(d => ({ ...d, bodyClass: e.target.value }))}
              />
            </label>
            <label className="block sm:col-span-3">
              <span className="mb-1 block text-xs font-semibold text-[#5A6472]">
                Display name <span className="font-normal text-[#6B7480]">(shown on policy)</span>
              </span>
              <input
                className="w-full rounded-xl border border-[#E4E7EC] px-3 py-2 text-sm"
                value={draft.vehicleName}
                onChange={e => setDraft(d => ({ ...d, vehicleName: e.target.value }))}
              />
            </label>
          </div>
          {saveErr ? (
            <p className="text-sm text-red-600" role="alert">
              {saveErr}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="btn-primary-brand flex-1 py-2.5 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setEditing(false)
                setDraft(toDraft(vehicle))
                setSaveErr('')
              }}
              className="rounded-xl border border-[#E4E7EC] px-4 py-2.5 text-sm font-semibold text-[#232B36] hover:bg-[#F5F3EC]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!editing && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-8 w-full rounded-xl border border-[#E4E7EC] py-2.5 text-sm font-semibold text-[#164A2E] transition hover:border-[#5AA377] hover:bg-[#EEF6F0]"
        >
          View policy details
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#12161C]/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="policy-dialog-title"
        >
          <div className="surface-card max-h-[min(90vh,600px)] w-full max-w-lg overflow-y-auto p-6 shadow-2xl md:p-8">
            <div className="mb-4 flex items-start justify-between gap-4">
              <h3 id="policy-dialog-title" className="text-xl font-bold text-[#12161C]">
                Policy details
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm font-medium text-[#6B7480] hover:bg-[#ECE8DD]"
              >
                Close
              </button>
            </div>
            <dl className="mt-2 space-y-4 text-sm">
              <div>
                <dt className="font-medium text-[#6B7480]">Policyholder</dt>
                <dd className="mt-1 text-[#12161C]">{policyholderName}</dd>
              </div>
              <div>
                <dt className="font-medium text-[#6B7480]">Vehicle</dt>
                <dd className="mt-1 text-[#12161C]">{vehicle.vehicleName}</dd>
              </div>
              {(vehicle.modelYear || vehicle.vehicleMake || vehicle.vehicleModel) && (
                <div>
                  <dt className="font-medium text-[#6B7480]">Year / make / model</dt>
                  <dd className="mt-1 text-[#12161C]">
                    {[vehicle.modelYear, vehicle.vehicleMake, vehicle.vehicleModel]
                      .filter(Boolean)
                      .join(' ')}
                  </dd>
                </div>
              )}
              <div>
                <dt className="font-medium text-[#6B7480]">VIN</dt>
                <dd className="mt-1 font-mono text-[#12161C]">{vehicle.vin}</dd>
              </div>
              <div>
                <dt className="font-medium text-[#6B7480]">Policy number</dt>
                <dd className="mt-1 text-[#12161C]">{vehicle.policyNumber}</dd>
              </div>
              <div>
                <dt className="font-medium text-[#6B7480]">Effective date</dt>
                <dd className="mt-1 text-[#12161C]">{vehicle.policyEffectiveDate}</dd>
              </div>
              <div>
                <dt className="font-medium text-[#6B7480]">Expiration date</dt>
                <dd className="mt-1 text-[#12161C]">{vehicle.policyExpirationDate}</dd>
              </div>
              <div>
                <dt className="font-medium text-[#6B7480]">Address</dt>
                <dd className="mt-1 whitespace-pre-wrap text-[#12161C]">{vehicle.policyAddress}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-primary-brand mt-8 w-full py-2.5"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
