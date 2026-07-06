'use client'

import { usePathname } from 'next/navigation'

const titles: Record<string, string> = {
  '/projects': 'Proiectele mele',
  '/marketplace': 'Marketplace',
  '/settings': 'Setări cont',
}

export function TopBar() {
  const pathname = usePathname()
  const title = Object.entries(titles).find(([k]) => pathname.startsWith(k))?.[1] ?? 'AI Home Designer'

  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center px-6">
      <h2 className="text-sm font-medium text-gray-700">{title}</h2>
    </header>
  )
}
