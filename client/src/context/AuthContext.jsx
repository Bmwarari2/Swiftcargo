import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi } from '../api'
import { saveSession, getSession, clearSession } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { token, user: storedUser } = getSession()

    if (token && storedUser) {
      // Optimistically restore from cache and unblock routing immediately.
      // Verifying the token in the background avoids a race condition where a
      // new login saves a fresh token while the old me() call is still pending.
      // If me() then fails it would have cleared the NEW token – causing the
      // "login just refreshes the page" bug.
      setUser(storedUser)
      setLoading(false)

      authApi
        .me()
        .then((res) => {
          const freshUser = res.data.user
          // Only update if this token is still the active one
          const { token: currentToken } = getSession()
          if (currentToken === token) {
            setUser(freshUser)
            saveSession(token, freshUser)
          }
        })
        .catch(() => {
          // Only invalidate the session if no new login has replaced the token
          const { token: currentToken } = getSession()
          if (currentToken === token) {
            clearSession()
            setUser(null)
          }
        })
    } else {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await authApi.login(email, password)
    const { token, user: loggedInUser } = res.data
    saveSession(token, loggedInUser)
    setUser(loggedInUser)
    return loggedInUser
  }, [])

  const register = useCallback(
    async (name, email, phone, password, referralCode = null) => {
      const res = await authApi.register(name, email, phone, password, referralCode)
      const { token, user: newUser } = res.data
      saveSession(token, newUser)
      setUser(newUser)
      return newUser
    },
    []
  )

  const logout = useCallback(() => {
    clearSession()
    setUser(null)
  }, [])

  const updateProfile = useCallback(async (data) => {
    const res = await authApi.updateProfile(data)
    const updatedUser = res.data.user
    const { token } = getSession()
    saveSession(token, updatedUser)
    setUser(updatedUser)
    return updatedUser
  }, [])

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    updateProfile,
    isAdmin: user?.role === 'admin',
    isAuthenticated: !!user,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}

export default AuthContext

