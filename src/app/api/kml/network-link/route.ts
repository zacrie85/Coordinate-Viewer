import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const host = searchParams.get('host') || ''
  const protocol = searchParams.get('protocol') || 'http'
  const refreshMinutes = parseInt(searchParams.get('refresh') || '5')

  // Forward SEMUA params kecuali host/protocol/refresh (bukan filter-only)
  const skipParams = new Set(['host', 'protocol', 'refresh'])
  const paramsParts: string[] = []
  for (const [key, value] of searchParams.entries()) {
    if (!skipParams.has(key) && value) {
      paramsParts.push(`${key}=${encodeURIComponent(value)}`)
    }
  }
  const filterStr = paramsParts.length > 0 ? '?' + paramsParts.join('&') : ''

  let kmlDataUrl: string
  if (host) {
    kmlDataUrl = `${protocol}://${host}/api/kml${filterStr}`
  } else {
    const reqHost = req.headers.get('host') || 'localhost:3000'
    const reqProto = req.headers.get('x-forwarded-proto') || 'http'
    kmlDataUrl = `${reqProto}://${reqHost}/api/kml${filterStr}`
  }

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <NetworkLink>
    <name>ODP Map Viewer - Real-time</name>
    <description>Data realtime. Auto-refresh setiap ${refreshMinutes} menit.</description>
    <refreshVisibility>0</refreshVisibility>
    <flyToView>0</flyToView>
    <Link>
      <href>${kmlDataUrl}</href>
      <refreshMode>onInterval</refreshMode>
      <refreshInterval>${refreshMinutes * 60}</refreshInterval>
      <viewRefreshMode>never</viewRefreshMode>
    </Link>
  </NetworkLink>
</kml>`

  return new NextResponse(kml, {
    headers: {
      'Content-Type': 'application/vnd.google-earth.kml+xml',
      'Content-Disposition': 'attachment; filename="odp-realtime.kml"',
    },
  })
}