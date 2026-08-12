'use client'

import { useState, useEffect, useMemo } from 'react'
import { Globe, Download, X, Filter, MapPin, Check, Layers, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface FilterConfig {
  search: string
  hasCoord: string
  customField: string
  customValues: string[]
}

interface GoogleEarthDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  filters: FilterConfig
  filteredCount: number
  totalCount: number
  columns: string[]
}

export default function GoogleEarthDialog({ open, onOpenChange, filters, filteredCount, totalCount, columns }: GoogleEarthDialogProps) {
  const [refreshMin, setRefreshMin] = useState('5')
  const [hostInput, setHostInput] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [exportMode, setExportMode] = useState<'filtered' | 'all'>('filtered')
  const [selectedLabelCols, setSelectedLabelCols] = useState<string[]>([])

  // Reset labelCols saat dialog buka
  useEffect(() => {
    if (open) setSelectedLabelCols([])
  }, [open])

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  const hasActiveFilters = !!(filters.search || filters.hasCoord || (filters.customField && filters.customValues.length > 0))

  const getFilterParams = () => {
    if (exportMode === 'all') return new URLSearchParams()
    const params = new URLSearchParams()
    if (filters.search) params.set('search', filters.search)
    if (filters.hasCoord) params.set('hasCoord', filters.hasCoord)
    if (filters.customField && filters.customValues.length > 0) {
      params.set('customField', filters.customField)
      params.set('customValues', filters.customValues.join(','))
    }
    return params
  }

  const buildUrl = (basePath: string) => {
    const params = getFilterParams()
    if (selectedLabelCols.length > 0) params.set('labelCols', selectedLabelCols.join(','))
    return params.toString() ? `${basePath}?${params.toString()}` : basePath
  }

  const buildNetworkLinkUrl = () => {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    const h = hostInput.trim() || new URL(base).host
    const filterParams = getFilterParams()
    if (selectedLabelCols.length > 0) filterParams.set('labelCols', selectedLabelCols.join(','))
    filterParams.set('host', h)
    filterParams.set('protocol', new URL(base).protocol.replace(':', ''))
    filterParams.set('refresh', refreshMin)
    return `/api/kml/network-link?${filterParams.toString()}`
  }

  const buildDirectKmlUrl = () => buildUrl('/api/kml')

  const downloadBlob = async (url: string, filename: string, label: string) => {
    if (downloading) return
    setDownloading(label)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl; a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      toast.success(`${filename} berhasil didownload!`)
    } catch (err) {
      console.error('Download error:', err)
      toast.error('Gagal download. Coba lagi.')
    } finally { setDownloading(null) }
  }

  const toggleLabelCol = (col: string) => {
    setSelectedLabelCols(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    )
  }

  const fullKmlUrl = typeof window !== 'undefined'
    ? buildDirectKmlUrl().replace('/api/kml', `${window.location.origin}/api/kml`)
    : '/api/kml'

  const displayCount = exportMode === 'filtered' ? filteredCount : totalCount

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" style={{ zIndex: 10000 }}>
        <div className="flex items-center justify-between p-4 pb-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-blue-100 flex items-center justify-center">
              <Globe className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Export ke Google Earth</h2>
              <p className="text-[11px] text-slate-400">KML dengan filter atau semua data</p>
            </div>
          </div>
          <button onClick={() => onOpenChange(false)} className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Label Columns Selector */}
          {columns.length > 0 && (
            <div className="bg-violet-50 rounded-lg p-3 border border-violet-100">
              <div className="flex items-center gap-2 mb-2">
                <Tag className="w-3.5 h-3.5 text-violet-600" />
                <span className="text-xs font-semibold text-violet-800">Label di Google Earth</span>
                <span className="text-[10px] text-violet-500">pilih kolom</span>
              </div>
              <p className="text-[11px] text-violet-600 mb-2">Pilih kolom yang akan jadi nama titik di Google Earth. Urutan = prioritas.</p>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {columns.map(col => (
                  <button
                    key={col}
                    onClick={() => toggleLabelCol(col)}
                    className={`px-2.5 py-1 rounded-md text-[11px] border transition-all font-medium ${
                      selectedLabelCols.includes(col)
                        ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                    }`}
                  >
                    {selectedLabelCols.includes(col) && <span className="mr-1">{selectedLabelCols.indexOf(col) + 1}.</span>}
                    {col}
                  </button>
                ))}
              </div>
              {selectedLabelCols.length > 0 && (
                <div className="mt-2 text-[10px] text-violet-600">
                  Label: <b>{selectedLabelCols.join(' → ')}</b>
                  <button onClick={() => setSelectedLabelCols([])} className="ml-2 text-violet-400 hover:text-violet-700 underline">Reset</button>
                </div>
              )}
            </div>
          )}

          {/* Export Mode */}
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">Data yang di-export</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setExportMode('filtered')}
                className={`relative flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-all text-center ${
                  exportMode === 'filtered'
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                } ${!hasActiveFilters ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                disabled={!hasActiveFilters}
              >
                {exportMode === 'filtered' && hasActiveFilters && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
                <Filter className={`w-4 h-4 ${exportMode === 'filtered' ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className={`text-[11px] font-semibold ${exportMode === 'filtered' ? 'text-blue-700' : 'text-slate-600'}`}>Filtered</span>
                <span className="text-lg font-bold text-blue-600">{filteredCount.toLocaleString('id-ID')}</span>
              </button>
              <button
                onClick={() => setExportMode('all')}
                className={`relative flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-all text-center cursor-pointer ${
                  exportMode === 'all'
                    ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {exportMode === 'all' && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
                <MapPin className={`w-4 h-4 ${exportMode === 'all' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span className={`text-[11px] font-semibold ${exportMode === 'all' ? 'text-emerald-700' : 'text-slate-600'}`}>Semua</span>
                <span className="text-lg font-bold text-emerald-600">{totalCount.toLocaleString('id-ID')}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <MapPin className="w-3 h-3" />
            <span><b className="text-slate-700">{displayCount.toLocaleString('id-ID')}</b> titik akan di-export</span>
          </div>

          {/* Refresh interval */}
          <div>
            <label className="text-xs font-medium text-slate-700 mb-1 block">Interval Auto-Refresh (NetworkLink)</label>
            <select className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md bg-white" value={refreshMin} onChange={(e) => setRefreshMin(e.target.value)}>
              <option value="1">Setiap 1 menit</option>
              <option value="5">Setiap 5 menit</option>
              <option value="15">Setiap 15 menit</option>
              <option value="30">Setiap 30 menit</option>
              <option value="60">Setiap 1 jam</option>
              <option value="240">Setiap 4 jam</option>
              <option value="480">Setiap 8 jam</option>
              <option value="960">Setiap 16 jam</option>
              <option value="1440">Setiap 24 jam</option>
            </select>
          </div>

          {/* Host input */}
          <div>
            <label className="text-xs font-medium text-slate-700 mb-1 block">
              Host Server <span className="text-slate-400 font-normal">(opsional)</span>
            </label>
            <Input placeholder={typeof window !== 'undefined' ? window.location.host : 'localhost:3000'} value={hostInput} onChange={(e) => setHostInput(e.target.value)} className="h-9 text-sm" />
          </div>

          {/* NetworkLink */}
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-bold text-blue-800">NetworkLink (Auto-refresh)</div>
              <span className="text-[10px] bg-blue-200/60 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">Rekomendasi</span>
            </div>
            <p className="text-[11px] text-blue-600 mb-2.5">Buka di Google Earth, data otomatis refresh.</p>
            <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => downloadBlob(buildNetworkLinkUrl(), 'odp-realtime.kml', 'networklink')} disabled={downloading === 'networklink'}>
              {downloading === 'networklink' ? (
                <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Mengunduh...</span>
              ) : (
                <><Download className="w-3.5 h-3.5 mr-2" />Download NetworkLink KML</>
              )}
            </Button>
          </div>

          {/* Direct KML */}
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <div className="text-xs font-bold text-slate-700 mb-1">KML Langsung (Snapshot)</div>
            <p className="text-[11px] text-slate-500 mb-2.5">Download data saat ini, tidak auto-refresh.</p>
            <Button size="sm" variant="outline" className="w-full" onClick={() => downloadBlob(buildDirectKmlUrl(), 'odp-data.kml', 'direct')} disabled={downloading === 'direct'}>
              {downloading === 'direct' ? (
                <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />Mengunduh...</span>
              ) : (
                <><Download className="w-3.5 h-3.5 mr-2" />Download KML</>
              )}
            </Button>
          </div>

          {/* Copy URL */}
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <div className="text-xs font-bold text-slate-700 mb-1">Copy URL KML</div>
            <div className="flex gap-2">
              <Input readOnly value={fullKmlUrl} className="h-8 text-[11px] font-mono flex-1" onClick={(e) => (e.target as HTMLInputElement).select()} />
              <Button size="sm" variant="outline" className="shrink-0 h-8 px-3" onClick={() => { navigator.clipboard.writeText(fullKmlUrl); toast.success('URL disalin!') }}>Salin</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
