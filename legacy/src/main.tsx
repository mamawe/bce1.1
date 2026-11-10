import React from 'react'
import ReactDOM from 'react-dom/client'
import { setApiUser } from './lib/session'
import '../../frontend/src/styles.css'
import DemoApp from './DemoApp'
import DemoBanner from './DemoBanner'

setApiUser('admin')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DemoBanner />
    <DemoApp />
  </React.StrictMode>,
)
