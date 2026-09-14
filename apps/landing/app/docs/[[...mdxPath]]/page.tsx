import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Introduction from "../../../content/index.mdx"
import Quickstart from "../../../content/quickstart.mdx"
import SdkReference from "../../../content/sdk.mdx"
import Integration from "../../../content/integration.mdx"
import Architecture from "../../../content/architecture.mdx"
import Glossary from "../../../content/glossary.mdx"

const docs = {
  "": { title: "How it works", Component: Introduction },
  quickstart: { title: "Quickstart", Component: Quickstart },
  sdk: { title: "SDK Reference", Component: SdkReference },
  integration: { title: "Integration", Component: Integration },
  architecture: { title: "Architecture", Component: Architecture },
  glossary: { title: "Glossary", Component: Glossary },
} as const

type DocsSlug = keyof typeof docs
type PageProps = { params: Promise<{ mdxPath?: string[] }> }

function getEntry(mdxPath: string[] | undefined) {
  const slug = mdxPath?.join("/") ?? ""
  return docs[slug as DocsSlug]
}

export function generateStaticParams() {
  return Object.keys(docs).map((slug) => ({ mdxPath: slug ? [slug] : [] }))
}

export const dynamicParams = false

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const entry = getEntry((await params).mdxPath)
  return entry ? { title: entry.title } : {}
}

export default async function Page({ params }: PageProps) {
  const entry = getEntry((await params).mdxPath)
  if (!entry) notFound()
  const Content = entry.Component
  return <Content />
}
