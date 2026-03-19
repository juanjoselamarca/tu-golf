'use client'

import { useState } from 'react'
import { ExperiencePopup, ExperiencePanel } from './ExperienceSetup'

export function ExperiencePopupWrapper() {
  const [showPanel, setShowPanel] = useState(false)

  return (
    <>
      <ExperiencePopup onSetup={() => setShowPanel(true)} />
      {showPanel && (
        <>
          <div onClick={() => setShowPanel(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 300, animation: 'fadeIn 0.3s ease',
          }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
            background: '#ffffff', borderRadius: '20px 20px 0 0',
            boxShadow: '0 -8px 32px rgba(0,0,0,0.15)',
            animation: 'slideUpBanner 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
            maxHeight: '80vh', overflowY: 'auto',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}>
            <div style={{ width: '36px', height: '4px', background: '#e5e7eb', borderRadius: '2px', margin: '12px auto 0' }} />
            <ExperiencePanel onClose={() => setShowPanel(false)} />
          </div>
        </>
      )}
    </>
  )
}
