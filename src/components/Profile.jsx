import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getSavedLocation } from '../services/district'
import '../styles/Profile.css'

function Profile() {
  const { user, updateProfile, logout } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || ''
  })
  const savedLocation = getSavedLocation()

  const handleSubmit = (e) => {
    e.preventDefault()
    updateProfile(formData)
    setIsEditing(false)
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h2>Your Profile</h2>
      </div>

      <div className="profile-content">
        <div className="profile-section">
          <h3>Account Information</h3>
          {isEditing ? (
            <form onSubmit={handleSubmit} className="profile-form">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="save-button">Save Changes</button>
                <button type="button" onClick={() => setIsEditing(false)} className="cancel-button">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="profile-info">
              <div className="info-item">
                <span className="info-label">Name</span>
                <span className="info-value">{user?.name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Email</span>
                <span className="info-value">{user?.email}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Member Since</span>
                <span className="info-value">
                  {new Date(user?.createdAt).toLocaleDateString()}
                </span>
              </div>
              <button onClick={() => setIsEditing(true)} className="edit-button">
                Edit Profile
              </button>
            </div>
          )}
        </div>

        {savedLocation.state && (
          <div className="profile-section">
            <h3>Your Location</h3>
            <div className="info-item">
              <span className="info-label">State</span>
              <span className="info-value">{savedLocation.state}</span>
            </div>
            {savedLocation.district && (
              <div className="info-item">
                <span className="info-label">District</span>
                <span className="info-value">District {parseInt(savedLocation.district)}</span>
              </div>
            )}
          </div>
        )}

        <div className="profile-section danger-zone">
          <h3>Account Actions</h3>
          <button onClick={logout} className="logout-button">
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}

export default Profile
