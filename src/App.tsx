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

type Page = 'landing' | 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7' | 'v8' | 'v9'

export default function App() {
  const [page, setPage] = useState<Page>('landing')

  if (page === 'v1') return <V1Page  onBack={() => setPage('landing')} />
  if (page === 'v2') return <V2Scene onBack={() => setPage('landing')} />
  if (page === 'v3') return <V3Scene onBack={() => setPage('landing')} />
  if (page === 'v4') return <V4Scene onBack={() => setPage('landing')} />
  if (page === 'v5') return <V5Scene onBack={() => setPage('landing')} />
  if (page === 'v6') return <V6Scene onBack={() => setPage('landing')} />
  if (page === 'v7') return <V7Scene onBack={() => setPage('landing')} />
  if (page === 'v8') return <V8Scene onBack={() => setPage('landing')} />
  if (page === 'v9') return <V9Scene onBack={() => setPage('landing')} />
  return <Landing onNavigate={setPage} />
}
