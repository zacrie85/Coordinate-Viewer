import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const hasCoord = searchParams.get('hasCoord') || ''
  const customField = searchParams.get('customField') || ''
  const customValues = searchParams.get('customValues') || ''
  const limit = parseInt(searchParams.get('limit') || '25000')

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

    // Dynamic field filter on JSONB
    if (customField && customValues) {
      const vals = customValues.split(',').map(v => v.trim()).filter(Boolean)
      if (vals.length > 0) {
        ands.push({ OR: vals.map(v => ({ metadata: { path: [customField], string_contains: v } })) })
      }
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
