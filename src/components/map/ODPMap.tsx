'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { MarkerConfig } from '@/app/page'

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
  id: string; latitude: number; longitude: number; metadata: Record<string, any>; createdAt: string
}

interface MapViewProps {
  points: DataPoint[]; loading: boolean; selectedPoint: DataPoint | null
  onSelectPoint: (p: DataPoint | null) => void; columns: string[]; markerConfig: MarkerConfig
}

function calcPct(meta: Record<string, any>, mc: MarkerConfig): { pct: number; activeRaw: string; capRaw: string } {
  if (mc.activeCol && mc.capacityCol) {
    const aRaw = String(meta[mc.activeCol] ?? '').trim()
    const cRaw = String(meta[mc.capacityCol] ?? '').trim()
    const aNum = parseFloat(aRaw.replace(/,/g, ''))
    const cNum = parseFloat(cRaw.replace(/,/g, ''))
    if (!isNaN(aNum) && !isNaN(cNum) && cNum > 0) {
      return { pct: (aNum / cNum) * 100, activeRaw: aRaw, capRaw: cRaw }
    }
  }
  if (mc.capacityCol) {
    const raw = String(meta[mc.capacityCol] ?? '').trim()
    const m = raw.match(/^(\d+)\s*[\/\-]\s*(\d+)$/)
    if (m) {
      const a = parseInt(m[1]), c = parseInt(m[2])
      if (c > 0) return { pct: (a / c) * 100, activeRaw: m[1], capRaw: m[2] }
    }
    const p = raw.match(/^(\d+(?:\.\d+)?)\s*%?$/)
    if (p) return { pct: parseFloat(p[1]), activeRaw: raw, capRaw: '' }
  }
  return { pct: -1, activeRaw: '', capRaw: '' }
}

const CAP_COLORS = [
  { min: 0, max: 25, color: '#22c55e', label: '0-25%' },
  { min: 26, max: 50, color: '#3b82f6', label: '26-50%' },
  { min: 51, max: 75, color: '#eab308', label: '51-75%' },
  { min: 76, max: 100, color: '#ef4444', label: '76-100%' },
]

function getColor(pct: number): string {
  if (pct < 0) return '#10b981'
  for (const c of CAP_COLORS) { if (pct >= c.min && pct <= c.max) return c.color }
  return '#10b981'
}

function statusColor(val: string): string {
  if (!val) return ''
  const v = val.toUpperCase().trim()
  if (v === 'ENABLE' || v === 'ACTIVE' || v === 'AVAILABLE' || v === 'UP') return '#22c55e'
  if (v === 'DISABLE' || v === 'INACTIVE' || v === 'DOWN') return '#ef4444'
  if (v === 'FULL') return '#ef4444'
  return '#64748b'
}

