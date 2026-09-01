import { permanentRedirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string }>
}

export default async function CategoryRedirectPage({ params }: Props) {
  const { slug } = await params

  permanentRedirect(`/category/${slug}`)
}
