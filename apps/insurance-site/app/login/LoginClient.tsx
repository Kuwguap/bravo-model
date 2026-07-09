'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import Link from 'next/link'
import BrandMark from '@/components/BrandMark'

export default function LoginClient () {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, authReady, login } = useAuth()
  const redirected = useRef(false)
  const prefilledRef = useRef(false)

  useEffect(() => {
    if (!authReady || redirected.current) return
    if (user) {
      redirected.current = true
      router.replace('/dashboard')
    }
  }, [authReady, user, router])

  /* Prefill email when arriving from /signup's "Sign in instead" CTA. */
  useEffect(() => {
    if (prefilledRef.current) return
    const fromQuery = searchParams.get('email')
    if (fromQuery) {
      setEmail(fromQuery)
      prefilledRef.current = true
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    let leavingForDashboard = false
    try {
      const success = await login(email, password)
      if (success) {
        leavingForDashboard = true
        // Keep loading state until this component unmounts so the form does not flash
        // back to idle for a moment before the client navigation finishes.
        router.replace('/dashboard')
        return
      }
      setError('Invalid email or password.')
    } catch {
      setError('Failed to login. Please try again.')
    } finally {
      if (!leavingForDashboard) {
        setLoading(false)
      }
    }
  }

  const inputCls =
    'w-full rounded-xl border border-[#E4E7EC] bg-[#F5F3EC]/80 px-4 py-3 text-[#12161C] outline-none ring-[#1F5E3A]/0 transition placeholder:text-[#8A94A3] focus:border-[#2E7D4F]/50 focus:bg-white focus:ring-4 focus:ring-[#1F5E3A]/15'

  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-[#12161C] via-[#123D26] to-[#123D26]">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage: `radial-gradient(at 40% 20%, rgba(45, 212, 191, 0.12) 0px, transparent 50%),
            radial-gradient(at 80% 80%, rgba(52, 211, 153, 0.1) 0px, transparent 45%)`,
        }}
      />

      <header className="relative z-10 border-b border-white/10 bg-[#12161C]/45 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <BrandMark href="/" invert />
          <Link
            href="/signup"
            className="text-sm font-semibold text-white/90 transition hover:text-white"
          >
            Create account
          </Link>
        </div>
      </header>

      <div className="relative flex flex-1 items-center justify-center px-4 py-12 md:py-16">
        <div className="surface-card w-full max-w-md p-8 shadow-2xl shadow-[#12161C]/25 md:p-10">
          <h1 className="text-2xl font-bold tracking-tight text-[#12161C] md:text-3xl">Welcome back</h1>
          <p className="mt-2 text-[#5A6472]">Sign in to your NJ Coverage account</p>

          <form onSubmit={e => void handleSubmit(e)} className="mt-8 space-y-5">
            <div>
              <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-[#232B36]">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-[#232B36]">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className={inputCls}
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary-brand w-full py-3.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-[#5A6472]">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-semibold text-[#1F5E3A] hover:text-[#1F5E3A]">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
