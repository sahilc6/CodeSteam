import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Code2, Plus, LogIn, Users, Globe, ChevronRight, Zap, ChevronDown, History, LogOut, Users as UsersIcon, Code } from 'lucide-react'
import AuthModal from './AuthModal'
import useAuthStore from '../../context/authStore'
import { getApiBaseUrl } from '../../utils/runtimeConfig'

const API = getApiBaseUrl()

function authHeaders() {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const LANGUAGES = [
  'javascript','typescript','python','java','cpp',
  'c','go','rust','ruby','php','bash',
]

const LANG_COLORS = {
  javascript: '#f9e2af', typescript: '#89b4fa', python: '#a6e3a1',
  java: '#f38ba8', cpp: '#cba6f7', c: '#94e2d5', go: '#89dceb',
  rust: '#fab387', ruby: '#f38ba8', php: '#b4befe', bash: '#a6e3a1',
}

export default function HomePage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const authSuccessRef = useRef(null)

  const [name, setName] = useState('')
  const [language, setLanguage] = useState('javascript')
  const [joinId, setJoinId] = useState('')
  const [creating, setCreating] = useState(false)
  const [checkingJoin, setCheckingJoin] = useState(false)
  const [requestingJoin, setRequestingJoin] = useState(false)
  const [joinAccess, setJoinAccess] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [myRooms, setMyRooms] = useState([])
  const [selectedRoom, setSelectedRoom] = useState(null)
  const liveRooms = myRooms.filter(room => !room.isEnded)

  const loadMyRooms = useCallback(() => {
    if (user) {
      const token = localStorage.getItem('token')
      return axios.get(`${API}/api/rooms/my`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => {
          setMyRooms(r.data)
          setSelectedRoom(current => {
            if (!current) return current
            return r.data.find(room => room.roomId === current.roomId) || null
          })
        })
        .catch(() => {})
    } else {
      setMyRooms([])
      setSelectedRoom(null)
    }
    return Promise.resolve()
  }, [user])

  useEffect(() => {
    loadMyRooms()
  }, [loadMyRooms])

  const checkJoinAccess = useCallback(async (id) => {
    if (!id) return
    setCheckingJoin(true)
    try {
      const { data } = await axios.get(`${API}/api/rooms/${id}`, {
        headers: authHeaders(),
      })
      setJoinAccess(null)
      navigate(`/room/${data.roomId || id}`)
    } catch (err) {
      const data = err.response?.data || {}
      const accessStatus = data.accessStatus

      if (accessStatus === 'login-required') {
        authSuccessRef.current = () => checkJoinAccess(id)
        setShowAuth(true)
        return
      }

      if (accessStatus === 'request-needed') {
        setJoinAccess({
          status: 'request',
          roomId: data.roomId || id,
          name: data.name || '',
        })
        return
      }

      if (accessStatus === 'pending') {
        setJoinAccess({
          status: 'pending',
          roomId: data.roomId || id,
          name: data.name || '',
        })
        return
      }

      if (accessStatus === 'ended') {
        toast.error('This room has ended')
        return
      }

      toast.error(data.error || 'Room not found')
    } finally {
      setCheckingJoin(false)
    }
  }, [navigate])

  useEffect(() => {
    if (joinAccess?.status !== 'pending') return undefined
    const timer = setInterval(() => {
      checkJoinAccess(joinAccess.roomId)
    }, 3000)
    return () => clearInterval(timer)
  }, [checkJoinAccess, joinAccess])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.dropdown')) {
        setDropdownOpen(false)
        setHistoryOpen(false)
        setSelectedRoom(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  async function createRoom(e) {
    e.preventDefault()
    if (!user) {
      authSuccessRef.current = null
      setShowAuth(true)
      return
    }
    if (!name.trim()) return
    setCreating(true)
    try {
      const token = localStorage.getItem('token')
      const { data } = await axios.post(
        `${API}/api/rooms`,
        { name: name.trim(), language },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      navigate(`/room/${data.roomId}`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create room')
      setCreating(false)
    }
  }

  async function requestJoinAccess() {
    if (!joinAccess?.roomId) return
    setRequestingJoin(true)
    try {
      const { data } = await axios.post(
        `${API}/api/rooms/${joinAccess.roomId}/request`,
        {},
        { headers: authHeaders() },
      )

      if (data.accessStatus === 'allowed') {
        setJoinAccess(null)
        navigate(`/room/${joinAccess.roomId}`)
        return
      }

      setJoinAccess((current) => ({
        ...(current || {}),
        status: 'pending',
      }))
      toast.success('Request sent')
    } catch (err) {
      const data = err.response?.data || {}
      if (data.accessStatus === 'login-required' || err.response?.status === 401) {
        authSuccessRef.current = () => requestJoinAccess()
        setShowAuth(true)
        return
      }
      toast.error(data.error || 'Failed to request access')
    } finally {
      setRequestingJoin(false)
    }
  }

  async function closeJoinAccess() {
    const current = joinAccess
    if (current?.status === 'pending' && current.roomId) {
      try {
        await axios.delete(`${API}/api/rooms/${current.roomId}/request`, {
          headers: authHeaders(),
        })
      } catch (err) {
        toast.error(err.response?.data?.error || 'Failed to cancel request')
        return
      }
    }

    setJoinAccess(null)
    setCheckingJoin(false)
    setRequestingJoin(false)
  }

  function joinRoom(e) {
    e.preventDefault()
    const id = joinId.trim().split('/').pop()
    if (!id) return

    if (!user) {
      authSuccessRef.current = () => checkJoinAccess(id)
      setShowAuth(true)
      return
    }

    checkJoinAccess(id)
  }

  function AccessModal({ title, children }) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-sm bg-editor-sidebar border border-editor-border rounded-lg p-5 shadow-2xl">
          <h1 className="text-base font-semibold text-editor-text mb-2">{title}</h1>
          {joinAccess?.name && <p className="text-xs text-editor-muted mb-4">{joinAccess.name}</p>}
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-editor-bg flex flex-col">
      <nav className="relative flex items-center justify-between px-6 py-4 border-b border-editor-border">
        <div className="flex items-center gap-2">
          <Code2 size={22} className="text-editor-accent" />
          <span className="text-editor-text font-bold text-lg tracking-tight">CodeSteam</span>
        </div>
        <div className="flex items-center gap-2 relative dropdown">
          {user ? (
            <>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1 text-xs text-editor-muted hover:text-editor-text transition-colors"
                type="button"
              >
                {user.username}
                <ChevronDown size={12} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-editor-sidebar border border-editor-border rounded shadow-lg z-50">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDropdownOpen(false)
                      setHistoryOpen(prev => {
                        const next = !prev
                        if (next) loadMyRooms()
                        return next
                      })
                      setSelectedRoom(null)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-editor-text hover:bg-editor-border transition-colors"
                    type="button"
                  >
                    <History size={14} />
                    History
                  </button>
                  <div className="border-t border-editor-border" />
                  <button
                    onClick={() => {
                      logout()
                      setDropdownOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-editor-text hover:bg-editor-border transition-colors"
                    type="button"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              )}
            </>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="flex items-center gap-1 text-xs text-editor-muted hover:text-editor-text transition-colors"
              type="button"
            >
              Sign in
            </button>
          )}
        </div>
      </nav>

      {historyOpen && (
        <div className="absolute top-16 right-6 w-80 bg-editor-sidebar border border-editor-border rounded shadow-lg z-40 max-h-96 overflow-y-auto dropdown">
          <div className="p-3 border-b border-editor-border">
            <h3 className="text-sm font-medium text-editor-text">Your Rooms</h3>
          </div>
          {myRooms.length === 0 ? (
            <div className="p-3 text-xs text-editor-muted">No rooms created yet</div>
          ) : (
            <div className="divide-y divide-editor-border">
              {myRooms.map(room => (
                <button
                  key={room.roomId}
                  onClick={() => setSelectedRoom(selectedRoom?.roomId === room.roomId ? null : room)}
                  className="w-full p-3 text-left hover:bg-editor-border transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm ${room.isEnded ? 'text-editor-muted line-through' : 'text-editor-text'} truncate`}>{room.name}</span>
                    <ChevronRight size={14} className={`text-editor-muted transition-transform ${selectedRoom?.roomId === room.roomId ? 'rotate-90' : ''}`} />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Code size={12} className="text-editor-muted" />
                    <span className="text-xs text-editor-muted capitalize">{room.language}</span>
                    <UsersIcon size={12} className="text-editor-muted ml-2" />
                    <span className="text-xs text-editor-muted">{room.userCount}</span>
                    {(room.pendingRequests?.length || 0) > 0 && (
                    <span className="text-xs text-editor-accent ml-auto">{room.pendingRequests.length} request</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          {selectedRoom && (
            <div className="p-3 border-t border-editor-border bg-editor-bg">
              {selectedRoom.role === 'creator' && (
                <>
                  <h4 className="text-sm font-medium text-editor-text mb-2">Activity</h4>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {(selectedRoom.activity || []).length === 0 ? (
                      <div className="text-xs text-editor-muted">No activity yet</div>
                    ) : (
                      (selectedRoom.activity || []).map((act, idx) => (
                        <div key={idx} className="text-xs text-editor-muted flex items-center gap-2">
                          <span className="text-editor-accent">.</span>
                          <span className="truncate">{act.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
              {!selectedRoom.isEnded && (
                <button
                  onClick={() => navigate(`/room/${selectedRoom.roomId}`)}
                  className={`${selectedRoom.role === 'creator' ? 'mt-2' : ''} w-full btn-primary text-xs`}
                >
                  Join Room
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col items-center text-center px-6 py-14">
        <div className="inline-flex items-center gap-2 bg-editor-sidebar border border-editor-border rounded-full px-3 py-1 text-xs text-editor-muted mb-6">
          <Zap size={11} className="text-editor-accent" />
          Real-time . OT sync . 10+ languages
        </div>
        <h1 className="text-4xl font-bold text-editor-text mb-3 tracking-tight">
          Code together,<br />
          <span className="text-editor-accent">in real time</span>
        </h1>
        <p className="text-editor-muted text-sm max-w-sm">
          Create a room, share the link, and start collaborating instantly.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 px-6 max-w-2xl mx-auto w-full mb-10">
        <div className="card flex-1">
          <div className="flex items-center gap-2 mb-4">
            <Plus size={15} className="text-editor-accent" />
            <h2 className="text-sm font-medium text-editor-text">New Room</h2>
          </div>
          <form onSubmit={createRoom} className="space-y-3">
            <input
              className="input-base"
              placeholder="Room name"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={64}
              required
            />
            <div className="relative">
              <select
                className="input-base appearance-none pr-7"
                value={language}
                onChange={e => setLanguage(e.target.value)}
              >
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="btn-primary w-full flex items-center justify-center gap-1.5"
            >
              {creating ? 'Creating...' : <><Plus size={13} /> Create Room</>}
            </button>
          </form>
        </div>

        <div className="card flex-1">
          <div className="flex items-center gap-2 mb-4">
            <LogIn size={15} className="text-editor-accent" />
            <h2 className="text-sm font-medium text-editor-text">Join Room</h2>
          </div>
          <form onSubmit={joinRoom} className="space-y-3">
            <input
              className="input-base font-mono"
              placeholder="Room ID or paste link"
              value={joinId}
              onChange={e => setJoinId(e.target.value)}
              required
            />
            <p className="h-[38px] text-xs text-editor-muted leading-5">
              You can request access after entering the room ID.
            </p>
            <button type="submit" disabled={checkingJoin} className="btn-primary w-full flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed">
              {checkingJoin ? 'Checking...' : <><ChevronRight size={13} /> Join</>}
            </button>
          </form>
        </div>
      </div>

      <div className="px-6 max-w-2xl mx-auto w-full pb-12">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={13} className="text-editor-muted" />
          <h2 className="text-xs font-medium text-editor-muted uppercase tracking-wider">
            Active public rooms
          </h2>
        </div>

        {liveRooms.length === 0 && (
          <p className="text-editor-muted text-xs">No active rooms yet. Create one!</p>
        )}

        <div className="space-y-1.5">
          {liveRooms.map(room => (
            <button
              key={room.roomId}
              onClick={() => navigate(`/room/${room.roomId}`)}
              className="w-full flex items-center justify-between px-4 py-3 bg-editor-sidebar border border-editor-border rounded-lg hover:border-editor-accent hover:bg-editor-border/50 transition-all text-left group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: LANG_COLORS[room.language] || '#89b4fa' }}
                />
                <span className="text-sm text-editor-text truncate">{room.name}</span>
                <span className="text-xs text-editor-muted shrink-0">{room.language}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <div className="flex items-center gap-1 text-xs text-editor-muted">
                  <Users size={11} />
                  {room.userCount}
                </div>
                <ChevronRight size={13} className="text-editor-border group-hover:text-editor-accent transition-colors" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {joinAccess?.status === 'request' && (
        <AccessModal title="Join room">
          <p className="text-sm text-editor-muted mb-4">
            The creator needs to approve you before the room opens.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeJoinAccess} className="btn-ghost px-3 py-1.5 text-sm">
              Cancel
            </button>
            <button type="button" onClick={requestJoinAccess} disabled={requestingJoin} className="btn-primary px-3 py-1.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed">
              {requestingJoin ? 'Joining...' : 'Join'}
            </button>
          </div>
        </AccessModal>
      )}

      {joinAccess?.status === 'pending' && (
        <AccessModal title="Waiting to be allowed">
          <p className="text-sm text-editor-muted mb-4">
            Waiting to be allowed by the room creator.
          </p>
          <div className="flex justify-end">
            <button type="button" onClick={closeJoinAccess} className="btn-ghost px-3 py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </AccessModal>
      )}

      {showAuth && (
        <AuthModal
          onClose={() => {
            authSuccessRef.current = null
            setShowAuth(false)
          }}
          onSuccess={() => {
            const afterAuth = authSuccessRef.current
            authSuccessRef.current = null
            setShowAuth(false)
            afterAuth?.()
          }}
        />
      )}
    </div>
  )
}
