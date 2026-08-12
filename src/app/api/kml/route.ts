import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const hasCoord = searchParams.get('hasCoord') || ''
  const format = searchParams.get('format') || 'csv'
  const limit = parseInt(searchParams.get('limit') || '50000')

  // Parse column filters
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
    if (!active) return NextResponse.json({ error: 'Tidak ada dataset aktif' }, { status: 404 })

    // Build raw SQL
    const conditions: string[] = []
    const sqlParams: any[] = []
    let idx = 1
    const nextParam = (val: any) => { sqlParams.push(val); return `$${idx++}` }

    conditions.push(`"datasetId" = ${nextParam(active.id)}`)
    if (hasCoord === 'true') { conditions.push(`"latitude" != 0`); conditions.push(`"longitude" != 0`) }
    else if (hasCoord === 'false') { conditions.push(`("latitude" = 0 OR "longitude" = 0)`) }
    if (search) conditions.push(`metadata::text ILIKE ${nextParam(`%${search}%`)}`)
    for (const cf of columnFilters) {
      const escapedField = cf.field.replace(/'/g, "''")
      if (cf.values.length === 1) {
        conditions.push(`metadata->>'${escapedField}' ILIKE ${nextParam(`%${cf.values[0]}%`)}`)
      } else {
        const orParts = cf.values.map(v => `metadata->>'${escapedField}' ILIKE ${nextParam(`%${v}%`)}`)
        conditions.push(`(${orParts.join(' OR ')})`)
      }
    }
    const whereClause = conditions.join(' AND ')

    const rows = await db.$queryRawUnsafe<any[]>(
      `SELECT * FROM "DataPoint" WHERE ${whereClause} ORDER BY "createdAt" DESC LIMIT ${nextParam(limit)}`,
      ...sqlParams
    )

    // Get columns from dataset headers
    const headers: string[] = active.headers || []
    const coordCols = new Set<string>()
    if (active.latCol) coordCols.add(active.latCol)
    if (active.lngCol) coordCols.add(active.lngCol)
    if (active.coordCol) coordCols.add(active.coordCol)

    // Build export columns: metadata columns + Latitude + Longitude
    const exportCols = headers.filter((h: string) => !coordCols.has(h))
    const colNames = [...exportCols, 'Latitude', 'Longitude']

    // Build flat rows
    const flatRows: any[] = []
    for (const r of rows) {
      const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {})
      const row: any = {}
      for (const col of exportCols) {
        row[col] = meta[col] ?? ''
      }
      row['Latitude'] = r.latitude
      row['Longitude'] = r.longitude
      flatRows.push(row)
    }

    const safeName = active.name.replace(/[^a-zA-Z0-9\-_]/g, '_') || 'data'

    if (format === 'xlsx') {
      // Generate proper .xlsx using SheetJS
      const ws = XLSX.utils.json_to_sheet(flatRows, { header: colNames })

      // Auto-size column widths (estimate based on content)
      const colWidths = colNames.map(name => {
        let maxLen = name.length
        for (const row of flatRows) {
          const val = String(row[name] ?? '')
          if (val.length > maxLen) maxLen = val.length
        }
        return { wch: Math.min(maxLen + 2, 50) }
      })
      ws['!cols'] = colWidths

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Data')

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${safeName}.xlsx"`,
          'Cache-Control': 'no-cache',
        },
      })
    }

    // Default: CSV with UTF-8 BOM for Excel compatibility
    const csvRows: string[][] = []
    csvRows.push(colNames)
    for (const r of flatRows) {
      const row = colNames.map((col: string) => {
        const val = String(r[col] ?? '')
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`
        }
        return val
      })
      csvRows.push(row)
    }
    const csvContent = csvRows.map(r => r.join(',')).join('\n')
    const bom = '\uFEFF'

    return new NextResponse(bom + csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeName}.csv"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Gagal export data' }, { status: 500 })
  }
}
