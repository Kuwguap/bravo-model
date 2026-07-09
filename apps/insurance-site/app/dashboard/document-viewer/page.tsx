import { Suspense } from 'react'
import DocumentViewerClient from './DocumentViewerClient'

export default function DocumentViewerPage () {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-[#12161C] text-[#CBD1DA]">
          Loading document…
        </div>
      }
    >
      <DocumentViewerClient />
    </Suspense>
  )
}
