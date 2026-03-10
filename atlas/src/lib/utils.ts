import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

export function formatRelativeTime(dateString: string): string {
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(dateString)
}

export function getMasteryColor(mastery: number): string {
  if (mastery >= 0.8) return 'text-atlas-emerald'
  if (mastery >= 0.6) return 'text-atlas-amber'
  if (mastery >= 0.4) return 'text-yellow-400'
  return 'text-atlas-red'
}

export function getMasteryBg(mastery: number): string {
  if (mastery >= 0.8) return 'bg-atlas-emerald/20 border-atlas-emerald/30'
  if (mastery >= 0.6) return 'bg-atlas-amber/20 border-atlas-amber/30'
  if (mastery >= 0.4) return 'bg-yellow-500/20 border-yellow-500/30'
  return 'bg-atlas-red/20 border-atlas-red/30'
}

export function getStatusBadge(status: string): { label: string; className: string } {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-atlas-muted/50 text-atlas-subtle' },
    published: { label: 'Published', className: 'bg-atlas-emerald/20 text-atlas-emerald border border-atlas-emerald/30' },
    archived: { label: 'Archived', className: 'bg-atlas-muted/30 text-atlas-subtle/50' },
    not_started: { label: 'Not Started', className: 'bg-atlas-muted/30 text-atlas-subtle' },
    in_progress: { label: 'In Progress', className: 'bg-atlas-blue/20 text-atlas-blue border border-atlas-blue/30' },
    completed: { label: 'Completed', className: 'bg-atlas-emerald/20 text-atlas-emerald border border-atlas-emerald/30' },
  }
  return map[status] || { label: status, className: 'bg-atlas-muted/30 text-atlas-subtle' }
}

export function getDifficultyColor(difficulty: string): string {
  const map: Record<string, string> = {
    beginner: 'text-atlas-emerald',
    intermediate: 'text-atlas-amber',
    advanced: 'text-atlas-red',
  }
  return map[difficulty] || 'text-atlas-subtle'
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

export function generateInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function getAlertColor(alertType: string): string {
  const map: Record<string, string> = {
    struggling: 'text-atlas-red border-atlas-red/30 bg-atlas-red/10',
    intervention: 'text-atlas-amber border-atlas-amber/30 bg-atlas-amber/10',
    achievement: 'text-atlas-emerald border-atlas-emerald/30 bg-atlas-emerald/10',
    completion: 'text-atlas-blue border-atlas-blue/30 bg-atlas-blue/10',
  }
  return map[alertType] || 'text-atlas-subtle border-atlas-border'
}
