'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Class, Lesson } from '@/types'
import { generateInitials, formatRelativeTime } from '@/lib/utils'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface Assignment {
  id: string
  lesson_id: string
  lesson_title: string
  created_at: string
  due_date: string | null
}

export default function TeacherStudents() {
  const [classes,       setClasses]       = useState<Class[]>([])
  const [selectedClass, setSelectedClass] = useState<string>('all')
  const [students,      setStudents]      = useState<Profile[]>([])
  const [allStudents,   setAllStudents]   = useState<Profile[]>([])
  const [myLessons,     setMyLessons]     = useState<Lesson[]>([])
  const [assignments,   setAssignments]   = useState<Assignment[]>([])
  const [loading,       setLoading]       = useState(true)

  // Create class modal
  const [showAddClass,  setShowAddClass]  = useState(false)
  const [newClassName,  setNewClassName]  = useState('')
  const [newSubject,    setNewSubject]    = useState('')
  const [creating,      setCreating]      = useState(false)

  // Assign lesson modal
  const [showAssign,    setShowAssign]    = useState(false)
  const [assignLessonId, setAssignLessonId] = useState('')
  const [assignDueDate,  setAssignDueDate]  = useState('')
  const [assigning,     setAssigning]     = useState(false)

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: cls, error: clsErr } = await supabase
      .from('classes').select('*').eq('teacher_id', user.id).eq('is_active', true).order('name')

    if (clsErr) { toast.error('Could not load classes: ' + clsErr.message); setLoading(false); return }

    const myClasses: Class[] = cls || []
    setClasses(myClasses)

    const { data: lessonsData } = await supabase
      .from('lessons').select('id, title, status').eq('teacher_id', user.id).order('title')
    setMyLessons((lessonsData || []) as Lesson[])

    if (myClasses.length === 0) { setLoading(false); return }
    const classIds = myClasses.map(c => c.id)

    const { data: enrollments } = await supabase
      .from('class_enrollments').select('student_id, class_id').in('class_id', classIds).eq('is_active', true)

    const studentIds = Array.from(new Set((enrollments || []).map((e: any) => e.student_id)))
    if (studentIds.length > 0) {
      const { data: profileData } = await supabase.from('profiles').select('*').in('id', studentIds)
      setAllStudents(profileData || [])
      setStudents(profileData || [])
    }
    setLoading(false)
  }

  const loadAssignments = async (classId: string) => {
    const { data } = await supabase
      .from('lesson_assignments')
      .select('id, lesson_id, created_at, due_date, lessons(title)')
      .eq('class_id', classId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    setAssignments((data || []).map((a: any) => ({
      id:           a.id,
      lesson_id:    a.lesson_id,
      lesson_title: a.lessons?.title || 'Unknown lesson',
      created_at:   a.created_at,
      due_date:     a.due_date,
    })))
  }

  const selectClass = async (classId: string) => {
    setSelectedClass(classId)
    if (classId === 'all') {
      setStudents(allStudents)
      setAssignments([])
      return
    }
    const { data } = await supabase
      .from('class_enrollments').select('student_id').eq('class_id', classId).eq('is_active', true)
    const ids = (data || []).map((e: any) => e.student_id)
    setStudents(allStudents.filter(s => ids.includes(s.id)))
    await loadAssignments(classId)
  }

  const createClass = async () => {
    if (!newClassName.trim()) { toast.error('Class name is required'); return }
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCreating(false); return }

    const { data, error } = await supabase.from('classes').insert({
      teacher_id: user.id,
      name:       newClassName.trim(),
      subject:    newSubject.trim() || null,
      is_active:  true,
    }).select().single()

    if (error) { toast.error('Failed: ' + error.message); setCreating(false); return }
    setClasses(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setNewClassName('')
    setNewSubject('')
    setShowAddClass(false)
    setCreating(false)
    toast.success(`✅ Class "${data.name}" created! Join code: ${data.join_code}`)
  }

  const assignLesson = async () => {
    if (!assignLessonId) { toast.error('Pick a lesson first'); return }
    if (selectedClass === 'all') { toast.error('Select a specific class first'); return }
    setAssigning(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAssigning(false); return }

    const already = assignments.find(a => a.lesson_id === assignLessonId)
    if (already) { toast.error('Already assigned'); setAssigning(false); return }

    const { error } = await supabase.from('lesson_assignments').insert({
      lesson_id:   assignLessonId,
      class_id:    selectedClass,
      assigned_by: user.id,
      due_date:    assignDueDate || null,
      is_active:   true,
    })

    if (error) {
      toast.error('Failed: ' + error.message)
    } else {
      toast.success('Lesson assigned!')
      await loadAssignments(selectedClass)
      setAssignLessonId('')
      setAssignDueDate('')
      setShowAssign(false)
    }
    setAssigning(false)
  }

  const removeAssignment = async (id: string) => {
    if (!confirm('Remove this assignment from the class?')) return
    await supabase.from('lesson_assignments').update({ is_active: false }).eq('id', id)
    setAssignments(a => a.filter(x => x.id !== id))
    toast.success('Assignment removed')
  }

  const deleteClass = async (classId: string) => {
    if (!confirm('Delete this class? Students will lose access to its lessons.')) return
    await supabase.from('classes').update({ is_active: false }).eq('id', classId)
    setClasses(c => c.filter(cls => cls.id !== classId))
    if (selectedClass === classId) { setSelectedClass('all'); setStudents(allStudents) }
    toast.success('Class deleted')
  }

  const COLORS = ['from-blue-500 to-cyan-500','from-purple-500 to-pink-500','from-amber-500 to-orange-500','from-emerald-500 to-teal-500']

  const activeClass = classes.find(c => c.id === selectedClass)

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-3xl text-atlas-text">Student Management</h1>
          <p className="text-atlas-subtle">
            {allStudents.length} enrolled · {classes.length} class{classes.length !== 1 ? 'es' : ''}
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
                  onKeyDown={e => e.key === 'Enter' && createClass()} autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-atlas-subtle mb-2">Subject (optional)</label>
                <input value={newSubject} onChange={e => setNewSubject(e.target.value)}
                  placeholder="e.g. Biology" className="atlas-input" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowAddClass(false); setNewClassName(''); setNewSubject('') }}
                className="btn-secondary flex-1 justify-center" disabled={creating}>Cancel</button>
              <button onClick={createClass} disabled={creating || !newClassName.trim()}
                className="btn-primary flex-1 justify-center">
                {creating ? 'Creating...' : 'Create Class'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Lesson Modal */}
      {showAssign && selectedClass !== 'all' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="atlas-card w-full max-w-md animate-slide-up p-8">
            <h2 className="font-display font-bold text-xl text-atlas-text mb-1">Assign a Lesson</h2>
            <p className="text-atlas-subtle text-sm mb-6">To: <span className="text-atlas-text font-medium">{activeClass?.name}</span></p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-atlas-subtle mb-2">Lesson *</label>
                <select value={assignLessonId} onChange={e => setAssignLessonId(e.target.value)} className="atlas-input">
                  <option value="">— Choose a lesson —</option>
                  {myLessons
                    .filter(l => !assignments.find(a => a.lesson_id === l.id))
                    .map(l => (
                      <option key={l.id} value={l.id}>
                        {l.title}{l.status !== 'published' ? ' (draft)' : ''}
                      </option>
                    ))}
                </select>
                {myLessons.filter(l => !assignments.find(a => a.lesson_id === l.id)).length === 0 && (
                  <p className="text-xs text-atlas-subtle mt-1">All your lessons are already assigned to this class.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-atlas-subtle mb-2">Due Date (optional)</label>
                <input type="date" value={assignDueDate} onChange={e => setAssignDueDate(e.target.value)}
                  className="atlas-input" min={new Date().toISOString().split('T')[0]} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowAssign(false); setAssignLessonId(''); setAssignDueDate('') }}
                className="btn-secondary flex-1 justify-center" disabled={assigning}>Cancel</button>
              <button onClick={assignLesson} disabled={assigning || !assignLessonId}
                className="btn-primary flex-1 justify-center">
                {assigning ? 'Assigning...' : 'Assign Lesson'}
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
          {/* All Classes card */}
          <div onClick={() => selectClass('all')}
            className={`atlas-card cursor-pointer transition-all border-dashed ${selectedClass === 'all' ? 'border-atlas-blue shadow-glow-blue' : 'hover:border-atlas-muted'}`}>
            <div className="w-12 h-12 rounded-2xl bg-atlas-blue/10 flex items-center justify-center text-2xl mb-3">📋</div>
            <h3 className="font-display font-bold text-atlas-text">All Classes</h3>
            <p className="text-xs text-atlas-subtle">{allStudents.length} students total</p>
          </div>

          {classes.map((cls, i) => (
            <div key={cls.id} onClick={() => selectClass(cls.id)}
              className={`atlas-card cursor-pointer transition-all relative group ${selectedClass === cls.id ? 'border-atlas-blue shadow-glow-blue' : 'hover:border-atlas-muted'}`}>
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${COLORS[i % COLORS.length]} flex items-center justify-center text-2xl mb-3`}>
                🏫
              </div>
              <h3 className="font-display font-bold text-atlas-text truncate">{cls.name}</h3>
              <p className="text-xs text-atlas-subtle">{cls.subject || 'No subject'}</p>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-atlas-border">
                <span className="text-xs text-atlas-subtle">Join Code:</span>
                <span className="font-mono text-atlas-amber font-bold text-sm">{cls.join_code}</span>
              </div>
              {/* Delete button appears on hover */}
              <button
                onClick={e => { e.stopPropagation(); deleteClass(cls.id) }}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-atlas-subtle hover:text-atlas-red text-sm"
                title="Delete class"
              >×</button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Students table */}
        <div className="lg:col-span-2 atlas-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-lg text-atlas-text">
              {selectedClass === 'all' ? 'All Students' : activeClass?.name || 'Class'}
            </h2>
            <span className="badge bg-atlas-blue/10 text-atlas-blue border-atlas-blue/20">{students.length} students</span>
          </div>

          {loading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-atlas-surface rounded-xl shimmer" />)}</div>
          ) : students.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl block mb-3">👥</span>
              <p className="font-semibold text-atlas-text mb-1">No students yet</p>
              <p className="text-atlas-subtle text-sm">
                {selectedClass === 'all'
                  ? 'Share a class join code with your students so they can enroll.'
                  : `Share the join code ${activeClass ? `"${activeClass.join_code}"` : ''} with your students.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-atlas-border">
                    <th className="text-left text-xs text-atlas-subtle font-medium pb-3 pr-4">Student</th>
                    <th className="text-left text-xs text-atlas-subtle font-medium pb-3 pr-4">Grade</th>
                    <th className="text-left text-xs text-atlas-subtle font-medium pb-3 pr-4">Interests</th>
                    <th className="text-left text-xs text-atlas-subtle font-medium pb-3">Joined</th>
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
                          {(student.interests || []).slice(0, 2).map((int, ii) => (
                            <span key={ii} className="badge bg-atlas-muted/30 text-atlas-subtle text-xs">{int}</span>
                          ))}
                          {!student.interests?.length && <span className="text-xs text-atlas-subtle/50">Not set</span>}
                        </div>
                      </td>
                      <td className="py-3 text-xs text-atlas-subtle">{formatRelativeTime(student.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Assignments panel for selected class */}
        <div className="space-y-4">
          {selectedClass !== 'all' ? (
            <>
              {/* Class info */}
              {activeClass && (
                <div className="atlas-card">
                  <h3 className="font-semibold text-atlas-text mb-3">📋 Class Info</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-atlas-subtle">Join Code</span>
                      <span className="font-mono font-bold text-atlas-amber">{activeClass.join_code}</span>
                    </div>
                    {activeClass.subject && (
                      <div className="flex justify-between">
                        <span className="text-atlas-subtle">Subject</span>
                        <span className="text-atlas-text">{activeClass.subject}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-atlas-subtle">Students</span>
                      <span className="text-atlas-text">{students.length}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Lesson assignments */}
              <div className="atlas-card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-atlas-text">📚 Assigned Lessons</h3>
                  <button onClick={() => setShowAssign(true)} className="btn-primary text-xs py-1.5 px-3">
                    + Assign
                  </button>
                </div>
                {assignments.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-atlas-subtle text-sm mb-3">No lessons assigned yet.</p>
                    <button onClick={() => setShowAssign(true)} className="btn-secondary text-sm py-2">
                      Assign a Lesson
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {assignments.map(a => (
                      <div key={a.id} className="flex items-start justify-between gap-2 p-3 bg-atlas-surface rounded-xl border border-atlas-border">
                        <div className="min-w-0 flex-1">
                          <Link href={`/teacher/lessons/${a.lesson_id}`}
                            className="text-sm font-medium text-atlas-text hover:text-atlas-blue truncate block">
                            {a.lesson_title}
                          </Link>
                          {a.due_date && (
                            <p className="text-xs text-atlas-amber mt-0.5">
                              Due {new Date(a.due_date).toLocaleDateString()}
                            </p>
                          )}
                          <p className="text-xs text-atlas-subtle">Assigned {formatRelativeTime(a.created_at)}</p>
                        </div>
                        <button onClick={() => removeAssignment(a.id)}
                          className="text-atlas-subtle hover:text-atlas-red text-sm flex-shrink-0" title="Remove">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="atlas-card text-center py-8">
              <span className="text-4xl block mb-3">🏫</span>
              <p className="font-medium text-atlas-text mb-1">Select a class</p>
              <p className="text-atlas-subtle text-sm">Click a class card to see its details, students, and manage lesson assignments.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
