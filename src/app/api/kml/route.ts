import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

function escapeXml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function parseCapacity(val: any): number {
  if (!val) return -1
  const s = String(val).trim()
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (m) { const t = parseInt(m[2]); return t > 0 ? (parseInt(m[1]) / t) * 100 : 0 }
  const p = s.match(/^(\d+(?:\.\d+)?)\s*%?$/)
  if (p) return parseFloat(p[1])
  return -1
}

// KML AABBGGRR colors
const KML_COLORS: Record<string, string> = {
  green: 'ff5ec522', blue: 'fff6823b', yellow: 'ff08b3ea', red: 'ff4444ef', default: 'ff5ec522',
}
function getKmlColor(pct: number): string {
  if (pct < 0) return KML_COLORS.default
  if (pct <= 25) return KML_COLORS.green
  if (pct <= 50) return KML_COLORS.blue
  if (pct <= 75) return KML_COLORS.yellow
  return KML_COLORS.red
}

function getKmlIcon(pct: number): string {
  if (pct < 0) return 'http://maps.google.com/mapfiles/kml/pushpin/blue-pushpin.png'
  if (pct <= 25) return 'http://maps.google.com/mapfiles/kml/pushpin/pushpin-green.png'
  if (pct <= 50) return 'http://maps.google.com/mapfiles/kml/pushpin/blue-pushpin.png'
  if (pct <= 75) return 'http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png'
  return 'http://maps.google.com/mapfiles/kml/pushpin/red-pushpin.png'
}

function buildPlacemark(p: any, mc: { nameCol1: string; nameCol2: string; capacityCol: string; activeCol: string; availCol: string }, i: number, meta: Record<string, any>): string {
  const descParts: string[] = []
  // Status & Avail
  if (mc.activeCol && meta[mc.activeCol]) descParts.push(`<b>Status:</b> ${escapeXml(String(meta[mc.activeCol]))}`)
  if (mc.availCol && meta[mc.availCol]) descParts.push(`<b>Avail:</b> ${escapeXml(String(meta[mc.availCol]))}`)
  // Capacity
  const capPct = mc.capacityCol ? parseCapacity(meta[mc.capacityCol]) : -1
  if (capPct >= 0) descParts.push(`<b>Kapasitas:</b> ${escapeXml(String(meta[mc.capacityCol] || ''))} (${Math.round(capPct)}%)`)
  // Other fields
  const skipCols = new Set([mc.nameCol1, mc.nameCol2, mc.capacityCol, mc.activeCol, mc.availCol].filter(Boolean))
  for (const [k, v] of Object.entries(meta)) {
    if (skipCols.has(k) || !v || v === '') continue
    descParts.push(`<b>${escapeXml(k)}:</b> ${escapeXml(String(v))}`)
  }
  const name = mc.nameCol1 && meta[mc.nameCol1]
    ? [meta[mc.nameCol1], mc.nameCol2 ? meta[mc.nameCol2] : ''].filter(Boolean).join(' - ')
    : meta['name'] || meta['Name'] || meta['NAMA'] || meta['nama'] || meta['KODE'] || meta['kode'] || `Point ${i + 1}`
  const styleUrl = capPct >= 0 ? `#s-${capPct <= 25 ? 'g' : capPct <= 50 ? 'b' : capPct <= 75 ? 'y' : 'r'}` : '#s-default'
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

  // Parse 3 column filter slots
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

    // Build styles
    const styles = `
    <Style id="s-default"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/pushpin/blue-pushpin.png</href></Icon><hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle></Style>
    <Style id="s-g"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/pushpin/pushpin-green.png</href></Icon><hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle></Style>
    <Style id="s-b"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/pushpin/blue-pushpin.png</href></Icon><hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle></Style>
    <Style id="s-y"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href></Icon><hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle></Style>
    <Style id="s-r"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/pushpin/red-pushpin.png</href></Icon><hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle></Style>`

    // Group by column if specified
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
      const marks = points.map((p, i) => buildPlacemark(p, mc, i, (p.metadata as Record<string, any>) || {})).join('\n')
      foldersXml = `    <Folder><name>${escapeXml(active.name)}</name>\n${marks}\n    </Folder>\n`
    }

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(active.name)}</name>
    <description>${escapeXml(active.name)} - ${points.length} titik</description>
${styles}
${foldersXml}
  </Document>
</kml>`

    return new NextResponse(kml, {
      headers: { 'Content-Type': 'application/vnd.google-earth.kml+xml', 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    })
  } catch (error) {
    console.error('KML error:', error)
    return NextResponse.json({ error: 'Gagal generate KML' }, { status: 500 })
  }
}