export default function ODPMap({ points, loading, selectedPoint, onSelectPoint, columns, markerConfig }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const layerGroupRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const pointsRef = useRef(points)
  useEffect(() => { pointsRef.current = points }, [points])
  const stableSelect = useCallback((p: DataPoint | null) => onSelectPoint(p), [onSelectPoint])
  const mcRef = useRef(markerConfig)
  useEffect(() => { mcRef.current = markerConfig }, [markerConfig])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let destroyed = false
    async function init() {
      try {
        const leaflet = await loadLeaflet()
        if (destroyed || !containerRef.current) return
        if (!document.querySelector('link[data-leaflet-css]')) {
          const link = document.createElement('link'); link.rel = 'stylesheet'
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
          link.setAttribute('data-leaflet-css', 'true'); document.head.appendChild(link)
          await new Promise(r => setTimeout(r, 100))
        }
        if (destroyed || !containerRef.current) return
        const map = leaflet.map(containerRef.current, { center: [-2.5, 118], zoom: 5, zoomControl: false, preferCanvas: true })
        leaflet.control.zoom({ position: 'topright' }).addTo(map)
        leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>', maxZoom: 19,
        }).addTo(map)
        const layerGroup = leaflet.layerGroup().addTo(map)
        map.fitBounds([[-8, 95], [6, 141]])

        if (!document.querySelector('#odp-label-style')) {
          const st = document.createElement('style'); st.id = 'odp-label-style'
          st.textContent = `.odp-marker-label{background:none!important;border:none!important;box-shadow:none!important;color:#1e293b!important;font-size:10px!important;font-weight:600!important;font-family:system-ui,sans-serif!important;padding:1px 3px!important;white-space:nowrap!important;text-shadow:1px 1px 2px white,-1px -1px 2px white,1px -1px 2px white,-1px 1px 2px white!important;}.odp-marker-label::before{display:none!important;}`
          document.head.appendChild(st)
        }
        map.on('zoomend', () => {
          const show = map.getZoom() >= 13
          layerGroup.eachLayer((l: any) => { if (l.getTooltip()) { const el = l.getTooltip().getElement(); if (el) el.style.display = show ? '' : 'none' } })
        })

        if (!destroyed) { mapRef.current = map; layerGroupRef.current = layerGroup; setMapReady(true) }
      } catch (err) {
        console.error('Map init error:', err)
        if (!destroyed) setMapError('Gagal memuat peta')
      }
    }
    init()
    return () => { destroyed = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; layerGroupRef.current = null; markersRef.current.clear() } }
  }, [])

  // Extract code (pakai yang lebih pendek antara nameCol1/nameCol2)
  const getCode = (meta: Record<string, any>): string => {
    const mc = mcRef.current
    const n1 = mc.nameCol1 ? String(meta[mc.nameCol1] || '').trim() : ''
    const n2 = mc.nameCol2 ? String(meta[mc.nameCol2] || '').trim() : ''
    if (n1 && n2) return n1.length <= n2.length ? n1 : n2
    return n1 || n2
  }

  // Popup: CODE + ACTIVE/CAPACITY saja
  const buildPopup = useCallback((point: DataPoint): string => {
    const meta = point.metadata || {}
    const { activeRaw, capRaw } = calcPct(meta, mcRef.current)
    const code = getCode(meta)
    let html = `<div style="min-width:160px;font-family:system-ui,sans-serif;">`
    if (code) html += `<div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:4px;">${code}</div>`
    if (activeRaw && capRaw) html += `<div style="font-size:14px;font-weight:600;color:#334155;">${activeRaw} / ${capRaw}</div>`
    html += `<div style="font-size:10px;color:#94a3b8;margin-top:6px;">${point.latitude}, ${point.longitude}</div></div>`
    return html
  }, [])

  const capStats = useMemo(() => {
    if (!markerConfig.activeCol || !markerConfig.capacityCol) return null
    let g = 0, b = 0, y = 0, r = 0, na = 0
    for (const p of points) {
      const { pct } = calcPct(p.metadata || {}, markerConfig)
      if (pct < 0) { na++; continue }
      if (pct <= 25) g++
      else if (pct <= 50) b++
      else if (pct <= 75) y++
      else r++
    }
    return { green: g, blue: b, yellow: y, red: r, na }
  }, [points, markerConfig.activeCol, markerConfig.capacityCol])

  useEffect(() => {
    if (!mapReady || !layerGroupRef.current || !L) return
    const layer = layerGroupRef.current
    layer.clearLayers(); markersRef.current.clear()
    let hasValid = false
    for (const point of pointsRef.current) {
      if (point.latitude === 0 && point.longitude === 0) continue
      const isSelected = selectedPoint?.id === point.id
      const { pct } = calcPct(point.metadata || {}, mcRef.current)
      const fillColor = isSelected ? '#ffffff' : getColor(pct)
      const strokeColor = isSelected ? '#000000' : getColor(pct)
      const marker = L!.circleMarker([point.latitude, point.longitude], {
        radius: isSelected ? 8 : 5,
        fillColor,
        color: strokeColor,
        weight: isSelected ? 3 : 1.5,
        opacity: 1,
        fillOpacity: isSelected ? 1 : 0.75,
      })
      marker.bindPopup(buildPopup(point), { maxWidth: 340, minWidth: 260 })
      marker.on('click', () => stableSelect(point))
      const code = getCode(point.metadata || {})
      if (code) { marker.bindTooltip(code, { permanent: true, direction: 'right', offset: [6, 0], className: 'odp-marker-label' }) }
      layer.addLayer(marker)
      markersRef.current.set(point.id, marker)
      hasValid = true
    }
    if (hasValid && pointsRef.current.length > 0 && !selectedPoint) {
      const valid = pointsRef.current.filter(p => p.latitude !== 0 && p.longitude !== 0)
      if (valid.length > 0) {
        const bounds = L!.latLngBounds(valid.map(p => [p.latitude, p.longitude] as [number, number]))
        mapRef.current?.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
      }
    }
  }, [mapReady, selectedPoint, stableSelect, points.length, columns, buildPopup])

  useEffect(() => {
    if (!mapRef.current || !selectedPoint) return
    if (selectedPoint.latitude === 0 && selectedPoint.longitude === 0) return
    const marker = markersRef.current.get(selectedPoint.id)
    if (marker) { mapRef.current.setView([selectedPoint.latitude, selectedPoint.longitude], 16, { animate: true }); setTimeout(() => marker.openPopup(), 300) }
  }, [selectedPoint])

  if (mapError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
        <div className="text-center p-8"><p className="text-slate-500">{mapError}</p>
          <button className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700" onClick={() => window.location.reload()}>Muat Ulang</button></div>
      </div>
    )
  }

  const totalCoord = points.filter(p => p.latitude !== 0 && p.longitude !== 0).length

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 text-xs space-y-1.5">
        <div className="font-semibold text-slate-700">Titik Data: {totalCoord.toLocaleString()}</div>
        {capStats && markerConfig.activeCol && markerConfig.capacityCol ? (
          <div className="space-y-1 pt-1 border-t border-slate-100">
            <div className="text-[10px] text-slate-400 font-medium">{markerConfig.activeCol} / {markerConfig.capacityCol}</div>
            {CAP_COLORS.map(c => {
              const count = c.label === '0-25%' ? capStats.green : c.label === '26-50%' ? capStats.blue : c.label === '51-75%' ? capStats.yellow : capStats.red
              return (
                <div key={c.label} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color, boxShadow: `0 0 4px ${c.color}40` }} />
                  <span className="text-slate-600">{c.label}</span>
                  <span className="text-slate-400 ml-auto tabular-nums">{count.toLocaleString()}</span>
                </div>
              )
            })}
            {capStats.na > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-300 shrink-0" />
                <span className="text-slate-400">N/A</span>
                <span className="text-slate-300 ml-auto tabular-nums">{capStats.na.toLocaleString()}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm" />
            <span className="text-slate-600">{totalCoord.toLocaleString()} titik</span>
          </div>
        )}
      </div>
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