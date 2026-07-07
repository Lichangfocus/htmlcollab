import { notFound } from 'next/navigation'
import { getDb } from '@/lib/db'
import Viewer from './viewer-client'

interface VersionMeta { id: string; number: number; created_at: string }

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
    .prepare('SELECT id, number, created_at FROM versions WHERE page_id = ? ORDER BY number DESC')
    .bind(page.id)
    .all<VersionMeta>()
  if (!versions.length) notFound()

  const wanted = v ? parseInt(v, 10) : versions[0].number
  const current = versions.find((x) => x.number === wanted) ?? versions[0]

  return (
    <Viewer
      slug={page.slug}
      title={page.title}
      versions={versions.map((x) => ({ id: x.id, number: x.number }))}
      current={{ id: current.id, number: current.number }}
      isLatest={current.number === versions[0].number}
    />
  )
}
