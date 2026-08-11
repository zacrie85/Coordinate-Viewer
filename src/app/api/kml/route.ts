import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

function escapeXml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function calcPct(meta: Record<string, any>, activeCol: string, capacityCol: string): { pct: number; activeRaw: string; capRaw: string } {
  if (activeCol && capacityCol) {
    const aRaw = String(meta[activeCol] ?? '').trim()
    const cRaw = String(meta[capacityCol] ?? '').trim()
    const aNum = parseFloat(aRaw.replace(/,/g, ''))
    const cNum = parseFloat(cRaw.replace(/,/g, ''))
    if (!isNaN(aNum) && !isNaN(cNum) && cNum > 0) {
      return { pct: (aNum / cNum) * 100, activeRaw: aRaw, capRaw: cRaw }
    }
  }
  if (capacityCol) {
    const raw = String(meta[capacityCol] ?? '').trim()
    const m = raw.match(/^(\d+)\s*[\/\-]\s*(\d+)$/)
    if (m) { const a = parseInt(m[1]), c = parseInt(m[2]); if (c > 0) return { pct: (a / c) * 100, activeRaw: m[1], capRaw: m[2] } }
    const p = raw.match(/^(\d+(?:\.\d+)?)\s*%?$/)
    if (p) return { pct: parseFloat(p[1]), activeRaw: raw, capRaw: '' }
  }
  return { pct: -1, activeRaw: '', capRaw: '' }
}

function getPctColor(pct: number): string {
  if (pct < 0) return '#94a3b8'
  if (pct <= 25) return '#22c55e'
  if (pct <= 50) return '#3b82f6'
  if (pct <= 75) return '#eab308'
  return '#ef4444'
}

