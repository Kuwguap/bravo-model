'use client'

import { useState } from 'react'
import type { User } from '@/lib/auth-context'
import { useAuth } from '@/lib/auth-context'
import { isSupabaseConfigured } from '@/lib/supabase/client'

type UserCardProps = {
  user: User
}

const CONFIRM_MESSAGE =
  'Are you sure you want to update your full name and phone number?'
const CONFIRM_PASSWORD =
  'Are you sure you want to change your password? You will use the new password next time you sign in.'

const MIN_PWD = 6

export default function UserCard ({ user }: UserCardProps) {
  const { updateUserProfile, updatePassword } = useAuth()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [name, setName] = useState(user.name)
  const [phone, setPhone] = useState(user.phone)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwMsg, setPwMsg] = useState('')

  const onOpen = () => {
    setName(user.name)
    setPhone(user.phone)
    setNewPassword('')
    setConfirmPassword('')
    setFormErr('')
    setPwMsg('')
    setOpen(true)
  }

  const onSave = async () => {
    if (typeof window !== 'undefined' && !window.confirm(CONFIRM_MESSAGE)) {
      return
    }
    setSaving(true)
    setFormErr('')
    try {
      await updateUserProfile({
        name: name.trim() || user.name,
        phone: phone.trim(),
      })
      setOpen(false)
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  const onUpdatePassword = async () => {
    if (!isSupabaseConfigured()) {
      setFormErr('Change password is only available for accounts using sign-in with the online service.')
      return
    }
    if (newPassword.length < MIN_PWD) {
      setFormErr(`New password must be at least ${MIN_PWD} characters.`)
      return
    }
    if (newPassword !== confirmPassword) {
      setFormErr('New password and confirmation do not match.')
      return
    }
    if (typeof window !== 'undefined' && !window.confirm(CONFIRM_PASSWORD)) {
      return
    }
    setPwBusy(true)
    setFormErr('')
    setPwMsg('')
    try {
      await updatePassword(newPassword)
      setNewPassword('')
      setConfirmPassword('')
      setPwMsg('Password updated. Use it the next time you sign in.')
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Could not change password.')
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <div className="surface-card p-6 md:p-8">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#12161C]">Your information</h2>
      </div>

      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2E7D4F] to-[#164A2E] shadow-md shadow-[#123D26]/20">
          <span className="text-xl font-bold text-white">
            {user.name
              .split(' ')
              .map(n => n[0])
              .join('')
              .slice(0, 2)}
          </span>
        </div>
        <div>
          <h3 className="text-xl font-bold text-[#12161C]">{user.name}</h3>
          <p className="text-sm text-[#6B7480]">Policyholder</p>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between gap-4 border-b border-[#ECE8DD] py-3">
          <span className="text-[#5A6472]">Email</span>
          <span className="max-w-[60%] truncate text-right font-medium text-[#12161C]">{user.email}</span>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <span className="text-[#5A6472]">Phone</span>
          <span className="font-medium text-[#12161C]">{user.phone}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-8 w-full rounded-xl border border-[#E4E7EC] py-2.5 text-sm font-semibold text-[#164A2E] transition hover:border-[#5AA377] hover:bg-[#EEF6F0]"
      >
        Edit information
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#12161C]/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-info-title"
        >
          <div className="surface-card w-full max-w-md p-6 shadow-2xl md:p-8">
            <h3 id="edit-info-title" className="text-lg font-bold text-[#12161C]">
              Edit your information
            </h3>
            <p className="mt-1 text-sm text-[#5A6472]">
              Update your full name and phone. Other account details are set by your agent.
            </p>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-[#232B36]">Full name</span>
                <input
                  className="w-full rounded-xl border border-[#E4E7EC] px-3 py-2.5"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-[#232B36]">Phone</span>
                <input
                  className="w-full rounded-xl border border-[#E4E7EC] px-3 py-2.5"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-6 border-t border-[#ECE8DD] pt-6">
              <h4 className="text-sm font-semibold text-[#12161C]">Change password</h4>
              <p className="mt-1 text-xs text-[#6B7480]">
                {isSupabaseConfigured()
                  ? 'Set a new password for your account (min. 6 characters).'
                  : 'Not available in local demo mode—use a Supabase-backed account to change your password.'}
              </p>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-[#232B36]">New password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    disabled={!isSupabaseConfigured()}
                    className="w-full rounded-xl border border-[#E4E7EC] px-3 py-2.5 disabled:bg-[#F5F3EC] disabled:text-[#8A94A3]"
                    value={newPassword}
                    onChange={e => {
                      setNewPassword(e.target.value)
                      setFormErr('')
                      setPwMsg('')
                    }}
                    placeholder="••••••••"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-[#232B36]">Confirm new password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    disabled={!isSupabaseConfigured()}
                    className="w-full rounded-xl border border-[#E4E7EC] px-3 py-2.5 disabled:bg-[#F5F3EC] disabled:text-[#8A94A3]"
                    value={confirmPassword}
                    onChange={e => {
                      setConfirmPassword(e.target.value)
                      setFormErr('')
                      setPwMsg('')
                    }}
                    placeholder="••••••••"
                  />
                </label>
                <button
                  type="button"
                  disabled={!isSupabaseConfigured() || pwBusy}
                  onClick={() => void onUpdatePassword()}
                  className="w-full rounded-xl border border-[#E4E7EC] py-2.5 text-sm font-semibold text-[#1A2028] transition hover:border-[#5AA377] hover:bg-[#EEF6F0] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pwBusy ? 'Updating password…' : 'Update password'}
                </button>
              </div>
              {pwMsg && (
                <p className="mt-2 rounded-lg border border-[#B7D9C4] bg-[#EEF6F0] px-3 py-2 text-sm text-[#123D26]">
                  {pwMsg}
                </p>
              )}
            </div>

            {formErr && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {formErr}
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={saving}
                className="btn-primary-brand px-5 py-2.5 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-[#E4E7EC] px-5 py-2.5 text-sm font-semibold text-[#232B36] hover:bg-[#F5F3EC]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
