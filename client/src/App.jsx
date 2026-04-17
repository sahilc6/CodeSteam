import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import HomePage  from './components/UI/HomePage'
import RoomPage  from './components/Room/RoomPage'
import NotFound  from './components/UI/NotFound'
import useAuthStore from './context/authStore'

export default function App() {
  const init = useAuthStore(s => s.init)

  // Restore auth session on first load
  useEffect(() => { init() }, [init])

  return (
    <Routes>
      <Route path="/"              element={<HomePage />} />
      <Route path="/room/:roomId"  element={<RoomPage  />} />
      <Route path="/404"           element={<NotFound  />} />
      <Route path="*"              element={<Navigate to="/404" replace />} />
    </Routes>
  )
}
