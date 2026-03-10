import { NextRequest, NextResponse } from 'next/server'
import { openRouterChat } from '@/lib/openrouter'

export async function POST(request: NextRequest) {
  try {
    const { studentStats, lessonStats } = await request.json()

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ suggestions: ['OPENROUTER_API_KEY not set. Add it to .env.local.'] })
    }

    const atRisk   = (studentStats || []).filter((s: any) => (s.avgScore ?? 0) < 60)
    const advanced = (studentStats || []).filter((s: any) => (s.avgScore ?? 0) >= 80)
    const gaps     = (lessonStats  || []).flatMap((l: any) => l.knowledgeGaps || [])

    const context = `
Class data:
- Total students: ${(studentStats || []).length}
- At risk (below 60%): ${atRisk.length} — names: ${atRisk.map((s: any) => s.name).join(', ') || 'none'}
- Advanced (80%+): ${advanced.length}
- Common knowledge gaps: ${[...new Set(gaps)].slice(0, 6).join(', ') || 'none identified yet'}
- Avg class score: ${(studentStats || []).filter((s: any) => s.avgScore !== null).length > 0
    ? Math.round((studentStats || []).filter((s: any) => s.avgScore !== null).reduce((a: number, s: any) => a + s.avgScore, 0) / (studentStats || []).filter((s: any) => s.avgScore !== null).length)
    : 'N/A'}%
`

    const raw = await openRouterChat({
      messages: [
        { role: 'system', content: 'You are an expert instructional coach. Give specific, actionable intervention suggestions for a teacher. Reply ONLY with a JSON array of 5 suggestion strings. No markdown, no preamble.' },
        { role: 'user', content: `Based on this class data, provide 5 specific intervention suggestions:\n${context}\nReply ONLY with: ["suggestion 1", "suggestion 2", "suggestion 3", "suggestion 4", "suggestion 5"]` },
      ],
      maxTokens: 500, temperature: 0.6,
    })

    let suggestions: string[]
    try {
      const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
      const start = clean.indexOf('[')
      const end   = clean.lastIndexOf(']')
      suggestions = start !== -1 && end !== -1 ? JSON.parse(clean.slice(start, end + 1)) : [clean]
    } catch {
      suggestions = [raw.trim()]
    }

    return NextResponse.json({ suggestions })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ suggestions: [`Could not generate suggestions: ${msg}`] })
  }
}
