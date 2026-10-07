import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { safeNextPath } from '../utils/safeNextPath'
import { DEFAULT_SIGNED_IN_PATH } from '../config/access'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

// How long the gate waits for getSession() before giving up and treating the
// reader as signed out (so a hung auth call never leaves a spinner forever).
const SESSION_TIMEOUT_MS = 8000

// supabase-js keeps the session under `sb-<project>-auth-token`. Removing it is
// the last resort when both sign-out calls fail, so a reload cannot restore it.
function clearStoredSessions() {
  try {
    const keys = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) keys.push(key)
    }
    keys.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // The user whose profile we want. A profile fetch that resolves after the
  // session changed (sign-out, account switch) is dropped.
  const currentUserIdRef = useRef(null)

  useEffect(() => {
    let settled = false
    const settle = () => {
      settled = true
      setLoading(false)
    }

    // Safety net: if getSession never settles, stop blocking the gate.
    const timer = setTimeout(() => {
      if (!settled) {
        console.error('[Auth] Session check timed out')
        settle()
      }
    }, SESSION_TIMEOUT_MS)

    // `loading` is about the SESSION only. The profile loads in the background
    // and never blocks the account gate.
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        setUser(session?.user ?? null)
        currentUserIdRef.current = session?.user?.id ?? null
        settle()
        if (session?.user) fetchProfile(session.user.id)
      })
      .catch((err) => {
        console.error('[Auth] Error getting session:', err?.message || err)
        setSession(null)
        setUser(null)
        currentUserIdRef.current = null
        settle()
      })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      currentUserIdRef.current = session?.user?.id ?? null
      settle()
      if (session?.user) {
        // getSession() above already fetches the profile for the initial session.
        if (event !== 'INITIAL_SESSION') fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => {
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [])

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('[Auth] Error fetching profile:', error)
      }
      if (currentUserIdRef.current !== userId) return
      setProfile(data || null)
    } catch (err) {
      console.error('[Auth] Error fetching profile:', err)
    }
  }

  // `nextPath` is where the email confirmation link should land: the link goes
  // through /auth/callback, which completes the sign-in and then navigates.
  const signUp = async (email, password, nextPath = DEFAULT_SIGNED_IN_PATH) => {
    const safeNext = safeNextPath(nextPath)
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } })
    return { data, error }
  }

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  const signInWithGoogle = async (nextPath = DEFAULT_SIGNED_IN_PATH) => {
    const safeNext = safeNextPath(nextPath)
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          prompt: 'select_account',
        },
      },
    })
    return { data, error }
  }

  // Sign this device out even when the network call fails: on an error, fall
  // back to a local-only sign-out; if that fails too, remove the stored
  // session by hand. The in-memory session is cleared either way.
  const signOut = async () => {
    let error = null
    try {
      const res = await supabase.auth.signOut()
      error = res?.error || null
    } catch (err) {
      error = err
    }
    if (error) {
      let localError = null
      try {
        const res = await supabase.auth.signOut({ scope: 'local' })
        localError = res?.error || null
      } catch (localErr) {
        localError = localErr
      }
      if (localError) {
        console.error('[Auth] Local sign-out failed:', localError?.message || localError)
        clearStoredSessions()
      }
    }
    currentUserIdRef.current = null
    setUser(null)
    setSession(null)
    setProfile(null)
    return { error }
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id)
    }
  }

  const isSubscribed = profile?.subscription_status === 'active'

  const value = {
    user,
    session,
    profile,
    loading,
    isSubscribed,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    refreshProfile
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
