import { Suspense } from 'react'
import DashboardClient from './DashboardClient'

export default function DashboardPage () {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F5F3EC] text-[#5A6472]">
          Loading…
        </div>
      }
    >
      <DashboardClient />
    </Suspense>
  )
}
