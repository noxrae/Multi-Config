'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'

type ProgressState = {
  status: string
  phase: string
  current_phase: number
  total_phases: number
  message: string
  summary?: {
    total?: number
    passed?: number
    failed?: number
    pass_rate?: number
    steps?: number
  }
}

type ReasoningItem = {
  name: string
  weightage: number
  reason?: string
}

type HistoryItem = {
  id: number
  data: string
  mode: string
  time: string
}

const initialProgress: ProgressState = {
  status: 'idle',
  phase: '-',
  current_phase: 0,
  total_phases: 5,
  message: 'Telemetry awaiting signal...',
  summary: {},
}

const HISTORY_KEY = 'nova_vortex_history'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'normalizer' | 'config'>('normalizer')
  const [configMode, setConfigMode] = useState<'parser' | 'weightage' | 'python-weightage'>('parser')
  const [configStrategy, setConfigStrategy] = useState('equal')
  const [file, setFile] = useState<File | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressState>(initialProgress)
  const [formMsg, setFormMsg] = useState('STATION: READY')
  const [jsonPreview, setJsonPreview] = useState('// Transmission empty...')
  const [previewReady, setPreviewReady] = useState(false)
  const [configInput, setConfigInput] = useState('')
  const [configOutput, setConfigOutput] = useState('// Awaiting data transmission...')
  const [configCount, setConfigCount] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [historyData, setHistoryData] = useState<HistoryItem[]>([])
  const [reasoning, setReasoning] = useState<ReasoningItem[]>([])
  const [copiedButton, setCopiedButton] = useState<string | null>(null)
  const [completedResult, setCompletedResult] = useState<unknown | null>(null)
  const [downloadHref, setDownloadHref] = useState<string | null>(null)

  useEffect(() => {
    try {
      const history = localStorage.getItem(HISTORY_KEY)
      if (history) {
        setHistoryData(JSON.parse(history))
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (!jobId || progress.status === 'completed' || progress.status === 'failed') {
      return
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/progress/${jobId}`)
        const data = await res.json()
        setProgress(data)

        if (data.status === 'completed') {
          setFormMsg('Mission Complete.')
          setPreviewReady(true)
        }

        if (data.status === 'failed') {
          setFormMsg(data.message || 'Mission Failed.')
        }
      } catch {
        setFormMsg('Error: Backend unavailable')
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [jobId, progress.status])

  useEffect(() => {
    if (!completedResult) {
      setDownloadHref(null)
      return
    }

    const blob = new Blob([JSON.stringify(completedResult, null, 2)], { type: 'application/json' })
    const href = URL.createObjectURL(blob)
    setDownloadHref(href)

    return () => URL.revokeObjectURL(href)
  }, [completedResult])

  const progressPct = useMemo(() => {
    if (!progress.total_phases) return 0
    return (progress.current_phase / progress.total_phases) * 100
  }, [progress.current_phase, progress.total_phases])

  const inputLabel = configMode === 'python-weightage'
    ? 'Python Test Script'
    : configMode === 'weightage'
      ? 'Source JSON Feed'
      : 'Raw Input Terminal'

  const inputPlaceholder = configMode === 'python-weightage'
    ? '// Paste Python (pytest) code here...'
    : configMode === 'weightage'
      ? '// Paste source JSON...'
      : '// Paste Playwright logs...'

  const saveHistory = (data: string, mode: string) => {
    const next = [
      { id: Date.now(), data, mode, time: new Date().toLocaleTimeString() },
      ...historyData,
    ].slice(0, 5)
    setHistoryData(next)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  }

  const handleFileUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    setFormMsg('Launching Mission...')
    setPreviewReady(false)
    setJsonPreview('// Transmission empty...')
    setCompletedResult(null)
    setProgress({ ...initialProgress, status: 'running', message: 'Launching Mission...' })

    try {
      const res = await fetch('/api/start', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')

      if (data.status === 'completed' && data.result) {
        setJobId(data.job_id)
        setCompletedResult(data.result)
        setJsonPreview(JSON.stringify(data.result, null, 2))
        setProgress({
          status: 'completed',
          phase: 'Completed',
          current_phase: 5,
          total_phases: 5,
          message: 'Normalization finished',
          summary: data.summary || {},
        })
        setFormMsg('Mission Complete.')
        setPreviewReady(true)
        return
      }

      setJobId(data.job_id)
    } catch (error: any) {
      setFormMsg(`Error: ${error.message}`)
      setProgress(initialProgress)
    }
  }

  const previewArtifact = async () => {
    if (completedResult) {
      setJsonPreview(JSON.stringify(completedResult, null, 2))
      return
    }

    if (!jobId) return
    try {
      const res = await fetch(`/api/result/${jobId}`)
      const data = await res.json()
      setJsonPreview(JSON.stringify(data, null, 2))
    } catch {
      setJsonPreview('No result available.')
    }
  }

  const processConfig = async () => {
    if (!configInput.trim()) return

    setIsProcessing(true)

    try {
      let endpoint = '/api/config/parse'
      const body: Record<string, string> = { data: configInput }

      if (configMode === 'weightage') {
        endpoint = '/api/config/weightage'
      } else if (configMode === 'python-weightage') {
        endpoint = '/api/config/python-weightage'
        body.strategy = configStrategy
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const result = await res.json()
      if (!res.ok || result.error) {
        throw new Error(result.error || 'Processing failed')
      }

      let outputForDisplay = result.output
      let tests: ReasoningItem[] = []

      if (configMode === 'python-weightage' && configStrategy === 'intelligent') {
        tests = result.output?.[0]?.testcases || []
        outputForDisplay = (result.output || []).map((group: any) => ({
          ...group,
          testcases: (group.testcases || []).map((test: any) => ({
            name: test.name,
            weightage: test.weightage,
          })),
        }))
      }

      const outputString = JSON.stringify(outputForDisplay, null, 2)
      setConfigOutput(outputString)
      setReasoning(tests)

      let count = 0
      if (configMode === 'parser') count = result.output?.tests?.length || 0
      else count = result.output?.[0]?.testcases?.length || 0
      setConfigCount(count)
      saveHistory(outputString, configMode)
    } catch (error: any) {
      setConfigOutput(`// ${error.message}`)
      setReasoning([])
      setConfigCount(0)
    } finally {
      setIsProcessing(false)
    }
  }

  const restoreHistory = (item: HistoryItem) => {
    setConfigOutput(item.data)
    setShowHistory(false)
  }

  const copyContent = async (text: string, buttonId: string) => {
    if (!text || text.startsWith('//') || text.startsWith('No result')) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedButton(buttonId)
      window.setTimeout(() => setCopiedButton((current) => (current === buttonId ? null : current)), 2000)
    } catch {}
  }

  return (
    <>
      <div className="galaxy-bg" />
      <div className="star-layer stars-1" />
      <div className="star-layer stars-2" />
      <div className="star-layer stars-3" />

      {showInfo && (
        <div className="overlay" onClick={() => setShowInfo(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowInfo(false)} aria-label="Close info modal">X</button>
            <h3 className="modal-title">Mission Protocol</h3>
            <div className="modal-content">
              <p><b>1. NORMALIZER:</b> Drop Playwright ZIP artifacts to extract structured test data.</p>
              <br />
              <p><b>2. SCANNER:</b> Convert raw terminal logs into a clean, searchable JSON matrix.</p>
              <br />
              <p><b>3. WEIGHTAGE:</b> Calibrate balanced execution distributions for CI optimization.</p>
            </div>
            <button className="btn-ion" onClick={() => setShowInfo(false)} style={{ marginTop: '2rem' }}>Acknowledge</button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="overlay" onClick={() => setShowHistory(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowHistory(false)} aria-label="Close history modal">X</button>
            <h3 className="modal-title">Celestial Archive</h3>
            <div>
              {historyData.length === 0 ? (
                <p className="empty-analysis">Archive Empty.</p>
              ) : historyData.map((item) => (
                <div className="history-card" key={item.id}>
                  <div className="history-head">
                    <span className="history-mode">{item.mode.toUpperCase()}</span>
                    <span className="history-time">{item.time}</span>
                  </div>
                  <pre className="history-preview">{item.data.substring(0, 150)}...</pre>
                  <button className="btn-ion" style={{ marginTop: '0.75rem', padding: '0.4rem', fontSize: '0.6rem' }} onClick={() => restoreHistory(item)}>Restore</button>
                </div>
              ))}
            </div>
            <button className="btn-ion" onClick={() => setShowHistory(false)} style={{ marginTop: '2rem' }}>Close Archives</button>
          </div>
        </div>
      )}

      <div className="app-container">
        <nav className="celestial-nav">
          <div className="container nav-flex">
            <div className="nav-brand">NOVA SYSTEM</div>
            <div className="nav-tabs">
              <button className={`nav-btn ${activeTab === 'normalizer' ? 'active' : ''}`} onClick={() => setActiveTab('normalizer')}>Report Normalizer</button>
              <button className={`nav-btn ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>Config Generator</button>
            </div>
          </div>
        </nav>

        <header className="app-header">
          <div className="container">
            <div className="brand-orbit">
              <div className="planet-ring" />
              <div className="planet-3d">
                <div className="surface" />
                <div className="clouds" />
                <div className="glow" />
              </div>
              <div className="satellite" />
            </div>
            <h1>Nova</h1>
            <p className="tagline">Galaxy-Scale Data Transformation</p>
          </div>
        </header>

        <main className="container">
          {activeTab === 'normalizer' && (
            <div className="dashboard-grid" id="section-normalizer">
              <aside>
                <section className="glass-card">
                  <div className="card-title">Launch Protocol</div>
                  <form onSubmit={handleFileUpload}>
                    <label className="ion-dropzone" htmlFor="zipInput">
                      <input id="zipInput" type="file" accept=".zip" required onChange={(event) => setFile(event.target.files?.[0] || null)} />
                                            <div className="ion-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 16V7" />
                          <path d="m8.5 10.5 3.5-3.5 3.5 3.5" />
                          <path d="M4 17.5c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2" />
                          <circle cx="18" cy="6" r="1.5" />
                          <circle cx="6" cy="8" r="1" />
                        </svg>
                      </div>
                      <span className="ion-label">Transmit Artifact</span>
                      <span className="ion-sub">Target: report.zip</span>
                    </label>
                    <button id="startBtn" type="submit" className="btn-ion" style={{ marginTop: '1rem' }} disabled={!file || progress.status === 'running'}>Initiate Warp</button>
                  </form>
                  <p className="inline-status">{formMsg}</p>
                </section>

                <section className="glass-card">
                  <div className="card-title">
                    Mission Status
                    <span className={`badge-celestial ${progress.status}`}>{progress.status === 'idle' ? 'Parked' : progress.status.toUpperCase()}</span>
                  </div>
                  <div className="progress-meta">
                    <span>Sector: {progress.phase || '-'}</span>
                    <span>{Math.round(progressPct)}%</span>
                  </div>
                  <div className="energy-track"><div className="energy-bar" style={{ width: `${progressPct}%` }} /></div>
                  <p className="log-stream">{progress.message || 'Telemetry awaiting signal...'}</p>
                </section>
              </aside>

              <article>
                <section className="glass-card">
                  <div className="card-title">Discovery Data</div>
                  <div className="celestial-stats">
                    <div className="stat-orb"><span className="label">Total Tests</span><strong>{progress.summary?.total || 0}</strong></div>
                    <div className="stat-orb"><span className="label">Success</span><strong style={{ color: 'var(--success)' }}>{progress.summary?.passed || 0}</strong></div>
                    <div className="stat-orb"><span className="label">Failed</span><strong style={{ color: 'var(--danger)' }}>{progress.summary?.failed || 0}</strong></div>
                    <div className="stat-orb"><span className="label">Efficiency</span><strong>{progress.summary?.pass_rate || 0}%</strong></div>
                    <div className="stat-orb full"><span className="label">Total Steps Extracted</span><strong style={{ color: 'var(--star-gold)' }}>{progress.summary?.steps || 0}</strong></div>
                  </div>
                  <div className="mission-actions">
                    <a className={`btn-ion ${!previewReady || (!jobId && !downloadHref) ? 'disabled' : ''}`} style={{ background: 'var(--success)', color: '#000' }} href={downloadHref || (jobId ? `/api/download/${jobId}` : '#')} download={downloadHref ? 'normalized_report.json' : undefined}>Recover Artifact</a>
                    <button className="btn-secondary" onClick={previewArtifact} disabled={!previewReady}>View Readout</button>
                  </div>
                </section>

                <section className="glass-card">
                  <div className="card-title">
                    <span>Artifact Readout</span>
                    <button className={`btn-copy ${copiedButton === 'main' ? 'copied' : ''}`} onClick={() => copyContent(jsonPreview, 'main')} disabled={!previewReady}>{copiedButton === 'main' ? 'Copied OK' : 'Copy JSON'}</button>
                  </div>
                  <div className="hologram-console"><pre>{jsonPreview}</pre></div>
                </section>
              </article>
            </div>
          )}

          {activeTab === 'config' && (
            <div id="section-config">
              <div className="config-header-hud">
                <div className="tabs-container">
                  <div className="tabs">
                    <button className={`tab ${configMode === 'parser' ? 'active' : ''}`} onClick={() => setConfigMode('parser')}>LOG SCANNER</button>
                    <button className={`tab ${configMode === 'weightage' ? 'active' : ''}`} onClick={() => setConfigMode('weightage')}>WEIGHTAGE</button>
                    <button className={`tab ${configMode === 'python-weightage' ? 'active' : ''}`} onClick={() => setConfigMode('python-weightage')}>PYTHON WEIGHTAGE</button>
                  </div>
                </div>

                {(configMode === 'weightage' || configMode === 'python-weightage') && (
                  <div id="strategyContainer">
                    <select className="strategy-select" value={configStrategy} onChange={(event) => setConfigStrategy(event.target.value)}>
                      <option value="equal">Equal (Sum 1.0)</option>
                      <option value="gradual">Gradual</option>
                      <option value="manual">Manual</option>
                      <option value="intelligent">Intelligent</option>
                    </select>
                  </div>
                )}

                <div className="utility-controls">
                  <button className="icon-btn" title="Mission Briefing" onClick={() => setShowInfo(true)} aria-label="Open mission briefing">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                  </button>
                  <button className="icon-btn" title="Celestial Archive" onClick={() => setShowHistory(true)} aria-label="Open history">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  </button>
                  <div className="stat-orb-mini">
                    <span className="label">Identified</span>
                    <strong>{String(configCount).padStart(2, '0')}</strong>
                  </div>
                </div>
              </div>

              <div className="dashboard-grid">
                <section className="glass-card">
                  <div className="card-title">
                    <span>{inputLabel}</span>
                    <button className="btn-copy" style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', width: 'auto' }} onClick={() => setConfigInput('')}>Purge</button>
                  </div>
                  <textarea className="input-area" placeholder={inputPlaceholder} value={configInput} onChange={(event) => setConfigInput(event.target.value)} />
                  <button className="btn-ion" onClick={processConfig} style={{ marginTop: '1.5rem' }} disabled={isProcessing}>
                    {isProcessing ? 'Scanning...' : configMode === 'parser' ? 'Initiate Scan' : 'Calibrate Weightage'}
                  </button>
                </section>

                <section className="glass-card">
                  <div className="card-title">
                    <span>Output Matrix</span>
                    <button className={`btn-copy ${copiedButton === 'config' ? 'copied' : ''}`} onClick={() => copyContent(configOutput, 'config')}>{copiedButton === 'config' ? 'Copied OK' : 'Copy JSON'}</button>
                  </div>
                  <div className="hologram-console"><pre>{configOutput}</pre></div>

                  {configMode === 'python-weightage' && configStrategy === 'intelligent' && (
                    <div className="reasoning-wrap">
                      <div className="card-title reasoning-title">Intelligent Analysis</div>
                      {reasoning.length === 0 ? (
                        <p className="empty-analysis">Analysis data unavailable. Ensure backend connection.</p>
                      ) : (
                        reasoning.map((item) => (
                          <div className="reason-card" key={item.name}>
                            <div className="reason-head">
                              <span className="reason-name">{item.name}</span>
                              <span className="reason-weight">{item.weightage}</span>
                            </div>
                            <div className="reason-text">{item.reason || 'No analysis available.'}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}
        </main>

        <footer className="app-footer">
          <div className="container">
            <p>© 2026 NOVA UNIFIED SYSTEM • DATA TRANSFORMATION FRONTIER</p>
          </div>
        </footer>
      </div>
    </>
  )
}






