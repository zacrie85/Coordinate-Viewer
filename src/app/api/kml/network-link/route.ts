import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const host = searchParams.get('host') || 'localhost:3000'
  const protocol = searchParams.get('protocol') || 'https'
  const refresh = searchParams.get('refresh') || '5'

  try {
    // Forward all filter + marker config params to the KML endpoint
    const kmlParams = new URLSearchParams()
    const forwardKeys = ['search', 'hasCoord', 'nameCol1', 'nameCol2', 'capacityCol', 'activeCol', 'availCol', 'groupBy', 'labelCols']
    for (const key of forwardKeys) {
      const val = searchParams.get(key)
      if (val) kmlParams.set(key, val)
    }
    // Forward cf0-cf2 / cv0-cv2
    for (let i = 0; i < 3; i++) {
      const cf = searchParams.get(`cf${i}`)
      const cv = searchParams.get(`cv${i}`)
      if (cf) kmlParams.set(`cf${i}`, cf)
      if (cv) kmlParams.set(`cv${i}`, cv)
    }

    const qs = kmlParams.toString()
    const kmlUrl = `${protocol}://${host}/api/kml${qs ? '?' + qs : ''}`

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <NetworkLink>
    <name>Realtime Data</name>
    <description>Auto-refresh setiap ${refresh} menit</description>
    <Link>
      <href>${kmlUrl.replace(/&/g, '&amp;')}</href>
      <refreshMode>onInterval</refreshMode>
      <refreshInterval>${refresh}</refreshInterval>
    </Link>
  </NetworkLink>
</kml>`

    // UTF-8 BOM for Google Earth compatibility
    return new NextResponse('\uFEFF' + kml, {
      headers: {
        'Content-Type': 'application/vnd.google-earth.kml+xml; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('NetworkLink error:', error)
    return NextResponse.json({ error: 'Gagal generate NetworkLink' }, { status: 500 })
  }
}
