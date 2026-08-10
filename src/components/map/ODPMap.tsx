'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

let L: typeof import('leaflet') | null = null

async function loadLeaflet() {
  if (L) return L
  const leaflet = await import('leaflet')
  L = leaflet.default
  L.Icon.Default.mergeOptions({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  })
  return L
}

interface DataPoint {
  id: string
  latitude: number
  longitude: number
  metadata: Record<string, any>
  createdAt: string
}

interface MapViewProps {
  points: DataPoint[]
  loading: boolean
  selectedPoint: DataPoint | null
  onSelectPoint: (p: DataPoint | null) => void
  columns: string[]
}

export default function ODPMap({ points, loading, selectedPoint, onSelectPoint, columns }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const layerGroupRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const pointsRef = useRef(points)
  useEffect(() => { pointsRef.current = points }, [points])
  const stableSelect = useCallback((p: DataPoint | null) => onSelectPoint(p), [onSelectPoint])

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let destroyed = false
    async function init() {
      try {
        const leaflet = await loadLeaflet()
        if (destroyed || !containerRef.current) return
        if (!document.querySelector('link[data-leaflet-css]')) {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
          link.setAttribute('data-leaflet-css', 'true')
          document.head.appendChild(link)
          await new Promise(r => setTimeout(r, 100))
        }
        if (destroyed || !containerRef.current) return
        const map = leaflet.map(containerRef.current, {
          center: [-2.5, 118], zoom: 5, zoomControl: false, preferCanvas: true,
        })
        leaflet.control.zoom({ position: 'topright' }).addTo(map)
        leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
          maxZoom: 19,
        }).addTo(map)
        const layerGroup = leaflet.layerGroup().addTo(map)
        map.fitBounds([[-8, 95], [6, 141]])
        if (!destroyed) { mapRef.current = map; layerGroupRef.current = layerGroup; setMapReady(true) }
      } catch (err) {
        console.error('Map init error:', err)
        if (!destroyed) setMapError('Gagal memuat peta')
      }
    }
    init()
    return () => {
      destroyed = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; layerGroupRef.current = null; markersRef.current.clear() }
    }
  }, [])

  // Dynamic popup from metadata
  const buildPopup = (point: DataPoint, cols: string[]): string => {
    const meta = point.metadata || {}
    const displayCols = cols.slice(0, 6).filter(c => meta[c] && meta[c] !== '')
    const rows = displayCols.map(c =>
      `<div><b>${c}:</b> ${String(meta[c]).substring(0, 50)}</div>`
    ).join('')
    return `<div style="min-width:200px;font-family:system-ui,sans-serif;">${rows}<div style="margin-top:6px;font-size:10px;color:#94a3b8;">${point.latitude}, ${point.longitude}</div></div>`
  }

  // Update markers
  useEffect(() => {
    if (!mapReady || !layerGroupRef.current || !L) return
    const layer = layerGroupRef.current
    layer.clearLayers()
    markersRef.current.clear()
    let hasValid = false
    for (const point of pointsRef.current) {
      if (point.latitude === 0 && point.longitude === 0) continue
      const isSelected = selectedPoint?.id === point.id
      const marker = L!.circleMarker([point.latitude, point.longitude], {
        radius: isSelected ? 7 : 4,
        fillColor: isSelected ? '#059669' : '#10b981',
        color: isSelected ? '#ffffff' : '#059669',
        weight: isSelected ? 3 : 1,
        opacity: 1,
        fillOpacity: isSelected ? 1 : 0.7,
      })
      marker.bindPopup(buildPopup(point, columns), { maxWidth: 300 })
      marker.on('click', () => stableSelect(point))
      layer.addLayer(marker)
      markersRef.current.set(point.id, marker)
      hasValid = true
    }
    // Auto-fit bounds on first load
    if (hasValid && pointsRef.current.length > 0 && !selectedPoint) {
      const valid = pointsRef.current.filter(p => p.latitude !== 0 && p.longitude !== 0)
      if (valid.length > 0) {
        const bounds = L!.latLngBounds(valid.map(p => [p.latitude, p.longitude] as [number, number]))
        mapRef.current?.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
      }
    }
  }, [mapReady, selectedPoint, stableSelect, points.length, columns])

  // Highlight selected
  useEffect(() => {
    if (!mapRef.current || !selectedPoint) return
    if (selectedPoint.latitude === 0 && selectedPoint.longitude === 0) return
    const marker = markersRef.current.get(selectedPoint.id)
    if (marker) {
      mapRef.current.setView([selectedPoint.latitude, selectedPoint.longitude], 16, { animate: true })
      setTimeout(() => marker.openPopup(), 300)
    }
  }, [selectedPoint])

  if (mapError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
        <div className="text-center p-8">
          <p className="text-slate-500">{mapError}</p>
          <button className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700" onClick={() => window.location.reload()}>Muat Ulang</button>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="w-full h-full" />
      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 text-xs">
        <div className="font-semibold text-slate-700 mb-1">Titik Data</div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm" />
          <span className="text-slate-600">{points.filter(p => p.latitude !== 0 && p.longitude !== 0).length.toLocaleString()} titik</span>
        </div>
      </div>
      {/* Loading */}
      {loading && !mapReady && (
        <div className="absolute inset-0 z-[1001] bg-white/60 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-600 font-medium">Memuat data...</span>
          </div>
        </div>
      )}
    </div>
  )
}
