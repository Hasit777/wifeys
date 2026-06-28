import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg, #fff7f9, #ffecef)',
          color: '#2b1b22',
          fontFamily: 'Inter, sans-serif',
          fontSize: '0.95rem',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>💖</div>
          <div>Loading your space...</div>
        </div>
      </div>
    )
  }

  return user ? children : <Navigate to="/" replace />
}