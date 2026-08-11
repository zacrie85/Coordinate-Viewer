'use client'

import { X, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

interface DetailPanelProps {
  point: { id: string; latitude: number; longitude: number; metadata: Record<string, any>; createdAt: string }
  columns: string[]
  onClose: () => void
}

export default function ODPDetailPanel({ point, columns, onClose }: DetailPanelProps) {
  const meta = point.metadata || {}
  const hasCoord = point.latitude !== 0 && point.longitude !== 0
  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('Disalin') }
  const openMaps = () => { if (hasCoord) window.open(`https://www.google.com/maps?q=${point.latitude},${point.longitude}`, '_blank') }

  return (
    <div className="w-80 bg-white border-l border-slate-200 h-full flex flex-col shadow-xl">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-800">Detail Data</h3>
        <div className="flex items-center gap-1">
          {hasCoord && (
            <button onClick={openMaps} className="w-7 h-7 rounded hover:bg-blue-50 flex items-center justify-center" title="Google Maps">
              <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
            </button>
          )}
          <button onClick={onClose} className="w-7 h-7 rounded hover:bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {hasCoord && (
        <div className="p-4 bg-emerald-50 border-b border-emerald-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-emerald-500 uppercase tracking-wide font-medium">Koordinat</span>
            <button onClick={() => copy(`${point.latitude}, ${point.longitude}`)} className="text-emerald-500 hover:text-emerald-700">
              <Copy className="w-3 h-3" />
            </button>
          </div>
          <div className="text-sm font-mono font-semibold text-emerald-800">{point.latitude}, {point.longitude}</div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-2.5">
          {columns.length === 0 ? (
            <p className="text-xs text-slate-400">Tidak ada metadata</p>
          ) : (
            columns.map(col => {
              const val = meta[col]
              if (val === undefined || val === null || val === '') return null
              return (
                <div key={col} className="group">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">{col}</div>
                  <div className="text-sm text-slate-700 mt-0.5 flex items-start gap-1">
                    <span className="flex-1 break-all">{String(val)}</span>
                    <button onClick={() => copy(String(val))} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-500 shrink-0 mt-0.5">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}