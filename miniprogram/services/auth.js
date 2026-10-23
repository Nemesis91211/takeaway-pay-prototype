const SESSION_KEY = 'takeaway_session_v1'
const ADMIN_ROLES = ['super_admin', 'admin']

function readSession() {
  if (typeof wx === 'undefined' || !wx.getStorageSync) return null
  const saved = wx.getStorageSync(SESSION_KEY)
  return saved && saved.id && saved.role ? saved : null
}

let session = readSession()

function getSession() { return session }

function setSession(user) {
  if (!user || !user.id || !user.role) {
    session = null
    if (typeof wx !== 'undefined' && wx.removeStorageSync) wx.removeStorageSync(SESSION_KEY)
    return null
  }
  const { passwordHash, openid, ...safe } = user
  session = safe
  if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync(SESSION_KEY, safe)
  return session
}

function clearSession() {
  session = null
  if (typeof wx !== 'undefined' && wx.removeStorageSync) wx.removeStorageSync(SESSION_KEY)
}

function isAdmin() { return !!session && ADMIN_ROLES.includes(session.role) }
function isSuperAdmin() { return !!session && session.role === 'super_admin' }

function homePath() {
  if (!session) return '/pages/login/index'
  return session.role === 'agent' ? '/pages/merchant/index' : '/pages/admin/index'
}

function ensureRole(roles) {
  if (session && roles.includes(session.role)) return true
  clearSession()
  wx.reLaunch({ url: '/pages/login/index' })
  return false
}

function ensureAdmin() { return ensureRole(ADMIN_ROLES) }
function ensureSuperAdmin() { return ensureRole(['super_admin']) }
function ensureAgent() { return ensureRole(['agent']) }

function logout() {
  const api = require('./api')
  api.logout().catch(() => {})
  clearSession()
  wx.reLaunch({ url: '/pages/login/index' })
}

module.exports = {
  getSession,
  setSession,
  clearSession,
  isAdmin,
  isSuperAdmin,
  homePath,
  ensureRole,
  ensureAdmin,
  ensureSuperAdmin,
  ensureAgent,
  logout
}
