import { useState } from 'react'
import { X, LogIn, UserPlus, Loader2 } from 'lucide-react'
import useAuthStore from '../../context/authStore'

export default function AuthModal({ onClose }) {
  const [tab,      setTab]      = useState('login')   // 'login' | 'register'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')

  const { login, register, loading, error } = useAuthStore()

  async function handleSubmit(e) {
    e.preventDefault()
    let ok
    if (tab === 'login') {
      ok = await login(email, password)
    } else {
      ok = await register(username, email, password)
    }
    if (ok) onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-editor-sidebar border border-editor-border rounded-xl w-full max-w-sm shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-editor-border">
          <div className="flex gap-1 p-0.5 bg-editor-bg rounded-lg">
            {['login', 'register'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs rounded-md transition-all font-medium ${
                  tab === t
                    ? 'bg-editor-sidebar text-editor-text shadow-sm'
                    : 'text-editor-muted hover:text-editor-text'
                }`}
              >
                {t === 'login' ? 'Sign in' : 'Register'}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-editor-muted hover:text-editor-text transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {tab === 'register' && (
            <div>
              <label className="block text-xs text-editor-muted mb-1.5">Username</label>
              <input
                className="input-base"
                placeholder="coolcoder42"
                value={username}
                onChange={e => setUsername(e.target.value)}
                minLength={2}
                maxLength={32}
                required
                autoFocus
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-editor-muted mb-1.5">Email</label>
            <input
              type="email"
              className="input-base"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus={tab === 'login'}
            />
          </div>

          <div>
            <label className="block text-xs text-editor-muted mb-1.5">Password</label>
            <input
              type="password"
              className="input-base"
              placeholder={tab === 'register' ? 'Min 6 characters' : '••••••••'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>

          {error && (
            <p className="text-xs text-editor-red bg-red-900/20 border border-red-900/30 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 mt-1"
          >
            {loading
              ? <><Loader2 size={14} className="animate-spin" /> Please wait…</>
              : tab === 'login'
                ? <><LogIn size={14} /> Sign in</>
                : <><UserPlus size={14} /> Create account</>
            }
          </button>

          <p className="text-center text-xs text-editor-muted pt-1">
            {tab === 'login'
              ? <>No account? <button type="button" onClick={() => setTab('register')} className="text-editor-accent hover:underline">Register</button></>
              : <>Already registered? <button type="button" onClick={() => setTab('login')} className="text-editor-accent hover:underline">Sign in</button></>
            }
          </p>
        </form>
      </div>
    </div>
  )
}