function buildPlacemark(p: any, mc: { nameCol1: string; nameCol2: string; capacityCol: string; activeCol: string; availCol: string }, i: number, meta: Record<string, any>): string {
  const { pct, activeRaw, capRaw } = calcPct(meta, mc.activeCol, mc.capacityCol)
  const pctRound = pct >= 0 ? Math.round(pct) : -1
  const color = getPctColor(pct)

  const name = mc.nameCol1 && meta[mc.nameCol1]
    ? [meta[mc.nameCol1], mc.nameCol2 ? meta[mc.nameCol2] : ''].filter(Boolean).join(' - ')
    : meta['name'] || meta['Name'] || meta['NAMA'] || meta['nama'] || meta['KODE'] || meta['kode'] || `Point ${i + 1}`

  const skipCols = new Set([mc.nameCol1, mc.nameCol2, mc.capacityCol, mc.activeCol, mc.availCol].filter(Boolean))

  let infoRows = ''
  if (pct >= 0) {
    infoRows += '<tr><td style="padding:5px 12px 5px 0;color:#94a3b8;font-size:12px;white-space:nowrap;vertical-align:top;">' + escapeXml(mc.activeCol || 'Active') + '</td><td style="padding:5px 0;color:#1e293b;font-size:13px;font-weight:600;">' + escapeXml(activeRaw) + '</td></tr>'
    infoRows += '<tr><td style="padding:5px 12px 5px 0;color:#94a3b8;font-size:12px;white-space:nowrap;vertical-align:top;">' + escapeXml(mc.capacityCol || 'Capacity') + '</td><td style="padding:5px 0;color:#1e293b;font-size:13px;font-weight:600;">' + escapeXml(capRaw) + '</td></tr>'
  }
  if (mc.availCol && meta[mc.availCol] && mc.availCol !== mc.activeCol) {
    infoRows += '<tr><td style="padding:5px 12px 5px 0;color:#94a3b8;font-size:12px;white-space:nowrap;vertical-align:top;">' + escapeXml(mc.availCol) + '</td><td style="padding:5px 0;color:#1e293b;font-size:13px;font-weight:600;">' + escapeXml(String(meta[mc.availCol])) + '</td></tr>'
  }
  for (const [k, v] of Object.entries(meta)) {
    if (skipCols.has(k) || !v || v === '') continue
    infoRows += '<tr><td style="padding:5px 12px 5px 0;color:#94a3b8;font-size:12px;white-space:nowrap;vertical-align:top;">' + escapeXml(k) + '</td><td style="padding:5px 0;color:#475569;font-size:12px;">' + escapeXml(String(v)) + '</td></tr>'
  }

  let statsHtml = ''
  if (pct >= 0) {
    statsHtml = '<div style="background:rgba(241,245,249,0.85);border-radius:10px;padding:12px 16px;margin:0 0 14px 0;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      + '<span style="color:#64748b;font-size:13px;">Active / Capacity</span>'
      + '<span style="font-size:20px;font-weight:700;color:' + color + ';">' + pctRound + '%</span>'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-bottom:6px;">'
      + '<span>Active: ' + escapeXml(activeRaw) + '</span><span>Capacity: ' + escapeXml(capRaw) + '</span>'
      + '</div>'
      + '<div style="background:#e2e8f0;border-radius:6px;height:10px;overflow:hidden;">'
      + '<div style="background:' + color + ';height:100%;width:' + Math.min(pctRound, 100) + '%;border-radius:6px;"></div>'
      + '</div></div>'
  }

  const desc = '<div style="font-family:Segoe UI,Arial,sans-serif;background:rgba(255,255,255,0.92);padding:18px 20px;border-radius:14px;min-width:280px;max-width:400px;">'
    + '<div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:2px;line-height:1.4;">' + escapeXml(String(name)) + '</div>'
    + '<div style="height:10px;"></div>'
    + statsHtml
    + '<table style="width:100%;border-collapse:collapse;">' + infoRows + '</table>'
    + '</div>'

  const styleUrl = pct >= 0 ? '#s-' + (pct <= 25 ? 'g' : pct <= 50 ? 'b' : pct <= 75 ? 'y' : 'r') : '#s-default'

  return '      <Placemark>\n'
    + '        <name>' + escapeXml(String(name)) + '</name>\n'
    + '        <description><![CDATA[' + desc + ']]></description>\n'
    + '        <styleUrl>' + styleUrl + '</styleUrl>\n'
    + '        <Point><coordinates>' + p.longitude + ',' + p.latitude + ',0</coordinates></Point>\n'
    + '      </Placemark>'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const hasCoord = searchParams.get('hasCoord') || ''
  const nameCol1 = searchParams.get('nameCol1') || ''
  const nameCol2 = searchParams.get('nameCol2') || ''
  const capacityCol = searchParams.get('capacityCol') || ''
  const activeCol = searchParams.get('activeCol') || ''
  const availCol = searchParams.get('availCol') || ''
  const groupBy = searchParams.get('groupBy') || ''
  const mc = { nameCol1, nameCol2, capacityCol, activeCol, availCol }

  const columnFilters: { field: string; values: string[] }[] = []
  for (let i = 0; i < 3; i++) {
    const field = searchParams.get(`cf${i}`) || ''
    const vals = searchParams.get(`cv${i}`) || ''
    if (field && vals) {
      const parsed = vals.split(',').map(v => v.trim()).filter(Boolean)
      if (parsed.length > 0) columnFilters.push({ field, values: parsed })
    }
  }

  try {
    const active = await db.dataset.findFirst({ where: { isActive: true } })
    if (!active) {
      return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Belum Ada Data</name><description>Upload file Excel terlebih dahulu.</description></Document></kml>`,
        { headers: { 'Content-Type': 'application/vnd.google-earth.kml+xml', 'Cache-Control': 'no-cache' } })
    }

    const where: Prisma.DataPointWhereInput = { datasetId: active.id, latitude: { not: 0 }, longitude: { not: 0 } }
    const ands: Prisma.DataPointWhereInput[] = []
    if (hasCoord === 'true') { ands.push({ latitude: { not: 0 } }); ands.push({ longitude: { not: 0 } }) }
    else if (hasCoord === 'false') { ands.push({ OR: [{ latitude: 0 }, { longitude: 0 }] }) }
    if (search) ands.push({ metadata: { path: [], string_contains: search } })
    for (const cf of columnFilters) ands.push({ OR: cf.values.map(v => ({ metadata: { path: [cf.field], string_contains: v } })) })
    if (ands.length > 0) where.AND = ands

    const points = await db.dataPoint.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50000 })

    const BASE_ICON = 'http://maps.google.com/mapfiles/kml/paddle/wht-circle.png'
    const styles = '<Style id="s-default"><IconStyle><color>ffa0a0a0</color><scale>0.7</scale><Icon><href>' + BASE_ICON + '</href></Icon><hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle></Style>'
      + '<Style id="s-g"><IconStyle><color>ff5ec522</color><scale>0.7</scale><Icon><href>' + BASE_ICON + '</href></Icon><hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle></Style>'
      + '<Style id="s-b"><IconStyle><color>fff6823b</color><scale>0.7</scale><Icon><href>' + BASE_ICON + '</href></Icon><hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle></Style>'
      + '<Style id="s-y"><IconStyle><color>ff08b3ea</color><scale>0.7</scale><Icon><href>' + BASE_ICON + '</href></Icon><hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle></Style>'
      + '<Style id="s-r"><IconStyle><color>ff4444ef</color><scale>0.7</scale><Icon><href>' + BASE_ICON + '</href></Icon><hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle></Style>'

    const groupFields = groupBy ? groupBy.split(',').map(v => v.trim()).filter(Boolean) : []

    function buildPctFolders(pts: any[], indent: string): string {
      const buckets: Record<string, any[]> = { '0-25%': [], '26-50%': [], '51-75%': [], '76-100%': [] }
      for (const p of pts) {
        const m = (p.metadata as Record<string, any>) || {}
        const { pct } = calcPct(m, mc.activeCol, mc.capacityCol)
        if (pct < 0 || pct <= 25) buckets['0-25%'].push(p)
        else if (pct <= 50) buckets['26-50%'].push(p)
        else if (pct <= 75) buckets['51-75%'].push(p)
        else buckets['76-100%'].push(p)
      }
      let xml = ''
      for (const [label, items] of Object.entries(buckets)) {
        if (items.length === 0) continue
        const marks = items.map((p, i) => buildPlacemark(p, mc, i, (p.metadata as Record<string, any>) || {})).join('\n')
        xml += `${indent}<Folder><name>${label} (${items.length})</name>\n${marks}\n${indent}</Folder>\n`
      }
      return xml
    }

    function buildGroupFolders(pts: any[], fields: string[], indent: string): string {
      if (fields.length === 0) return buildPctFolders(pts, indent)
      const field = fields[0]
      const remaining = fields.slice(1)
      const groups = new Map<string, any[]>()
      for (const p of pts) {
        const m = (p.metadata as Record<string, any>) || {}
        const key = String(m[field] || '(kosong)')
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(p)
      }
      let xml = ''
      for (const [groupName, groupPoints] of groups) {
        xml += `${indent}<Folder><name>${escapeXml(groupName)} (${groupPoints.length})</name>\n`
        xml += buildGroupFolders(groupPoints, remaining, indent + '  ')
        xml += `${indent}</Folder>\n`
      }
      return xml
    }

    let foldersXml = ''
    if (groupFields.length > 0 && points.length > 0) {
      foldersXml = buildGroupFolders(points, groupFields, '    ')
    } else {
      foldersXml = buildPctFolders(points, '    ')
    }

    const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>${escapeXml(active.name)}</name>\n    <description>${escapeXml(active.name)} - ${points.length} titik</description>\n${styles}\n${foldersXml}  </Document>\n</kml>`

    return new NextResponse(kml, {
      headers: { 'Content-Type': 'application/vnd.google-earth.kml+xml', 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    })
  } catch (error) {
    console.error('KML error:', error)
    return NextResponse.json({ error: 'Gagal generate KML' }, { status: 500 })
  }
}