import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

function escapeXml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// ── Hitung persentase: Active / Capacity × 100 ──
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

function buildPlacemark(p: any, mc: { nameCol1: string; nameCol2: string; capacityCol: string; activeCol: string; availCol: string }, i: number, meta: Record<string, any>): string {
  const descParts: string[] = []
  const { pct, activeRaw, capRaw } = calcPct(meta, mc.activeCol, mc.capacityCol)
  if (pct >= 0) {
    descParts.push(`<b>${escapeXml(mc.activeCol || 'Active')}:</b> ${escapeXml(activeRaw)}`)
    descParts.push(`<b>${escapeXml(mc.capacityCol || 'Capacity')}:</b> ${escapeXml(capRaw)}`)
    descParts.push(`<b>Persentase:</b> ${Math.round(pct)}%`)
  }
  if (mc.availCol && meta[mc.availCol] && mc.availCol !== mc.activeCol) descParts.push(`<b>${escapeXml(mc.availCol)}:</b> ${escapeXml(String(meta[mc.availCol]))}`)
  const skipCols = new Set([mc.nameCol1, mc.nameCol2, mc.capacityCol, mc.activeCol, mc.availCol].filter(Boolean))
  for (const [k, v] of Object.entries(meta)) {
    if (skipCols.has(k) || !v || v === '') continue
    descParts.push(`<b>${escapeXml(k)}:</b> ${escapeXml(String(v))}`)
  }
  const name = mc.nameCol1 && meta[mc.nameCol1]
    ? [meta[mc.nameCol1], mc.nameCol2 ? meta[mc.nameCol2] : ''].filter(Boolean).join(' - ')
    : meta['name'] || meta['Name'] || meta['NAMA'] || meta['nama'] || meta['KODE'] || meta['kode'] || `Point ${i + 1}`
  const styleUrl = pct >= 0 ? `#s-${pct <= 25 ? 'g' : pct <= 50 ? 'b' : pct <= 75 ? 'y' : 'r'}` : '#s-default'
  return `      <Placemark>
        <name>${escapeXml(String(name))}</name>
        <description><![CDATA[${descParts.join('<br/>')}]]></description>
        <styleUrl>${styleUrl}</styleUrl>
        <Point><coordinates>${p.longitude},${p.latitude},0</coordinates></Point>
      </Placemark>`
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

    const styles = `
    <Style id="s-default"><IconStyle><color>ffa0a0a0</color><scale>0.7</scale><Icon><href>${BASE_ICON}</href></Icon><hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle><LabelStyle><scale>0</scale></LabelStyle></Style>
    <Style id="s-g"><IconStyle><color>ff5ec522</color><scale>0.7</scale><Icon><href>${BASE_ICON}</href></Icon><hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle><LabelStyle><scale>0</scale></LabelStyle></Style>
    <Style id="s-b"><IconStyle><color>fff6823b</color><scale>0.7</scale><Icon><href>${BASE_ICON}</href></Icon><hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle><LabelStyle><scale>0</scale></LabelStyle></Style>
    <Style id="s-y"><IconStyle><color>ff08b3ea</color><scale>0.7</scale><Icon><href>${BASE_ICON}</href></Icon><hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle><LabelStyle><scale>0</scale></LabelStyle></Style>
    <Style id="s-r"><IconStyle><color>ff4444ef</color><scale>0.7</scale><Icon><href>${BASE_ICON}</href></Icon><hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle><LabelStyle><scale>0</scale></LabelStyle></Style>

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
