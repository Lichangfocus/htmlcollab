import { notFound } from 'next/navigation'
import { getDb } from '@/lib/db'
import CanvasClient from './canvas-client'

export interface VersionInfo {
  id: string
  number: number
  kind: string
  base_version_id: string | null
  pushed_by_name: string | null
  created_at: string
}

export default async function PageView(props: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ v?: string }>
}) {
  const { slug } = await props.params
  const { v } = await props.searchParams

  const db = await getDb()
  const page = await db
    .prepare('SELECT id, slug, title FROM pages WHERE slug = ?')
    .bind(slug)
    .first<{ id: string; slug: string; title: string }>()
  if (!page) notFound()

  const { results: versions } = await db
    .prepare('SELECT id, number, kind, base_version_id, pushed_by_name, created_at FROM versions WHERE page_id = ? ORDER BY number ASC')
    .bind(page.id)
    .all<VersionInfo>()
  if (!versions.length) notFound()

  const mainlines = versions.filter((x) => x.kind !== 'variant')
  const wanted = v ? versions.find((x) => x.number === parseInt(v, 10)) : undefined
  const initial = wanted ?? mainlines[mainlines.length - 1]

  return (
    <CanvasClient
      slug={page.slug}
      title={page.title}
      initialVersions={versions}
      initialFocusId={initial.id}
    />
  )
}
