import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex flex-col">
      <header className="px-6 py-4">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <span className="font-semibold text-gray-900">AI Home Designer</span>
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        {children}
      </div>
    </div>
  )
}
