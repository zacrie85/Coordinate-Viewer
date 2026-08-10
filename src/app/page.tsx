'use client'

import { useState, useEffect, useCallback } from 'react'
import { Menu, MapPin, X, PanelRightClose, Upload, Globe } from 'lucide-react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'

const ODPMap = dynamic(() => import('@/components/map/ODPMap'), { ssr: false })
const UploadExcelDialog = dynamic(() => import('@/components/map/UploadExcelDialog'), { ssr: false })
const FilterSidebar = dynamic(() => import('@/components/map/FilterSidebar'), { ssr: false })
const ODPDetailPanel = dynamic(() => import('@/components/map/ODPDetailPanel'), { ssr: false })
const GoogleEarthDialog = dynamic(() => import('@/components/map/GoogleEarthDialog'), { ssr: false })

interface DataPoint {
  id: string; latitude: number; longitude: number; metadata: Record<string, any>; createdAt: string
}

interface ColumnInfo {
  columns: string[]; datasetName: string; latCol: string | null; lngCol: string | null; coordCol: string | null; datasetId: string
}

interface StatsData { total: number; withCoord: number; withoutCoord: number; datasetName: string; rowCount: number }

export interface CustomFilterSlot { field: string; values: string[] }

export interface MarkerConfig {
  nameCol1: string
  nameCol2: string
  capacityCol: string
  activeCol: string
  availCol: string
}

const DEFAULT_MC: MarkerConfig = { nameCol1: '', nameCol2: '', capacityCol: '', activeCol: '', availCol: '' }
const MC_KEY = 'odp-marker-config'

function loadMC(): MarkerConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_MC }
  try { const s = localStorage.getItem(MC_KEY); return s ? { ...DEFAULT_MC, ...JSON.parse(s) } : { ...DEFAULT_MC } } catch { return { ...DEFAULT_MC } }
}

