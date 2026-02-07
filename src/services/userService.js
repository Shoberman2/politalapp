// User service for managing user data (location, favorites)
// Uses localStorage for now, can be upgraded to Supabase

const USER_DATA_KEY = 'userData'

// Get all user data
export const getUserData = () => {
  try {
    const data = localStorage.getItem(USER_DATA_KEY)
    return data ? JSON.parse(data) : {}
  } catch {
    return {}
  }
}

// Save user data
const saveUserData = (data) => {
  localStorage.setItem(USER_DATA_KEY, JSON.stringify(data))
}

// Save user address
export const saveUserAddress = (address) => {
  const data = getUserData()
  data.address = address
  saveUserData(data)
  console.log('[UserService] Saved address:', address)
  return address
}

// Get user address
export const getUserAddress = () => {
  const data = getUserData()
  return data.address || null
}

// Clear user address
export const clearUserAddress = () => {
  const data = getUserData()
  delete data.address
  saveUserData(data)
}

// Add politician to favorites
export const addFavorite = (politician) => {
  const data = getUserData()
  if (!data.favorites) {
    data.favorites = []
  }

  // Check if already favorited
  if (!data.favorites.find(f => f.bioguideId === politician.bioguideId)) {
    data.favorites.push({
      bioguideId: politician.bioguideId,
      name: politician.name,
      party: politician.party || politician.partyName,
      state: politician.state,
      chamber: politician.chamber,
      addedAt: new Date().toISOString()
    })
    saveUserData(data)
    console.log('[UserService] Added favorite:', politician.name)
  }
  return data.favorites
}

// Remove politician from favorites
export const removeFavorite = (bioguideId) => {
  const data = getUserData()
  if (data.favorites) {
    data.favorites = data.favorites.filter(f => f.bioguideId !== bioguideId)
    saveUserData(data)
    console.log('[UserService] Removed favorite:', bioguideId)
  }
  return data.favorites || []
}

// Get all favorites
export const getFavorites = () => {
  const data = getUserData()
  return data.favorites || []
}

// Check if politician is favorited
export const isFavorite = (bioguideId) => {
  const favorites = getFavorites()
  return favorites.some(f => f.bioguideId === bioguideId)
}

// Toggle favorite status
export const toggleFavorite = (politician) => {
  if (isFavorite(politician.bioguideId)) {
    removeFavorite(politician.bioguideId)
    return false
  } else {
    addFavorite(politician)
    return true
  }
}
