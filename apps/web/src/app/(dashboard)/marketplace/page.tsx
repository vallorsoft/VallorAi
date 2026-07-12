import { Metadata } from 'next'
import { MarketplacePage } from '@/components/marketplace/MarketplacePage'

export const metadata: Metadata = { title: 'Marketplace — AI Home Designer' }

export default function MarketplaceRoute() {
  return <MarketplacePage />
}
