import { NextRequest, NextResponse } from 'next/server'
import { getBigQueryClient, BQ_DATASET, fetchBQTables, buildBQWhereClause } from '@/lib/bigquery'

export const dynamic = 'force-dynamic'

// GET /api/bigquery?action=tables
// GET /api/bigquery?action=filters&table=Leads_normalizados
// GET /api/bigquery?action=columns&table=Leads_normalizados
// GET /api/bigquery?action=leads&table=Leads_normalizados&bucket=A
// GET /api/bigquery?action=count&table=Leads_normalizados&bucket=A
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  try {
    // Return all tables in the dataset - no table param needed
    if (action === 'tables') {
      const tables = await fetchBQTables()
      return NextResponse.json({ tables })
    }

    const table = searchParams.get('table')
    if (!table) {
      return NextResponse.json({ error: 'table parameter required' }, { status: 400 })
    }

    // Validate table exists (prevent SQL injection via table name)
    const validTables = await fetchBQTables()
    if (!validTables.includes(table)) {
      return NextResponse.json({ error: `Invalid table. Available: ${validTables.join(', ')}` }, { status: 400 })
    }

    const bq = getBigQueryClient()
    const fullTable = `\`${BQ_DATASET}.${table}\``

    const filters = {
      buckets: searchParams.getAll('bucket'),
      lineas: searchParams.getAll('linea'),
    }

    if (action === 'filters') {
      const [bucketRows] = await bq.query({
        query: `SELECT DISTINCT Bucket FROM ${fullTable} WHERE Bucket IS NOT NULL AND Bucket != '' ORDER BY Bucket`,
      })

      const [lineaRows] = await bq.query({
        query: `SELECT DISTINCT Linea FROM ${fullTable} WHERE Linea IS NOT NULL AND Linea != '' ORDER BY Linea`,
      })

      return NextResponse.json({
        buckets: bucketRows.map((r: Record<string, string>) => r.Bucket),
        lineas: lineaRows.map((r: Record<string, string>) => r.Linea),
      })
    }

    if (action === 'columns') {
      const [rows] = await bq.query({
        query: `SELECT column_name, data_type FROM \`${BQ_DATASET}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @tableName ORDER BY ordinal_position`,
        params: { tableName: table },
      })

      return NextResponse.json({
        columns: rows.map((r: Record<string, string>) => ({
          name: r.column_name,
          type: r.data_type,
        })),
      })
    }

    if (action === 'leads') {
      const { where, params } = buildBQWhereClause(filters)
      const rawLimit = searchParams.get('limit')
      const parsedLimit = rawLimit ? Number(rawLimit) : null
      const limitClause =
        parsedLimit && Number.isFinite(parsedLimit) && parsedLimit > 0
          ? ` LIMIT ${Math.floor(parsedLimit)}`
          : ''

      const [rows] = await bq.query({
        query: `SELECT * FROM ${fullTable} ${where}${limitClause}`,
        params,
      })

      return NextResponse.json({ leads: rows, total: rows.length })
    }

    if (action === 'count') {
      const { where, params } = buildBQWhereClause(filters)

      const [rows] = await bq.query({
        query: `SELECT COUNT(*) as total FROM ${fullTable} ${where}`,
        params,
      })

      return NextResponse.json({ total: Number(rows[0]?.total || 0) })
    }

    return NextResponse.json({ error: 'Invalid action. Use: tables, filters, leads, count, columns' }, { status: 400 })
  } catch (err) {
    console.error('BigQuery error:', err)
    return NextResponse.json({ error: 'Error querying BigQuery' }, { status: 500 })
  }
}
