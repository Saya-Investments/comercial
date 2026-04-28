import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || null
  const message = process.env.VERCEL_GIT_COMMIT_MESSAGE || null
  const author = process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME || null
  const branch = process.env.VERCEL_GIT_COMMIT_REF || null
  const env = process.env.VERCEL_ENV || 'local'

  let changelog = ''
  try {
    changelog = await fs.readFile(path.join(process.cwd(), 'CHANGELOG.md'), 'utf-8')
  } catch {
    changelog = '# Changelog\n\n_(archivo no encontrado en el deploy)_'
  }

  return NextResponse.json({
    commit: sha ? { sha, short: sha.slice(0, 7), message, author, branch } : null,
    env,
    changelog,
  })
}
