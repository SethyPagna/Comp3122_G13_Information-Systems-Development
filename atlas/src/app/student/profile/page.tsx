'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import toast from 'react-hot-toast'
import { generateInitials } from '@/lib/utils'

const INTEREST_OPTIONS = [
  'Space & Astronomy', 'Sports', 'Music', 'Gaming', 'Art & Design',
  'Technology', 'Nature & Environment', 'Cooking & Food', 'Travel', 
  'Movies & TV', 'History', 'Health & Fitness', 'Animals', 'Fashion', 'Business'
]

const ACHIEVEMENTS = [
  { id: '1', icon: '🚀', title: 'First Lesson', desc: 'Completed your first lesson' },
  { id: '2', icon: '🔥', title: '3-Day Streak', desc: 'Learned 3 days in a row' },
  { id: '3', icon: '💡', title: 'Quick Learner', desc: 'Scored 90%+ on a quiz' },
  { id: '4', icon: '🦉', title: 'Socratic Scholar', desc: 'Used Ask Socratic 10 times' },
  { id: '5', icon: '⭐', title: 'Perfect Score', desc: 'Got 100% on a final quiz' },
]

export default function StudentProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) supabase.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => {
          if (data) {
            setProfile(data)
            setFullName(data.full_name || '')
            setGradeLevel(data.grade_level || '')
            setInterests(data.interests || [])
          }
        })
    })
  }, [])

  const toggleInterest = (interest: string) => {
    setInterests(prev => prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest])
  }

  const save = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('profiles').update({
      full_name: fullName,
      grade_level: gradeLevel,
      interests,
    }).eq('id', user.id)

    if (!error) {
      toast.success('Profile saved!')
      setProfile(prev => prev ? { ...prev, full_name: fullName, grade_level: gradeLevel, interests } : null)
      setEditing(false)
    }
    setSaving(false)
  }

  const earnedAchievements = ACHIEVEMENTS.slice(0, Math.min(2, ACHIEVEMENTS.length))

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in">
      <h1 className="font-display font-bold text-3xl text-atlas-text mb-6">My Profile</h1>

      {/* Avatar & basic info */}
      <div className="atlas-card mb-6">
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-atlas-emerald to-atlas-cyan flex items-center justify-center text-white text-3xl font-display font-bold flex-shrink-0">
            {profile ? generateInitials(profile.full_name || profile.email) : '?'}
          </div>
          <div className="flex-1">
            {editing ? (
              <div className="space-y-3">
                <input value={fullName} onChange={e => setFullName(e.target.value)}
                  className="atlas-input font-display font-bold text-xl" placeholder="Full Name" />
                <select value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} className="atlas-input">
                  <option value="">Select Grade Level</option>
                  {['Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 'College'].map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <h2 className="font-display font-bold text-2xl text-atlas-text">{profile?.full_name || 'Set your name'}</h2>
                <p className="text-atlas-subtle">{profile?.email}</p>
                <p className="text-sm text-atlas-subtle mt-1">{profile?.grade_level || 'Grade level not set'}</p>
              </>
            )}
          </div>
          <button onClick={editing ? save : () => setEditing(true)}
            className={editing ? 'btn-primary py-2' : 'btn-secondary py-2'} disabled={saving}>
            {saving ? '...' : editing ? '✓ Save' : '✏️ Edit'}
          </button>
        </div>

        {/* XP bar */}
        <div className="mt-6 pt-4 border-t border-atlas-border">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-atlas-text">⚡ {profile?.total_xp || 0} XP</span>
            <span className="text-atlas-subtle">Level {Math.floor((profile?.total_xp || 0) / 100) + 1}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${(profile?.total_xp || 0) % 100}%` }} />
          </div>
          <p className="text-xs text-atlas-subtle mt-1">{100 - ((profile?.total_xp || 0) % 100)} XP to next level</p>
        </div>
      </div>

      {/* Interests */}
      <div className="atlas-card mb-6">
        <h3 className="font-display font-semibold text-lg text-atlas-text mb-2">🌟 My Interests</h3>
        <p className="text-atlas-subtle text-sm mb-4">We use these to personalize "Why This Matters" connections in your lessons</p>
        <div className="flex flex-wrap gap-2">
          {INTEREST_OPTIONS.map(interest => {
            const selected = interests.includes(interest)
            return (
              <button key={interest} onClick={() => toggleInterest(interest)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  selected 
                    ? 'bg-atlas-blue text-white shadow-glow-blue' 
                    : 'bg-atlas-card text-atlas-subtle border border-atlas-border hover:border-atlas-muted hover:text-atlas-text'
                }`}>
                {selected ? '✓ ' : ''}{interest}
              </button>
            )
          })}
        </div>
        {editing && interests.length > 0 && (
          <button onClick={save} disabled={saving} className="btn-primary mt-4 text-sm py-2">
            Save Interests
          </button>
        )}
        {!editing && (
          <button onClick={() => setEditing(true)} className="btn-ghost mt-4 text-sm">
            Update interests →
          </button>
        )}
      </div>

      {/* Achievements */}
      <div className="atlas-card">
        <h3 className="font-display font-semibold text-lg text-atlas-text mb-4">🏆 Achievements</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ACHIEVEMENTS.map(achievement => {
            const earned = earnedAchievements.some(a => a.id === achievement.id)
            return (
              <div key={achievement.id} className={`p-4 rounded-xl border text-center transition-all ${
                earned 
                  ? 'bg-atlas-amber/5 border-atlas-amber/30' 
                  : 'bg-atlas-surface border-atlas-border opacity-40'
              }`}>
                <span className={`text-3xl block mb-2 ${!earned ? 'grayscale' : ''}`}>{achievement.icon}</span>
                <p className="font-semibold text-sm text-atlas-text">{achievement.title}</p>
                <p className="text-xs text-atlas-subtle mt-1">{achievement.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
