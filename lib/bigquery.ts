import { BigQuery } from '@google-cloud/bigquery'

let bigqueryClient: BigQuery | null = null

export function getBigQueryClient(): BigQuery {
  if (!bigqueryClient) {
    const keyJson = process.env.BIG_QUERY_KEY
    if (!keyJson) throw new Error('BIG_QUERY_KEY not configured')

    const credentials = JSON.parse(keyJson)
    bigqueryClient = new BigQuery({
      projectId: credentials.project_id,
      credentials,
    })
  }
  return bigqueryClient
}

export const BQ_PROJECT = 'peak-emitter-350713'
export const BQ_DATASET = 'Leads'

// Fetch table names dynamically from BigQuery dataset
export async function fetchBQTables(): Promise<string[]> {
  const bq = getBigQueryClient()
  const [rows] = await bq.query({
    query: `SELECT table_name FROM \`${BQ_DATASET}.INFORMATION_SCHEMA.TABLES\` ORDER BY table_name`,
  })
  return rows.map((r: Record<string, string>) => r.table_name)
}

// Build WHERE clause from filter arrays
export function buildBQWhereClause(filters: { sedes?: string[]; subOrigenes?: string[] }) {
  const conditions: string[] = []
  const params: Record<string, string | string[]> = {}

  const sedes = filters.sedes || []
  const subOrigenes = filters.subOrigenes || []

  if (sedes.length === 1) {
    conditions.push('Sede = @sede')
    params.sede = sedes[0]
  } else if (sedes.length > 1) {
    conditions.push('Sede IN UNNEST(@sedes)')
    params.sedes = sedes
  }

  if (subOrigenes.length === 1) {
    conditions.push('SubOrigen = @suborigen')
    params.suborigen = subOrigenes[0]
  } else if (subOrigenes.length > 1) {
    conditions.push('SubOrigen IN UNNEST(@suborigenes)')
    params.suborigenes = subOrigenes
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}

// Fetch all leads from BigQuery with filters
export async function fetchBQLeads(
  table: string,
  filters: { sedes?: string[]; subOrigenes?: string[] }
): Promise<Record<string, unknown>[]> {
  const bq = getBigQueryClient()
  const fullTable = `\`${BQ_DATASET}.${table}\``
  const { where, params } = buildBQWhereClause(filters)

  const [rows] = await bq.query({
    query: `SELECT * FROM ${fullTable} ${where}`,
    params,
  })

  return rows as Record<string, unknown>[]
}
