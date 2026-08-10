import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

function escapeXml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const hasCoord = searchParams.get('hasCoord') || ''
  const customField = searchParams.get('customField') || ''
  const customValues = searchParams.get('customValues') || ''

  try {
    const active = await db.dataset.findFirst({ where: { isActive: true } })
    if (!active) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Belum Ada Data</name><description>Upload file Excel terlebih dahulu.</description></Document></kml>`,
        { headers: { 'Content-Type': 'application/vnd.google-earth.kml+xml', 'Cache-Control': 'no-cache' } }
      )
    }

    const where: Prisma.DataPointWhereInput = { datasetId: active.id, latitude: { not: 0 }, longitude: { not: 0 } }
    const ands: Prisma.DataPointWhereInput[] = []

    if (hasCoord === 'true') {
      ands.push({ latitude: { not: 0 } })
      ands.push({ longitude: { not: 0 } })
    } else if (hasCoord === 'false') {
      ands.push({ OR: [{ latitude: 0 }, { longitude: 0 }] })
    }

    if (search) {
      ands.push({ metadata: { path: [], string_contains: search } })
    }

    if (customField && customValues) {
      const vals = customValues.split(',').map(v => v.trim()).filter(Boolean)
      if (vals.length > 0) {
        ands.push({ OR: vals.map(v => ({ metadata: { path: [customField], string_contains: v } })) })
      }
    }

    if (ands.length > 0) where.AND = ands

    const points = await db.dataPoint.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50000,
    })

    const placemarks = points.map((p, i) => {
      const meta = (p.metadata as Record<string, any>) || {}
      const descriptionParts = Object.entries(meta)
        .filter(([, v]) => v !== '' && v !== null && v !== undefined)
        .map(([k, v]) => `<b>${escapeXml(k)}:</b> ${escapeXml(String(v))}`)
        .join('<br/>')

      const name = meta['name'] || meta['Name'] || meta['NAMA'] || meta['nama'] || meta['KODE'] || meta['kode'] || meta['Code'] || meta['code'] || meta['ID'] || meta['id'] || `Point ${i + 1}`

      return `    <Placemark>
      <name>${escapeXml(String(name))}</name>
      <description><![CDATA[${descriptionParts}]]></description>
      <Point><coordinates>${p.longitude},${p.latitude},0</coordinates></Point>
    </Placemark>`
    }).join('\n')

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(active.name)}</name>
    <description>${escapeXml(active.name)} - ${points.length} titik</description>
    <Style id="icon">
      <IconStyle>
        <Icon><href>http://maps.google.com/mapfiles/kml/pushpin/blue-pushpin.png</href></Icon>
        <hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/>
      </IconStyle>
    </Style>
    <Folder>
      <name>${escapeXml(active.name)}</name>
 ${placemarks}
    </Folder>
  </Document>
</kml>`

    return new NextResponse(kml, {
      headers: {
        'Content-Type': 'application/vnd.google-earth.kml+xml',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('KML error:', error)
    return NextResponse.json({ error: 'Gagal generate KML' }, { status: 500 })
  }
}