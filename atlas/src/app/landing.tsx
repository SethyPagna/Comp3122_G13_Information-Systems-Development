import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-atlas-bg relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-grid-pattern opacity-30" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-atlas-blue/10 rounded-full blur-[100px]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-atlas-amber/8 rounded-full blur-[120px]" />
      <div className="absolute top-1/2 left-0 w-64 h-64 bg-atlas-purple/8 rounded-full blur-[80px]" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-atlas-blue to-atlas-cyan flex items-center justify-center">
            <span className="text-white font-display font-bold text-lg">A</span>
          </div>
          <span className="font-display font-bold text-xl text-atlas-text">Atlas</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/auth/login" className="text-atlas-subtle hover:text-atlas-text text-sm font-medium transition-colors">
            Sign In
          </Link>
          <Link href="/auth/signup" className="btn-primary text-sm py-2">
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 text-center px-6 pt-16 pb-24 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-atlas-blue/10 border border-atlas-blue/30 text-atlas-blue text-sm font-medium mb-8 animate-fade-in">
          <span className="w-2 h-2 bg-atlas-blue rounded-full animate-pulse" />
          AI-Powered Adaptive Learning Platform
        </div>
        
        <h1 className="font-display text-6xl md:text-7xl font-extrabold text-atlas-text leading-tight mb-6 animate-slide-up">
          Every Student Learns
          <span className="block bg-gradient-to-r from-atlas-blue via-atlas-cyan to-atlas-purple bg-clip-text text-transparent">
            at Their Pace
          </span>
        </h1>
        
        <p className="text-atlas-subtle text-xl max-w-2xl mx-auto mb-10 leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
          Atlas transforms how teachers create lessons and students learn — combining intelligent content analysis, 
          personalized paths, and real-time insights so every student gets exactly what they need.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <Link href="/auth/signup?role=teacher" 
            className="btn-primary px-8 py-4 text-base glow-blue w-full sm:w-auto justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            I'm a Teacher
          </Link>
          <Link href="/auth/signup?role=student"
            className="btn-secondary px-8 py-4 text-base w-full sm:w-auto justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
            </svg>
            I'm a Student
          </Link>
        </div>
      </section>

      {/* Feature cards */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: '🧠',
              title: 'AI Lesson Studio',
              description: 'Paste a URL, upload a doc, or describe objectives — Atlas instantly creates a structured, differentiated lesson.',
              color: 'blue'
            },
            {
              icon: '🗺️',
              title: 'Adaptive Learning Paths',
              description: 'Diagnostic surveys map student knowledge. Content adapts in real-time to fill gaps and challenge advanced learners.',
              color: 'amber'
            },
            {
              icon: '💬',
              title: 'Socratic AI Support',
              description: 'Students get guiding questions — never answers — from our AI tutor, building genuine understanding.',
              color: 'emerald'
            },
          ].map((feat, i) => (
            <div key={i} className="atlas-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1 animate-slide-up"
              style={{ animationDelay: `${0.1 * i}s` }}>
              <div className="text-4xl mb-4">{feat.icon}</div>
              <h3 className="font-display font-bold text-xl text-atlas-text mb-2">{feat.title}</h3>
              <p className="text-atlas-subtle leading-relaxed">{feat.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow visualization */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-24 text-center">
        <h2 className="font-display font-bold text-4xl text-atlas-text mb-4">How Atlas Works</h2>
        <p className="text-atlas-subtle mb-12">From lesson creation to real-time intervention — a complete learning ecosystem</p>
        
        <div className="flex flex-col items-center gap-2">
          {[
            { step: '01', title: 'Teacher creates lesson', sub: 'AI deconstructs & structures content', icon: '✏️' },
            { step: '02', title: 'Lesson published', sub: 'Students assigned with adaptive settings', icon: '📤' },
            { step: '03', title: 'Diagnostic survey', sub: 'Knowledge graph maps prerequisites', icon: '🔍' },
            { step: '04', title: 'Personalized path', sub: 'Gap-filling → core content → extensions', icon: '🎯' },
            { step: '05', title: 'Real-time insights', sub: 'Teacher dashboard updates live', icon: '📊' },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-6 w-full max-w-lg">
              <div className="w-14 h-14 rounded-2xl bg-atlas-surface border border-atlas-border flex items-center justify-center text-2xl flex-shrink-0">
                {step.icon}
              </div>
              <div className="flex-1 atlas-card py-4 px-5 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-atlas-blue">{step.step}</span>
                  <span className="font-semibold text-atlas-text">{step.title}</span>
                </div>
                <p className="text-sm text-atlas-subtle mt-0.5">{step.sub}</p>
              </div>
              {i < 4 && <div className="absolute w-0.5 h-6 bg-atlas-border ml-6" style={{ transform: 'translateY(52px)' }} />}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 pb-32 text-center">
        <div className="atlas-card p-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-glow-blue opacity-50" />
          <h2 className="relative font-display font-extrabold text-4xl text-atlas-text mb-4">
            Ready to Transform Your Classroom?
          </h2>
          <p className="relative text-atlas-subtle text-lg mb-8">
            Join educators using Atlas to deliver personalized learning at scale.
          </p>
          <Link href="/auth/signup" className="btn-primary px-10 py-4 text-base inline-flex glow-blue">
            Start Free Today →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-atlas-border py-8 px-6 text-center text-atlas-subtle text-sm">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-atlas-blue to-atlas-cyan flex items-center justify-center">
            <span className="text-white font-bold text-xs">A</span>
          </div>
          <span className="font-display font-semibold text-atlas-text">Atlas</span>
        </div>
        <p>AI-Powered Adaptive Learning Platform · Built for educators and students who demand more.</p>
      </footer>
    </main>
  )
}
