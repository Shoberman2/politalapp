import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is logged in from localStorage
    const savedUser = localStorage.getItem('user')
    if (savedUser) {
      setUser(JSON.parse(savedUser))
    }
    setLoading(false)
  }, [])

  const signUp = (email, password, name) => {
    // Simulate sign up - in production, this would call your backend API
    const newUser = {
      id: Date.now(),
      email,
      name,
      createdAt: new Date().toISOString()
    }
    setUser(newUser)
    localStorage.setItem('user', JSON.stringify(newUser))
    return newUser
  }

  const login = (email, password) => {
    // Simulate login - in production, this would call your backend API
    const existingUser = localStorage.getItem('user')
    if (existingUser) {
      const userData = JSON.parse(existingUser)
      setUser(userData)
      return userData
    }

    // For demo purposes, create a user if none exists
    const newUser = {
      id: Date.now(),
      email,
      name: email.split('@')[0],
      createdAt: new Date().toISOString()
    }
    setUser(newUser)
    localStorage.setItem('user', JSON.stringify(newUser))
    return newUser
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('user')
  }

  const updateProfile = (updates) => {
    const updatedUser = { ...user, ...updates }
    setUser(updatedUser)
    localStorage.setItem('user', JSON.stringify(updatedUser))
  }

  const value = {
    user,
    loading,
    signUp,
    login,
    logout,
    updateProfile,
    isAuthenticated: !!user
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
