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

function pctColor(pct: number): string {
  if (pct <= 25) return '#22c55e'
  if (pct <= 50) return '#3b82f6'
  if (pct <= 75) return '#eab308'
  return '#ef4444'
}

function buildPlacemark(p: any, mc: { nameCol1: string; nameCol2: string; capacityCol: string; activeCol: string; availCol: string; labelCols?: string[] }, i: number, meta: Record<string, any>): string {
  const { pct, activeRaw, capRaw } = calcPct(meta, mc.activeCol, mc.capacityCol)
  const color = pct >= 0 ? pctColor(pct) : '#64748b'
  const rows: string[] = []

  if (pct >= 0) {
    rows.push(`<tr><td class="l">${escapeXml(mc.activeCol || 'Active')}</td><td class="v" style="color:${color};font-weight:700;">${escapeXml(activeRaw)}</td></tr>`)
    rows.push(`<tr><td class="l">${escapeXml(mc.capacityCol || 'Capacity')}</td><td class="v">${escapeXml(capRaw)}</td></tr>`)
    rows.push(`<tr><td class="l">Persentase</td><td class="v" style="color:${color};font-weight:700;">${Math.round(pct)}%</td></tr>`)
  }
  if (mc.availCol && meta[mc.availCol] && mc.availCol !== mc.activeCol) {
    rows.push(`<tr><td class="l">${escapeXml(mc.availCol)}</td><td class="v">${escapeXml(String(meta[mc.availCol]))}</td></tr>`)
  }
  const skipCols = new Set([mc.nameCol1, mc.nameCol2, mc.capacityCol, mc.activeCol, mc.availCol].filter(Boolean))
  for (const [k, v] of Object.entries(meta)) {
    if (skipCols.has(k) || !v || v === '') continue
    rows.push(`<tr><td class="l">${escapeXml(k)}</td><td class="v">${escapeXml(String(v))}</td></tr>`)
  }

  let name = ''
  if (mc.labelCols && mc.labelCols.length > 0) {
    name = mc.labelCols.map(c => String(meta[c] || '')).filter(Boolean).join(' - ')
  }
  if (!name) {
    name = mc.nameCol1 && meta[mc.nameCol1]
      ? [meta[mc.nameCol1], mc.nameCol2 ? meta[mc.nameCol2] : ''].filter(Boolean).join(' - ')
      : meta['name'] || meta['Name'] || meta['NAMA'] || meta['nama'] || meta['KODE'] || meta['kode'] || `Point ${i + 1}`
  }

  const barHtml = pct >= 0 ? `
          <div style="margin-top:10px;padding:8px 10px;background:rgba(255,255,255,0.25);border-radius:5px;border:1px solid rgba(255,255,255,0.4);">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;color:#e0e8f0;">
              <span>${escapeXml(mc.activeCol || 'Active')}: ${escapeXml(activeRaw)} / ${escapeXml(capRaw)}</span>
              <span style="font-weight:700;color:#ffffff;">${Math.round(pct)}%</span>
            </div>
            <div style="background:rgba(0,0,0,0.3);border-radius:4px;height:6px;overflow:hidden;border:1px solid rgba(255,255,255,0.15);">
              <div style="background:linear-gradient(to bottom,${color},${color});height:100%;width:${Math.min(pct, 100)}%;border-radius:3px;"></div>
            </div>
          </div>` : ''

  const styleUrl = pct >= 0 ? `#s-${pct <= 25 ? 'g' : pct <= 50 ? 'b' : pct <= 75 ? 'y' : 'r'}` : '#s-default'
  return `      <Placemark>
        <name>${escapeXml(String(name))}</name>
        <description><![CDATA[<div style="font-family:Segoe UI,Arial,Helvetica,sans-serif;font-size:14px;color:#ffffff;min-width:340px;line-height:1.5;overflow:hidden;">
  <div style="background:linear-gradient(180deg,rgba(80,120,180,0.78) 0%,rgba(40,65,110,0.82) 40%,rgba(20,40,80,0.88) 100%);border:1px solid rgba(160,200,255,0.45);border-radius:8px;padding:0;margin:0;-webkit-box-shadow:0 4px 20px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.25);box-shadow:0 4px 20px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.25);">
    <div style="height:4px;background:linear-gradient(90deg,${color},${color});border-radius:8px 8px 0 0;opacity:0.9;"></div>
    <div style="position:relative;">
      <div style="position:absolute;top:0;left:0;right:0;height:50%;background:linear-gradient(180deg,rgba(255,255,255,0.18) 0%,rgba(255,255,255,0.04) 100%);pointer-events:none;border-radius:0 0 8px 8px;"></div>
      <div style="padding:14px 16px;position:relative;">
        <div style="font-size:16px;font-weight:700;color:#ffffff;text-shadow:0 1px 4px rgba(0,0,0,0.4);margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.15);letter-spacing:0.3px;">${escapeXml(String(name))}</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <style>td.l{color:rgba(200,220,255,0.8);padding:4px 10px 4px 0;white-space:nowrap;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;width:40%;}td.v{color:#ffffff;padding:4px 0;font-weight:500;text-shadow:0 1px 2px rgba(0,0,0,0.3);}tr+tr td{border-top:1px solid rgba(255,255,255,0.06);}</style>
          ${rows.join('\n          ')}
        </table>${barHtml}
      </div>
    </div>
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent);"></div>
  </div>
</div>]]></description>
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

  const areaIds = idsRaw ? new Set(idsRaw.split(',').map(s => s.trim()).filter(Boolean)) : null

  try {
    const active = await db.dataset.findFirst({ where: { isActive: true } })
    if (!active) {
      return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Belum Ada Data</name><description>Upload file Excel terlebih dahulu.</description></Document></kml>`,
        { headers: { 'Content-Type': 'application/vnd.google-earth.kml+xml', 'Cache-Control': 'no-cache' } })
    }

    const where: Prisma.DataPointWhereInput = { datasetId: active.id, latitude: { not: 0 }, longitude: { not: 0 } }
    const ands: Prisma.DataPointWhereInput[] = []

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
    <Style id="s-default"><IconStyle><scale>1.5</scale></IconStyle><LabelStyle><scale>0.90</scale><color>ff000000</color></LabelStyle><BalloonStyle><bgColor>00000000</bgColor></BalloonStyle></Style>
    <Style id="s-g"><IconStyle><color>ff00ff00</color><scale>1.5</scale></IconStyle><LabelStyle><scale>0.90</scale><color>ffFFA500</color></LabelStyle><BalloonStyle><bgColor>00000000</bgColor></BalloonStyle></Style>
    <Style id="s-b"><IconStyle><color>ffff0000</color><scale>1.5</scale></IconStyle><LabelStyle><scale>0.90</scale><color>ffFFA500</color></LabelStyle><BalloonStyle><bgColor>00000000</bgColor></BalloonStyle></Style>
    <Style id="s-y"><IconStyle><color>ff00ffff</color><scale>1.5</scale></IconStyle><LabelStyle><scale>0.90</scale><color>ffFFA500</color></LabelStyle><BalloonStyle><bgColor>00000000</bgColor></BalloonStyle></Style>
    <Style id="s-r"><IconStyle><color>ff0000ff</color><scale>1.5</scale></IconStyle><LabelStyle><scale>0.90</scale><color>ffFFA500</color></LabelStyle><BalloonStyle><bgColor>00000000</bgColor></BalloonStyle></Style>`

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