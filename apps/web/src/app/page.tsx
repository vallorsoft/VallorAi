import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-brand-100 flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <span className="font-semibold text-gray-900 text-lg">AI Home Designer</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">
            Autentificare
          </Link>
          <Link
            href="/register"
            className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors"
          >
            Începe gratuit
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
            Proiectează-ți casa cu{' '}
            <span className="text-brand-500">Inteligența Artificială</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 leading-relaxed">
            Descrie-ți visul și AI-ul generează planul casei, respectând normativele românești de construcție.
            De la concept la autorizație, totul într-un singur loc.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
            <Link
              href="/register"
              className="bg-brand-500 text-white px-8 py-3 rounded-xl text-base font-medium hover:bg-brand-600 transition-colors shadow-lg shadow-brand-200"
            >
              Proiectează gratuit
            </Link>
            <Link
              href="/login"
              className="border border-gray-200 text-gray-700 px-8 py-3 rounded-xl text-base font-medium hover:bg-gray-50 transition-colors"
            >
              Ai deja cont? Intră
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
        {[
          {
            icon: '🏠',
            title: 'Generare plan AI',
            desc: 'Descrie în cuvinte simple ce îți dorești și AI-ul creează planul în câteva minute.',
          },
          {
            icon: '📐',
            title: 'Editor 2D/3D',
            desc: 'Modifică planul interactiv cu editorul nostru vizual, adaugă camere și pereți.',
          },
          {
            icon: '⚖️',
            title: 'Normative românești',
            desc: 'Validare automată conform normativelor P100, NP 011 și regulilor locale.',
          },
        ].map((f) => (
          <div key={f.title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="text-3xl mb-3">{f.icon}</div>
            <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
            <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="text-center py-6 text-xs text-gray-400">
        © {new Date().getFullYear()} AI Home Designer · Designed for Romania
      </footer>
    </main>
  )
}
