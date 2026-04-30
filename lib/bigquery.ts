import { BigQuery } from '@google-cloud/bigquery'
import { BQ_NULL_SENTINEL } from './bq-constants'

export { BQ_NULL_SENTINEL }

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

type BQFilters = {
  buckets?: string[]
  lineas?: string[]
  estadosAsociadosFondos?: string[]
}

// Build WHERE clause from filter arrays
export function buildBQWhereClause(filters: BQFilters) {
  const conditions: string[] = []
  const params: Record<string, string | string[]> = {}

  const buckets = filters.buckets || []

  if (buckets.length === 1) {
    conditions.push('Bucket = @bucket')
    params.bucket = buckets[0]
  } else if (buckets.length > 1) {
    conditions.push('Bucket IN UNNEST(@buckets)')
    params.buckets = buckets
  }

  const lineas = filters.lineas || []

  if (lineas.length === 1) {
    conditions.push('Linea = @linea')
    params.linea = lineas[0]
  } else if (lineas.length > 1) {
    conditions.push('Linea IN UNNEST(@lineas)')
    params.lineas = lineas
  }

  const estadosAsociadosFondosRaw = filters.estadosAsociadosFondos || []
  const includeNullEstado = estadosAsociadosFondosRaw.includes(BQ_NULL_SENTINEL)
  const estadosAsociadosFondos = estadosAsociadosFondosRaw.filter((v) => v !== BQ_NULL_SENTINEL)

  const estadoConditions: string[] = []

  if (estadosAsociadosFondos.length === 1) {
    estadoConditions.push('estado_asociado_fondos = @estadoAsociadoFondos')
    params.estadoAsociadoFondos = estadosAsociadosFondos[0]
  } else if (estadosAsociadosFondos.length > 1) {
    estadoConditions.push('estado_asociado_fondos IN UNNEST(@estadosAsociadosFondos)')
    params.estadosAsociadosFondos = estadosAsociadosFondos
  }

  if (includeNullEstado) {
    estadoConditions.push("(estado_asociado_fondos IS NULL OR estado_asociado_fondos = '')")
  }

  if (estadoConditions.length === 1) {
    conditions.push(estadoConditions[0])
  } else if (estadoConditions.length > 1) {
    conditions.push(`(${estadoConditions.join(' OR ')})`)
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}

// Fetch all leads from BigQuery with filters
export async function fetchBQLeads(
  table: string,
  filters: BQFilters
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