export default function Home() {
  const [points, setPoints] = useState<DataPoint[]>([])
  const [stats, setStats] = useState<StatsData | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [datasetName, setDatasetName] = useState('')
  const [coordInfo, setCoordInfo] = useState({ latCol: null as string | null, lngCol: null as string | null, coordCol: null as string | null })
  const [loading, setLoading] = useState(true)
  const [selectedPoint, setSelectedPoint] = useState<DataPoint | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [googleEarthOpen, setGoogleEarthOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [hasCoord, setHasCoord] = useState('')
  const [customFilters, setCustomFilters] = useState<CustomFilterSlot[]>([
    { field: '', values: [] }, { field: '', values: [] }, { field: '', values: [] },
  ])
  const [markerConfig, setMarkerConfig] = useState<MarkerConfig>(loadMC)

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(MC_KEY, JSON.stringify(markerConfig))
  }, [markerConfig])

  const loadColumns = useCallback(() => {
    fetch('/api/data/columns').then(r => r.json()).then((d: ColumnInfo) => {
      setColumns(d.columns || [])
      setDatasetName(d.datasetName || '')
      setCoordInfo({ latCol: d.latCol, lngCol: d.lngCol, coordCol: d.coordCol })
    }).catch(() => {})
  }, [])

  const loadStats = useCallback(() => {
    fetch('/api/data/stats').then(r => r.json()).then((d: StatsData) => setStats(d)).catch(() => {})
  }, [])

  const loadData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('limit', '25000')
    if (searchQuery) params.set('search', searchQuery)
    if (hasCoord) params.set('hasCoord', hasCoord)
    customFilters.forEach((cf, i) => {
      if (cf.field && cf.values.length > 0) {
        params.set(`cf${i}`, cf.field)
        params.set(`cv${i}`, cf.values.join(','))
      }
    })
    fetch(`/api/data?${params}`).then(r => r.json()).then(d => {
      setPoints(d.data || [])
      setLoading(false)
    }).catch(() => { setLoading(false); toast.error('Gagal memuat data') })
  }, [searchQuery, hasCoord, customFilters])

  const refreshAll = useCallback(() => { loadStats(); loadColumns(); loadData() }, [loadStats, loadColumns, loadData])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadColumns() }, [loadColumns])
  useEffect(() => { loadData() }, [loadData])

  const handleFiltersChange = useCallback((f: { search: string; hasCoord: string; customFilters: CustomFilterSlot[] }) => {
    setSearchQuery(f.search); setHasCoord(f.hasCoord); setCustomFilters(f.customFilters); setSelectedPoint(null)
  }, [])

  const filteredWithCoord = points.filter(p => p.latitude !== 0 && p.longitude !== 0).length

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* Mobile header */}
      <div className="lg:hidden flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200 z-50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center"><MapPin className="w-4 h-4 text-emerald-600" /></div>
          <div><h1 className="text-sm font-bold text-slate-800">Map Viewer</h1><p className="text-[10px] text-slate-400">{datasetName || 'Upload Excel untuk mulai'}</p></div>
        </div>
        <div className="flex items-center gap-1">
          {stats && stats.total > 0 && (
            <button className="h-8 px-2 flex items-center gap-1.5 rounded-lg hover:bg-blue-50 text-blue-600" onClick={() => setGoogleEarthOpen(true)}>
              <Globe className="w-4 h-4" /><span className="text-xs font-medium">KML</span>
            </button>
          )}
          <button className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-100" onClick={() => setMobileSidebar(!mobileSidebar)}><Menu className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {mobileSidebar && (
          <div className="lg:hidden fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileSidebar(false)} />
            <div className="relative z-50 w-80 h-full">
              <FilterSidebar stats={stats} columns={columns} datasetName={datasetName} coordInfo={coordInfo} totalResults={points.length} searchQuery={searchQuery} hasCoord={hasCoord} customFilters={customFilters} markerConfig={markerConfig} onMarkerConfigChange={setMarkerConfig} onFiltersChange={(f) => { handleFiltersChange(f); setMobileSidebar(false) }} onUploadClick={() => { setUploadDialogOpen(true); setMobileSidebar(false) }} onDatasetSwitch={refreshAll} onClose={() => setMobileSidebar(false)} />
            </div>
          </div>
        )}

        {sidebarOpen && (
          <div className="hidden lg:block shrink-0">
            <FilterSidebar stats={stats} columns={columns} datasetName={datasetName} coordInfo={coordInfo} totalResults={points.length} searchQuery={searchQuery} hasCoord={hasCoord} customFilters={customFilters} markerConfig={markerConfig} onMarkerConfigChange={setMarkerConfig} onFiltersChange={handleFiltersChange} onUploadClick={() => setUploadDialogOpen(true)} onDatasetSwitch={refreshAll} />
          </div>
        )}

        <div className="flex-1 relative min-h-0 min-w-0">
          {!sidebarOpen && (
            <button className="absolute top-4 left-4 z-[1000] h-9 w-9 bg-white rounded-lg shadow-lg flex items-center justify-center hover:bg-slate-50" onClick={() => setSidebarOpen(true)}><Menu className="w-4 h-4" /></button>
          )}
          {sidebarOpen && (
            <button className="hidden lg:flex absolute top-4 left-[21rem] z-[1000] h-9 w-9 bg-white rounded-lg shadow-lg items-center justify-center hover:bg-slate-50" onClick={() => setSidebarOpen(false)}><PanelRightClose className="w-4 h-4" /></button>
          )}

          {stats && stats.total > 0 && (
            <button className="absolute top-4 right-4 z-[1000] h-9 px-3 bg-white rounded-lg shadow-lg flex items-center gap-2 hover:bg-blue-50 text-blue-600 font-medium text-xs transition-colors" onClick={() => setGoogleEarthOpen(true)}>
              <Globe className="w-4 h-4" /><span className="hidden sm:inline">Export Google Earth</span>
            </button>
          )}

          <ODPMap points={points} loading={loading} selectedPoint={selectedPoint} onSelectPoint={setSelectedPoint} columns={columns} markerConfig={markerConfig} />

          {selectedPoint && (
            <div className="hidden md:block absolute right-0 top-0 h-full z-[999]">
              <ODPDetailPanel point={selectedPoint} columns={columns} markerConfig={markerConfig} onClose={() => setSelectedPoint(null)} />
            </div>
          )}
          {selectedPoint && (
            <div className="md:hidden absolute bottom-0 left-0 right-0 z-[999] max-h-[60vh] overflow-y-auto rounded-t-2xl shadow-2xl bg-white">
              <div className="flex justify-center py-2"><div className="w-10 h-1 rounded-full bg-slate-300" /></div>
              <ODPDetailPanel point={selectedPoint} columns={columns} markerConfig={markerConfig} onClose={() => setSelectedPoint(null)} />
            </div>
          )}

          {!loading && points.length === 0 && !stats?.total && (
            <div className="absolute inset-0 flex items-center justify-center z-[1001]">
              <div className="text-center p-8 bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl max-w-sm">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4"><Upload className="w-8 h-8 text-emerald-600" /></div>
                <h2 className="text-lg font-bold text-slate-800 mb-2">Belum Ada Data</h2>
                <p className="text-sm text-slate-500 mb-4">Upload file Excel yang berisi data koordinat. Format apapun bisa!</p>
                <button className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700" onClick={() => setUploadDialogOpen(true)}>Upload Excel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <UploadExcelDialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} onUploadComplete={refreshAll} />

      <GoogleEarthDialog
        open={googleEarthOpen} onOpenChange={setGoogleEarthOpen}
        filters={{ search: searchQuery, hasCoord, customFilters }}
        markerConfig={markerConfig}
        filteredCount={filteredWithCoord} totalCount={stats?.withCoord || 0} datasetName={datasetName}
      />
    </div>
  )
}
