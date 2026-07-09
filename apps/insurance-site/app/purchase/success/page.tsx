import { Suspense } from 'react'
import PurchaseSuccessClient from './PurchaseSuccessClient'

export default function PurchaseSuccessPage () {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F5F3EC] text-[#5A6472]">
          Loading…
        </div>
      }
    >
      <PurchaseSuccessClient />
    </Suspense>
  )
}
