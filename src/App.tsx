import { useState } from 'react'
import { Landing } from './pages/Landing'
import { V1Page }  from './pages/V1Page'
import { V2Scene } from './v2/V2Scene'
import { V3Scene } from './v3/V3Scene'
import { V4Scene } from './v4/V4Scene'
import { V5Scene } from './v5/V5Scene'
import { V6Scene } from './v6/V6Scene'
import { V7Scene } from './v7/V7Scene'
import { V8Scene } from './v8/V8Scene'
import { V9Scene } from './v9/V9Scene'
import { V10Scene } from './v10/V10Scene'
import { V11Scene } from './v11/V11Scene'
import { LabBaamLink } from './components/LabBaamLink'

type Page = 'landing' | 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7' | 'v8' | 'v9' | 'v10' | 'v11'

export default function App() {
  const [page, setPage] = useState<Page>('landing')
  const onBack = () => setPage('landing')

  const content = page === 'v1' ? <V1Page onBack={onBack} />
    : page === 'v2' ? <V2Scene onBack={onBack} />
    : page === 'v3' ? <V3Scene onBack={onBack} />
    : page === 'v4' ? <V4Scene onBack={onBack} />
    : page === 'v5' ? <V5Scene onBack={onBack} />
    : page === 'v6' ? <V6Scene onBack={onBack} />
    : page === 'v7' ? <V7Scene onBack={onBack} />
    : page === 'v8' ? <V8Scene onBack={onBack} />
    : page === 'v9' ? <V9Scene onBack={onBack} />
    : page === 'v10' ? <V10Scene onBack={onBack} />
    : page === 'v11' ? <V11Scene onBack={onBack} />
    : <Landing onNavigate={setPage} />

  return (
    <>
      <LabBaamLink />
      {content}
    </>
  )
}
