import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const hasCoord = searchParams.get('hasCoord') || ''
  const limit = parseInt(searchParams.get('limit') || '25000')

  // Parse 3 column filter slots: cf0/cv0, cf1/cv1, cf2/cv2
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
    if (!active) return NextResponse.json({ data: [], pagination: { total: 0, limit } })

    const where: Prisma.DataPointWhereInput = { datasetId: active.id }
    const ands: Prisma.DataPointWhereInput[] = []

    // Coordinate filter
    if (hasCoord === 'true') {
      ands.push({ latitude: { not: 0 } })
      ands.push({ longitude: { not: 0 } })
    } else if (hasCoord === 'false') {
      ands.push({ OR: [{ latitude: 0 }, { longitude: 0 }] })
    }

    // Search in all metadata
    if (search) {
      ands.push({ metadata: { path: [], string_contains: search } })
    }

    // Multi-column field filters
    for (const cf of columnFilters) {
      ands.push({
        OR: cf.values.map(v => ({ metadata: { path: [cf.field], string_contains: v } }))
      })
    }

    if (ands.length > 0) where.AND = ands

    const [points, total] = await Promise.all([
      db.dataPoint.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      db.dataPoint.count({ where }),
    ])

    return NextResponse.json({ data: points, pagination: { total, limit } })
  } catch (error) {
    console.error('Data error:', error)
    return NextResponse.json({ error: 'Gagal mengambil data' }, { status: 500 })
  }
}
