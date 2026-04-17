import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import toast from 'react-hot-toast'
import axios from 'axios'
import CollabEditor from '../Editor/CollabEditor'
import Toolbar from './Toolbar'
import UserList from './UserList'
import OutputPanel from './OutputPanel'
import ChatPanel from './ChatPanel'
import { CODE_SKELETONS } from '../../utils/codeSkeletons'
import { getApiBaseUrl, getWsBaseUrl } from '../../utils/runtimeConfig'

const API = getApiBaseUrl()
const WS  = getWsBaseUrl()

export default function RoomPage() {
  const { roomId } = useParams()
  const navigate   = useNavigate()

  const socketRef   = useRef(null)
  const codeRef     = useRef('')
  const usernameRef = useRef('')
  const editorRef   = useRef(null)

  const isSkeletonRef = useRef(true)

  // ✅ per-language memory
  const codeMapRef = useRef({
    javascript: '',
    java: '',
    python: ''
  })

  // ✅ modal state
  const [pendingLanguage, setPendingLanguage] = useState(null)
  const [showLangConfirm, setShowLangConfirm] = useState(false)

  const [status, setStatus] = useState('connecting')
  const [users, setUsers] = useState([])
  const [language, setLanguage] = useState('javascript')
  const [initialContent, setInitialContent] = useState('')
  const [initialRevision, setInitialRevision] = useState(0)
  const [showOutput, setShowOutput] = useState(false)
  const [output, setOutput] = useState(null)
  const [executing, setExecuting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [showChat, setShowChat] = useState(false)

  // ── Socket lifecycle ─────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token')
    const username = localStorage.getItem('username')
      || `Guest_${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    usernameRef.current = username

    const socket = io(WS, {
      auth: { token, username },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 6,
      reconnectionDelay: 1500,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join-room', { roomId })
    })

    socket.on('room-state', ({ content, revision, language: lang, users: roomUsers }) => {
      const skeleton = CODE_SKELETONS[lang] || ''
      const contentToSet = content || skeleton

      codeRef.current = contentToSet
      codeMapRef.current[lang] = contentToSet

      setInitialContent(contentToSet)
      setInitialRevision(revision)
      setLanguage(lang)
      setUsers(roomUsers || [])

      isSkeletonRef.current = contentToSet.includes('__SKELETON__')

      setStatus('live')
    })

    socket.on('user-joined', (user) => {
      setUsers(prev => {
        if (prev.find(u => u.socketId === user.socketId)) return prev
        return [...prev, user]
      })
      toast(`${user.username} joined`, { icon: '👋' })
    })

    socket.on('user-left', ({ socketId, username: name }) => {
      setUsers(prev => prev.filter(u => u.socketId !== socketId))
      if (name) toast(`${name} left`, { icon: '🚪' })
    })

    socket.on('language-change', ({ language: lang, changedBy }) => {
      const newCode =
        codeMapRef.current[lang] ||
        CODE_SKELETONS[lang] ||
        ''

      setLanguage(lang)
      setInitialContent(newCode)
      codeRef.current = newCode

      isSkeletonRef.current = newCode.includes('__SKELETON__')

      setTimeout(() => {
        editorRef.current?.setContent(newCode)
      }, 100)

      toast(`${changedBy} → ${lang}`, { icon: '🔤' })
    })

    socket.on('room-ended', ({ message }) => {
      toast.success(message || 'Room ended')
      setEnding(false)
      setTimeout(() => navigate('/'), 1000)
    })

    socket.on('room-error', ({ message }) => {
      toast.error(message)
      setEnding(false)
    })

    socket.on('error', ({ message }) => {
      toast.error(message)
      setStatus('error')
      setTimeout(() => navigate('/'), 2000)
    })

    socket.on('connect_error', (err) => {
      setStatus('error')
      toast.error(`Connection error: ${err.message}`)
    })

    socket.on('disconnect', (reason) => {
      if (reason !== 'io client disconnect') {
        setStatus('connecting')
        toast('Reconnecting…', { icon: '🔄' })
      }
    })

    socket.on('reconnect', () => {
      setStatus('live')
      toast.success('Reconnected')
      socket.emit('join-room', { roomId })
    })

    return () => socket.disconnect()
  }, [roomId, navigate])

  useEffect(() => {
    let cancelled = false

    async function verifyRoom() {
      try {
        await axios.get(`${API}/api/rooms/${roomId}`)
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        toast.error(err.response?.data?.error || 'Room not found')
      }
    }

    verifyRoom()

    return () => {
      cancelled = true
    }
  }, [roomId])

  // ── Apply language change ─────────────────────────────────────────
  const applyLanguageChange = (lang) => {
    const newCode =
      codeMapRef.current[lang] ||
      CODE_SKELETONS[lang] ||
      ''

    setLanguage(lang)
    socketRef.current?.emit('language-change', { language: lang })

    setInitialContent(newCode)
    codeRef.current = newCode

    isSkeletonRef.current = newCode.includes('__SKELETON__')

    setTimeout(() => {
      editorRef.current?.setContent(newCode)
    }, 100)
  }

  // ── Language change trigger ───────────────────────────────────────
  const handleLanguageChange = useCallback((lang) => {
    codeMapRef.current[language] = codeRef.current

    if (!isSkeletonRef.current) {
      setPendingLanguage(lang)
      setShowLangConfirm(true)
      return
    }

    applyLanguageChange(lang)
  }, [language])

  const confirmLanguageChange = () => {
    if (!pendingLanguage) return
    applyLanguageChange(pendingLanguage)
    setPendingLanguage(null)
    setShowLangConfirm(false)
  }

  const cancelLanguageChange = () => {
    setPendingLanguage(null)
    setShowLangConfirm(false)
  }

  // ── Code change ───────────────────────────────────────────────────
  const handleCodeChange = useCallback((val) => {
    const newVal = val || ''
    codeRef.current = newVal
    codeMapRef.current[language] = newVal

    if (isSkeletonRef.current && newVal) {
      if (!newVal.includes('__SKELETON__')) {
        isSkeletonRef.current = false
      }
    }
  }, [language])

  // ── Run code ──────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    setExecuting(true)
    setShowOutput(true)
    setOutput(null)

    try {
      const { data } = await axios.post(`${API}/api/execute`, {
        code: codeRef.current,
        language,
      })
      setOutput(data)
    } catch (err) {
      setOutput({
        stdout: '',
        stderr: err.response?.data?.error || 'Execution failed',
        exitCode: -1,
        executionTime: 0,
      })
    } finally {
      setExecuting(false)
    }
  }, [language])

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Room link copied!')
  }, [])

  const handleEndRoom = useCallback(() => {
    if (!socketRef.current) return
    setEnding(true)
    socketRef.current.emit('end-room')
  }, [])

  // ── UI ───────────────────────────────────────────────────────────
  if (status === 'connecting') return <div className="h-screen flex items-center justify-center">Connecting...</div>
  if (status === 'error') return <div className="h-screen flex items-center justify-center">Room not found</div>

  return (
    <div className="flex flex-col h-screen bg-editor-bg">

      <Toolbar
        roomId={roomId}
        language={language}
        onLanguageChange={handleLanguageChange}
        onRun={handleRun}
        onCopyLink={handleCopyLink}
        onEndRoom={handleEndRoom}
        executing={executing}
        ending={ending}
        connected={status === 'live'}
        userCount={users.length}
        showOutput={showOutput}
        onToggleOutput={() => setShowOutput(v => !v)}
        showChat={showChat}
        onToggleChat={() => setShowChat(v => !v)}
      />

      <div className="flex flex-1 overflow-hidden">
        <CollabEditor
          ref={editorRef}
          socket={socketRef.current}
          roomId={roomId}
          language={language}
          initialContent={initialContent}
          initialRevision={initialRevision}
          onCodeChange={handleCodeChange}
        />

        {showChat ? (
          <ChatPanel
            socket={socketRef.current}
            roomId={roomId}
            username={usernameRef.current}
            onClose={() => setShowChat(false)}
          />
        ) : (
          <UserList users={users} />
        )}
      </div>

      {showOutput && (
        <OutputPanel
          output={output}
          executing={executing}
          onClose={() => setShowOutput(false)}
          onRun={handleRun}
        />
      )}

      {/* ✅ CUSTOM MODAL */}
      {showLangConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-editor-bg border rounded-lg p-6 w-[320px] shadow-xl">
            <h3 className="text-white text-lg font-semibold mb-2">
              Switch Language?
            </h3>

            <p className="text-gray-400 text-sm mb-4">
              Your current code will be replaced.
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={cancelLanguageChange}
                className="px-3 py-1.5 text-sm bg-gray-700 rounded"
              >
                Cancel
              </button>

              <button
                onClick={confirmLanguageChange}
                className="px-3 py-1.5 text-sm bg-editor-accent text-white rounded"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
