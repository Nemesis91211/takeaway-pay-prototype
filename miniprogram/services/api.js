// 后端接口适配层：页面只依赖这里，后续可在不改页面的情况下切换云开发或独立 API。
const SESSION_KEY = 'takeaway_session_v1'

function invoke(action, data = {}) {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) return Promise.reject(new Error('云开发未初始化'))
  return wx.cloud.callFunction({ name: 'takeawayApi', data: { action, ...data } }).then(res => {
    const result = res.result || {}
    if (result.success === false) {
      const error = new Error(result.error || '云端接口调用失败')
      error.code = result.code || ''
      if (error.code === 'UNAUTHENTICATED') {
        wx.removeStorageSync(SESSION_KEY)
        const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
        const current = pages.length ? pages[pages.length - 1].route : ''
        if (current !== 'pages/login/index') wx.reLaunch({ url: '/pages/login/index' })
      }
      throw error
    }
    return result.data === undefined ? result : result.data
  })
}

function uploadAvatar(filePath) {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.uploadFile) return Promise.reject(new Error('云开发未初始化'))
  const match = /\.([a-zA-Z0-9]+)(?:\?|$)/.exec(filePath)
  const ext = match ? match[1].toLowerCase() : 'png'
  const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`
  return wx.cloud.uploadFile({ cloudPath, filePath }).then(res => res.fileID)
}

module.exports = {
  login: data => invoke('login', data),
  getSession: () => invoke('getSession'),
  logout: () => invoke('logout'),
  changePassword: data => invoke('changePassword', data),
  updateProfile: data => invoke('updateProfile', data),
  uploadAvatar,
  bootstrap: () => invoke('bootstrap'),
  getAgentOverview: () => invoke('getAgentOverview'),
  getAgentOrders: params => invoke('getAgentOrders', params),
  getAgentWallet: () => invoke('getAgentWallet'),
  getAgentWithdrawals: params => invoke('getAgentWithdrawals', params),
  updateAgentProfile: data => invoke('updateAgentProfile', data),
  getAdminOverview: () => invoke('getAdminOverview'),
  listAdmins: () => invoke('listAdmins'),
  createAdmin: data => invoke('createAdmin', data),
  updateAdmin: data => invoke('updateAdmin', data),
  createAgent: data => invoke('createAgent', data),
  updateAgent: data => invoke('updateAgent', data),
  createOrder: data => invoke('createOrder', data),
  getSharedOrder: token => invoke('getSharedOrder', { token }),
  submitPayment: data => invoke('submitPayment', data),
  reviewPayment: data => invoke('reviewPayment', data),
  applyWithdrawal: data => invoke('applyWithdrawal', data),
  reviewWithdrawal: data => invoke('reviewWithdrawal', data),
  completeWithdrawal: data => invoke('completeWithdrawal', data),
  updateSettings: data => invoke('updateSettings', data),
  listAuditLogs: params => invoke('listAuditLogs', params || {}),
  cleanExpiredOrders: () => invoke('cleanExpiredOrders')
}
