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

function buildPlacemark(p: any, mc: { nameCol1: string; nameCol2: string; capacityCol: string; activeCol: string; availCol: string; labelCols?: string[] }, i: number, meta: Record<string, any>): string {
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

  // Label: prioritaskan labelCols > nameCol1/nameCol2 > fallback
  let name = ''
  if (mc.labelCols && mc.labelCols.length > 0) {
    name = mc.labelCols.map(c => String(meta[c] || '')).filter(Boolean).join(' - ')
  }
  if (!name) {
    name = mc.nameCol1 && meta[mc.nameCol1]
      ? [meta[mc.nameCol1], mc.nameCol2 ? meta[mc.nameCol2] : ''].filter(Boolean).join(' - ')
      : meta['name'] || meta['Name'] || meta['NAMA'] || meta['nama'] || meta['KODE'] || meta['kode'] || `Point ${i + 1}`
  }

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
  const labelColsRaw = searchParams.get('labelCols') || ''
  const labelCols = labelColsRaw ? labelColsRaw.split(',').map(s => s.trim()).filter(Boolean) : []
  const idsRaw = searchParams.get('ids') || ''
  const mc = { nameCol1, nameCol2, capacityCol, activeCol, availCol, labelCols }

  const columnFilters: { field: string; values: string[] }[] = []
  for (let i = 0; i < 3; i++) {
    const field = searchParams.get(`cf${i}`) || ''
    const vals = searchParams.get(`cv${i}`) || ''
    if (field && vals) {
      const parsed = vals.split(',').map(v => v.trim()).filter(Boolean)
      if (parsed.length > 0) columnFilters.push({ field, values: parsed })
    }
  }

  // Parse area selection IDs
  const areaIds = idsRaw ? new Set(idsRaw.split(',').map(s => s.trim()).filter(Boolean)) : null

  try {
    const active = await db.dataset.findFirst({ where: { isActive: true } })
    if (!active) {
      return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Belum Ada Data</name><description>Upload file Excel terlebih dahulu.</description></Document></kml>`,
        { headers: { 'Content-Type': 'application/vnd.google-earth.kml+xml', 'Cache-Control': 'no-cache' } })
    }

    const where: Prisma.DataPointWhereInput = { datasetId: active.id, latitude: { not: 0 }, longitude: { not: 0 } }
    const ands: Prisma.DataPointWhereInput[] = []

    // ── AREA SELECTION: filter by IDs ──
    if (areaIds && areaIds.size > 0) {
      ands.push({ id: { in: Array.from(areaIds) } })
    }

    if (hasCoord === 'true') { ands.push({ latitude: { not: 0 } }); ands.push({ longitude: { not: 0 } }) }
    else if (hasCoord === 'false') { ands.push({ OR: [{ latitude: 0 }, { longitude: 0 }] }) }
    if (search) ands.push({ metadata: { path: [], string_contains: search } })
    for (const cf of columnFilters) ands.push({ OR: cf.values.map(v => ({ metadata: { path: [cf.field], string_contains: v } })) })
    if (ands.length > 0) where.AND = ands

    const points = await db.dataPoint.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50000 })

    const styles = `
    <Style id="s-default"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/pushpin/blue-pushpin.png</href></Icon><hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle></Style>
    <Style id="s-g"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/pushpin/pushpin-green.png</href></Icon><hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle></Style>
    <Style id="s-b"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/pushpin/blue-pushpin.png</href></Icon><hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle></Style>
    <Style id="s-y"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href></Icon><hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle></Style>
    <Style id="s-r"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/pushpin/red-pushpin.png</href></Icon><hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle></Style>`

    let foldersXml = ''
    if (groupBy && points.length > 0) {
      const groups = new Map<string, any[]>()
      for (const p of points) {
        const m = (p.metadata as Record<string, any>) || {}
        const key = String(m[groupBy] || '(kosong)')
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(p)
      }
      for (const [groupName, groupPoints] of groups) {
        const marks = groupPoints.map((p, i) => buildPlacemark(p, mc, i, (p.metadata as Record<string, any>) || {})).join('\n')
        foldersXml += `    <Folder><name>${escapeXml(`${groupBy}: ${groupName}`)}</name><description>${groupPoints.length} titik</description>\n${marks}\n    </Folder>\n`
      }
    } else {
      const folderName = areaIds ? `${active.name} (Area Selection - ${points.length} titik)` : active.name
      const marks = points.map((p, i) => buildPlacemark(p, mc, i, (p.metadata as Record<string, any>) || {})).join('\n')
      foldersXml = `    <Folder><name>${escapeXml(folderName)}</name>\n${marks}\n    </Folder>\n`
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
