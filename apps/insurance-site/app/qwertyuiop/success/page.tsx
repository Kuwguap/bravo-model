import { Suspense } from 'react'
import PurchaseSuccessClient from '@/app/purchase/success/PurchaseSuccessClient'

export default function TestPurchaseSuccessPage () {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F5F3EC] text-[#5A6472]">
          Loading…
        </div>
      }
    >
      <PurchaseSuccessClient backHref="/qwertyuiop" />
    </Suspense>
  )
}
