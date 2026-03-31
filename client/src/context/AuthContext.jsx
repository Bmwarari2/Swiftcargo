import React, { createContext, useState, useContext, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadUser = async () => {
      if (token) {
        try {
          const response = await axios.get('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          })
          setUser(response.data.user)
        } catch (err) {
          localStorage.removeItem('token')
          setToken(null)
        }
      }
      setLoading(false)
    }

    loadUser()
  }, [token])

  const login = async (email, password) => {
    try {
      setError(null)
      const response = await axios.post('/api/auth/login', {
        email,
        password,
      })
      const { token: newToken, user: userData } = response.data
      localStorage.setItem('token', newToken)
      setToken(newToken)
      setUser(userData)
      return userData
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed'
      setError(message)
      throw new Error(message)
    }
  }

  const register = async (name, email, phone, password, referralCode = null) => {
    try {
      setError(null)
      const response = await axios.post('/api/auth/register', {
        name,
        email,
        phone,
        password,
        referralCode,
      })
      const { token: newToken, user: userData } = response.data
      localStorage.setItem('token', newToken)
      setToken(newToken)
      setUser(userData)
      return userData
    } catch (err) {
      const message = err.response?.data?.message || 'Registration failed'
      setError(message)
      throw new Error(message)
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }

  const updateProfile = async (updates) => {
    try {
      setError(null)
      const response = await axios.put('/api/auth/profile', updates, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setUser(response.data.user)
      return response.data.user
    } catch (err) {
      const message = err.response?.data?.message || 'Update failed'
      setError(message)
      throw new Error(message)
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      error,
      login,
      register,
      logout,
      updateProfile,
      isAuthenticated: !!user,
      isAdmin: user?.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
