import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const host = searchParams.get('host') || 'localhost:3000'
  const protocol = searchParams.get('protocol') || 'https'
  const refresh = searchParams.get('refresh') || '5'
  const search = searchParams.get('search') || ''
  const hasCoord = searchParams.get('hasCoord') || ''
  const customField = searchParams.get('customField') || ''
  const customValues = searchParams.get('customValues') || ''

  try {
    const kmlParams = new URLSearchParams()
    if (search) kmlParams.set('search', search)
    if (hasCoord) kmlParams.set('hasCoord', hasCoord)
    if (customField) kmlParams.set('customField', customField)
    if (customValues) kmlParams.set('customValues', customValues)

    const qs = kmlParams.toString()
    const kmlUrl = `${protocol}://${host}/api/kml${qs ? '?' + qs : ''}`

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <NetworkLink>
    <name>Realtime Data</name>
    <description>Auto-refresh setiap ${refresh} menit</description>
    <Link>
      <href>${kmlUrl}</href>
      <refreshMode>onInterval</refreshMode>
      <refreshInterval>${refresh}</refreshInterval>
    </Link>
  </NetworkLink>
</kml>`

    return new NextResponse(kml, {
      headers: {
        'Content-Type': 'application/vnd.google-earth.kml+xml',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('NetworkLink error:', error)
    return NextResponse.json({ error: 'Gagal generate NetworkLink' }, { status: 500 })
  }
}