'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Class } from '@/types'
import { generateInitials, formatRelativeTime } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function TeacherStudents() {
  const [classes,        setClasses]        = useState<Class[]>([])
  const [selectedClass,  setSelectedClass]  = useState<string>('all')
  const [students,       setStudents]       = useState<Profile[]>([])
  const [allStudents,    setAllStudents]    = useState<Profile[]>([])
  const [loading,        setLoading]        = useState(true)
  const [showAddClass,   setShowAddClass]   = useState(false)
  const [newClassName,   setNewClassName]   = useState('')
  const [newSubject,     setNewSubject]     = useState('')
  const [creating,       setCreating]       = useState(false)
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Load teacher's classes
    const { data: cls, error: clsErr } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (clsErr) {
      toast.error('Could not load classes: ' + clsErr.message)
      setLoading(false)
      return
    }

    const myClasses: Class[] = cls || []
    setClasses(myClasses)

    if (myClasses.length === 0) { setLoading(false); return }

    const classIds = myClasses.map(c => c.id)

    // Fetch enrollments
    const { data: enrollments, error: enrErr } = await supabase
      .from('class_enrollments')
      .select('student_id, class_id')
      .in('class_id', classIds)
      .eq('is_active', true)

    if (enrErr) {
      toast.error('Could not load enrollments: ' + enrErr.message)
      setLoading(false)
      return
    }

    const studentIds = Array.from(new Set((enrollments || []).map(e => e.student_id)))

    if (studentIds.length === 0) { setLoading(false); return }

    // Fetch student profiles separately (avoids join RLS issues)
    const { data: profileData, error: profErr } = await supabase
      .from('profiles')
      .select('*')
      .in('id', studentIds)

    if (profErr) {
      toast.error('Could not load student profiles: ' + profErr.message)
      setLoading(false)
      return
    }

    setAllStudents(profileData || [])
    setStudents(profileData || [])
    setLoading(false)
  }

  // Filter students by selected class
  useEffect(() => {
    if (selectedClass === 'all') {
      setStudents(allStudents)
    } else {
      // We need enrollments scoped to the selected class — re-fetch
      supabase
        .from('class_enrollments')
        .select('student_id')
        .eq('class_id', selectedClass)
        .eq('is_active', true)
        .then(({ data }) => {
          const ids = (data || []).map(e => e.student_id)
          setStudents(allStudents.filter(s => ids.includes(s.id)))
        })
    }
  }, [selectedClass, allStudents])

  const createClass = async () => {
    if (!newClassName.trim()) { toast.error('Class name is required'); return }
    setCreating(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCreating(false); return }

    const { data, error } = await supabase
      .from('classes')
      .insert({
        teacher_id: user.id,
        name:       newClassName.trim(),
        subject:    newSubject.trim() || null,
        is_active:  true,
      })
      .select()
      .single()

    if (error) {
      toast.error('Failed to create class: ' + error.message)
      setCreating(false)
      return
    }

    setClasses(prev => [data, ...prev])
    setNewClassName('')
    setNewSubject('')
    setShowAddClass(false)
    setCreating(false)
    toast.success(`Class "${data.name}" created! Join code: ${data.join_code}`)
  }

  const COLORS = [
    'from-blue-500 to-cyan-500',
    'from-purple-500 to-pink-500',
    'from-amber-500 to-orange-500',
    'from-emerald-500 to-teal-500',
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-3xl text-atlas-text">Student Management</h1>
          <p className="text-atlas-subtle">
            {allStudents.length} enrolled student{allStudents.length !== 1 ? 's' : ''} across {classes.length} class{classes.length !== 1 ? 'es' : ''}
          </p>
        </div>
        <button onClick={() => setShowAddClass(true)} className="btn-primary">+ New Class</button>
      </div>

      {/* Create Class Modal */}
      {showAddClass && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="atlas-card w-full max-w-md animate-slide-up p-8">
            <h2 className="font-display font-bold text-xl text-atlas-text mb-6">Create New Class</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-atlas-subtle mb-2">Class Name *</label>
                <input value={newClassName} onChange={e => setNewClassName(e.target.value)}
                  placeholder="e.g. Biology 10A" className="atlas-input"
                  onKeyDown={e => e.key === 'Enter' && createClass()} />
              </div>
              <div>
                <label className="block text-sm font-medium text-atlas-subtle mb-2">Subject</label>
                <input value={newSubject} onChange={e => setNewSubject(e.target.value)}
                  placeholder="e.g. Biology" className="atlas-input" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowAddClass(false); setNewClassName(''); setNewSubject('') }}
                className="btn-secondary flex-1 justify-center" disabled={creating}>
                Cancel
              </button>
              <button onClick={createClass} disabled={creating || !newClassName.trim()}
                className="btn-primary flex-1 justify-center">
                {creating ? 'Creating...' : 'Create Class'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Classes Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => <div key={i} className="h-36 bg-atlas-card rounded-2xl shimmer" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
          <div
            onClick={() => setSelectedClass('all')}
            className={`atlas-card cursor-pointer transition-all duration-200 border-dashed ${
              selectedClass === 'all' ? 'border-atlas-blue shadow-glow-blue' : 'hover:border-atlas-muted'
            }`}>
            <div className="w-12 h-12 rounded-2xl bg-atlas-blue/10 flex items-center justify-center text-2xl mb-3">📋</div>
            <h3 className="font-display font-bold text-atlas-text">All Classes</h3>
            <p className="text-xs text-atlas-subtle">{allStudents.length} total students</p>
          </div>

          {classes.map((cls, i) => (
            <div key={cls.id}
              onClick={() => setSelectedClass(selectedClass === cls.id ? 'all' : cls.id)}
              className={`atlas-card cursor-pointer transition-all duration-200 ${
                selectedClass === cls.id ? 'border-atlas-blue shadow-glow-blue' : 'hover:border-atlas-muted'
              }`}>
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${COLORS[i % COLORS.length]} flex items-center justify-center text-2xl mb-3`}>
                🏫
              </div>
              <h3 className="font-display font-bold text-atlas-text truncate">{cls.name}</h3>
              <p className="text-xs text-atlas-subtle">{cls.subject || 'No subject'}</p>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-atlas-border">
                <span className="text-xs text-atlas-subtle">Join Code:</span>
                <span className="font-mono text-atlas-amber font-bold text-sm">{cls.join_code}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Students List */}
      <div className="atlas-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg text-atlas-text">
            {selectedClass === 'all' ? 'All Students' : classes.find(c => c.id === selectedClass)?.name || 'Class'}
          </h2>
          <span className="badge bg-atlas-blue/10 text-atlas-blue border-atlas-blue/20">{students.length} students</span>
        </div>

        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-atlas-surface rounded-xl shimmer" />)}</div>
        ) : students.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-4xl block mb-3">👥</span>
            <p className="font-semibold text-atlas-text mb-1">No students yet</p>
            <p className="text-atlas-subtle text-sm">Share the join code with your students so they can enroll</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-atlas-border">
                  <th className="text-left text-xs text-atlas-subtle font-medium pb-3 pr-4">Student</th>
                  <th className="text-left text-xs text-atlas-subtle font-medium pb-3 pr-4">Grade</th>
                  <th className="text-left text-xs text-atlas-subtle font-medium pb-3 pr-4">Interests</th>
                  <th className="text-left text-xs text-atlas-subtle font-medium pb-3 pr-4">Joined</th>
                </tr>
              </thead>
              <tbody>
                {students.map(student => (
                  <tr key={student.id} className="border-b border-atlas-border/50 hover:bg-atlas-surface/50 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-atlas-blue to-atlas-purple flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {generateInitials(student.full_name || student.email)}
                        </div>
                        <div>
                          <p className="font-medium text-atlas-text text-sm">{student.full_name || '—'}</p>
                          <p className="text-xs text-atlas-subtle">{student.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-sm text-atlas-subtle">{student.grade_level || '—'}</td>
                    <td className="py-3 pr-4">
                      <div className="flex gap-1 flex-wrap">
                        {(student.interests || []).slice(0, 3).map((interest, ii) => (
                          <span key={ii} className="badge bg-atlas-muted/30 text-atlas-subtle text-xs">{interest}</span>
                        ))}
                        {!student.interests?.length && <span className="text-xs text-atlas-subtle/50">Not set</span>}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-xs text-atlas-subtle">{formatRelativeTime(student.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
