const api = require('./api')
const auth = require('./auth')
const STORAGE_KEY = 'takeaway_pay_state_v1'
const ORDER_DURATION = 15 * 60 * 1000
const emptyAgent = { id: '', name: '', username: '', contact: '', phone: '', balance: 0, enabled: true }
const seedState = {
  schemaVersion: 3,
  merchant: { ...emptyAgent },
  merchants: [], admins: [], orders: [], withdrawals: [], ledger: [], user: null,
  settings: { reviewMode: '人工审核后结算', payoutAccount: '微信账户', merchantWithdrawEnabled: true, notifyOnPending: true, pendingAlertThreshold: 3, reviewTimeoutAction: '自动审核通过' },
  currentAgentId: ''
}

function loadState() {
  if (typeof wx === 'undefined' || !wx.getStorageSync) return JSON.parse(JSON.stringify(seedState))
  const saved = wx.getStorageSync(STORAGE_KEY)
  if (!saved || saved.schemaVersion !== 3 || !saved.orders || !saved.merchants) return JSON.parse(JSON.stringify(seedState))
  return { ...seedState, ...saved, settings: { ...seedState.settings, ...(saved.settings || {}) }, currentAgentId: saved.currentAgentId || '' }
}

const state = loadState()
state.cloud = { enabled: false, synced: false, lastError: '' }

function persist() { if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync(STORAGE_KEY, state) }

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let value = ''
  for (let index = 0; index < 10; index += 1) value += chars[Math.floor(Math.random() * chars.length)]
  return value
}

function cloudCall(action, data, onSuccess) {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) return
  state.cloud.enabled = true
  api[action](data || {}).then(result => {
    state.cloud.synced = true
    state.cloud.lastError = ''
    if (onSuccess) onSuccess(result)
    persist()
  }).catch(error => {
    state.cloud.lastError = error.message || '云端同步失败'
    persist()
    if (typeof wx !== 'undefined' && wx.showToast) wx.showToast({ title: error.message || '云端同步失败', icon: 'none' })
  })
}

function hydrate() {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) return Promise.resolve(false)
  state.cloud.enabled = true
  return api.bootstrap().then(snapshot => {
    if (!snapshot) return false
    state.merchants = snapshot.merchants || []
    state.admins = snapshot.admins || []
    state.orders = snapshot.orders || []
    state.withdrawals = snapshot.withdrawals || []
    state.ledger = snapshot.ledger || []
    state.settings = { ...state.settings, ...(snapshot.settings || {}) }
    state.user = snapshot.user || auth.getSession()
    const session = auth.getSession()
    if (session && session.role === 'agent') state.currentAgentId = session.id
    else state.currentAgentId = snapshot.currentAgentId || (state.merchants[0] && state.merchants[0].id) || ''
    state.merchant = getAgent(state.currentAgentId) || snapshot.merchant || { ...emptyAgent }
    state.cloud.synced = true
    state.cloud.lastError = ''
    persist()
    return true
  }).catch(error => {
    state.cloud.lastError = error.message || '云端初始化失败'
    persist()
    throw error
  })
}

function toast(title, icon = 'none') { if (typeof wx !== 'undefined' && wx.showToast) wx.showToast({ title, icon, duration: 1600 }) }
function getAgent(agentId = state.currentAgentId) { return state.merchants.find(m => m.id === agentId) || null }
function getCurrentAgent() { return getAgent() || state.merchant || { ...emptyAgent } }
function getAgentOrders(agentId = state.currentAgentId) { return state.orders.filter(o => o.merchantId === agentId) }
function getAgentWithdrawals(agentId = state.currentAgentId) { return state.withdrawals.filter(w => w.merchantId === agentId) }
function getAgentLedger(agentId = state.currentAgentId) { return state.ledger.filter(item => item.merchantId === agentId) }
function getPendingWithdrawAmount(agentId = state.currentAgentId) { return getAgentWithdrawals(agentId).filter(w => ['待审核', '待打款'].includes(w.status)).reduce((sum, w) => sum + Number(w.amount || 0), 0) }
function getAgentAvailableBalance(agentId = state.currentAgentId) { const agent = getAgent(agentId); if (!agent) return 0; const pendingReview = getAgentWithdrawals(agentId).filter(w => w.status === '待审核').reduce((sum, w) => sum + Number(w.amount || 0), 0); return Math.max(0, Number(agent.balance || 0) - pendingReview) }
function findOrder(id) { return state.orders.find(o => o.id === id) || null }
function syncMerchant(id) { const agent = getAgent(id); if (agent && id === state.currentAgentId) state.merchant = agent }

function createOrder(data, agentId = state.currentAgentId) {
  const agent = getAgent(agentId)
  if (!agent || !agent.id) { toast('请选择结算代理人'); return null }
  const order = { id: `OD${Date.now()}`, shareToken: `ST${Date.now()}${Math.floor(Math.random() * 100000)}`, merchantId: agent.id, merchant: data.merchant, item: data.item, detail: data.detail || '规格待确认', payAmount: data.payAmount, settleAmount: data.settleAmount || data.payAmount, status: '待客户付款', expiresAt: Date.now() + ORDER_DURATION, imagePath: data.imagePath || '', paid: false }
  state.orders.unshift(order); persist()
  cloudCall('createOrder', { ...data, agentId, orderId: order.id, shareToken: order.shareToken }, remoteOrder => {
    const index = state.orders.findIndex(item => item.id === order.id)
    if (index >= 0 && remoteOrder) state.orders[index] = { ...state.orders[index], ...remoteOrder, id: remoteOrder.id || order.id }
  })
  return order
}

function submitPaid(id, extra = {}) {
  const order = findOrder(id)
  if (order) {
    order.paid = true
    order.userWechatName = order.userWechatName || '微信用户'
    order.paidAt = Date.now()
    order.reviewExpiresAt = Date.now() + 10 * 60 * 1000
    order.status = '待审核'
    persist()
  }
  cloudCall('submitPayment', { orderId: id, token: extra.token || (order && order.shareToken) || '', userWechatName: extra.userWechatName || (order && order.userWechatName) || '微信用户', paymentProof: extra.paymentProof || '', paymentReference: extra.paymentReference || '' })
  return order || { id, status: '待审核' }
}

function approveOrder(id, pass) {
  const order = findOrder(id)
  if (!order || !['待审核', '待客户付款'].includes(order.status)) return order
  order.status = pass ? '已审核' : '已驳回'
  if (pass && !order.settled) {
    const agent = getAgent(order.merchantId)
    order.settled = true
    if (agent) {
      agent.balance = Number(agent.balance || 0) + Number(order.settleAmount || 0)
      state.ledger.unshift({ id: `LG${Date.now()}`, merchantId: agent.id, title: `订单 ${order.id} 结算入账`, amount: `+${Number(order.settleAmount || 0).toFixed(2)}`, type: '收入', time: '刚刚' })
      syncMerchant(agent.id)
    }
  }
  persist()
  cloudCall('reviewPayment', { orderId: id, pass })
  return order
}

function applyWithdraw(amount, data = {}, agentId = state.currentAgentId) {
  const agent = getAgent(agentId)
  const value = Number(amount)
  if (!agent || !state.settings.merchantWithdrawEnabled || !value || value <= 0 || value > getAgentAvailableBalance(agentId)) return null
  const item = { id: `TX${Date.now()}`, merchantId: agent.id, agentName: agent.name || agent.username, amount: value.toFixed(2), status: '待审核', method: data.method || state.settings.payoutAccount || '微信账户', account: data.account || agent.phone || agent.contact || '', note: data.note || '', createdAt: '刚刚' }
  state.withdrawals.unshift(item); persist()
  cloudCall('applyWithdrawal', { ...data, amount: value, withdrawalId: item.id })
  return item
}

function reviewWithdraw(id, pass, reason = '') {
  const item = state.withdrawals.find(w => w.id === id)
  if (!item || item.status !== '待审核') return item
  item.status = pass ? '待打款' : '已驳回'
  item.reviewedAt = '刚刚'
  if (!pass) item.rejectReason = reason || '未填写驳回原因'
  if (pass) {
    const agent = getAgent(item.merchantId)
    if (agent) {
      agent.balance = Math.max(0, Number(agent.balance || 0) - Number(item.amount))
      state.ledger.unshift({ id: `LG${Date.now()}`, merchantId: agent.id, title: `提现 ${item.id}`, amount: `-${Number(item.amount).toFixed(2)}`, type: '提现', time: '刚刚' })
      syncMerchant(agent.id)
    }
  }
  persist()
  cloudCall('reviewWithdrawal', { withdrawalId: id, pass, reason })
  return item
}

function completeWithdraw(id, proof = '') {
  const item = state.withdrawals.find(w => w.id === id)
  if (!item || item.status !== '待打款') return item
  item.status = '已完成'
  item.paidAt = '刚刚'
  if (proof) item.paymentProof = proof
  persist()
  cloudCall('completeWithdrawal', { withdrawalId: id, proof })
  return item
}

function createMerchant(data) {
  const password = data.password || generatePassword()
  const username = data.username || data.name
  const merchant = { id: `m${Date.now()}`, role: 'agent', name: data.name || username, username, usernameLower: String(username || '').toLowerCase(), contact: data.contact || '', phone: data.phone, email: data.email || '', note: data.note || '', balance: 0, enabled: true, mustChangePassword: true }
  return api.createAgent({ ...data, id: merchant.id, password }).then(result => {
    const remote = (result && (result.user || result)) || {}
    const saved = { ...merchant, ...remote, id: remote.id || merchant.id }
    state.merchants.unshift(saved)
    persist()
    return { ...saved, defaultPassword: (result && result.initialPassword) || password }
  })
}

function updateMerchant(id, patch) {
  const { password, ...safe } = patch || {}
  const merchant = state.merchants.find(m => m.id === id)
  if (merchant) Object.assign(merchant, safe)
  syncMerchant(id); persist()
  cloudCall('updateAgent', { id, ...patch })
  return merchant
}

function createAdmin(data) {
  const password = data.password || generatePassword()
  const username = data.username
  const admin = { id: `a${Date.now()}`, role: data.role === 'super_admin' ? 'super_admin' : 'admin', name: data.name || username, username, usernameLower: String(username || '').toLowerCase(), phone: data.phone || '', email: data.email || '', department: data.department || '', note: data.note || '', enabled: true, mustChangePassword: true }
  return api.createAdmin({ ...data, id: admin.id, password }).then(result => {
    const remote = (result && (result.user || result)) || {}
    const saved = { ...admin, ...remote, id: remote.id || admin.id }
    state.admins.unshift(saved)
    persist()
    return { ...saved, defaultPassword: (result && result.initialPassword) || password }
  })
}

function resetAdminPassword(id) {
  const password = generatePassword()
  return api.updateAdmin({ id, password }).then(() => password)
}

function updateAdmin(id, patch) {
  const { password, ...safe } = patch || {}
  const admin = state.admins.find(item => item.id === id)
  if (admin) Object.assign(admin, safe)
  persist()
  cloudCall('updateAdmin', { id, ...patch })
  return admin
}

function updateProfile(patch) {
  const session = auth.getSession()
  const agent = session && session.role === 'agent' ? getAgent(session.id) : null
  if (agent) Object.assign(agent, patch)
  const admin = state.admins.find(item => item.id === (session && session.id))
  if (admin) Object.assign(admin, patch)
  persist()
  cloudCall('updateProfile', patch, user => {
    if (!user || user.role !== 'agent') return
    const index = state.merchants.findIndex(item => item.id === user.id)
    if (index >= 0) state.merchants[index] = { ...state.merchants[index], ...user }
    syncMerchant(user.id)
  })
  return patch
}

function updateSettings(patch) { Object.assign(state.settings, patch); persist(); cloudCall('updateSettings', { patch }); return state.settings }

function processReviewTimeouts(now = Date.now()) {
  const action = state.settings.reviewTimeoutAction || '自动审核通过'
  let changed = false
  state.orders.filter(o => o.status === '待审核' && o.reviewExpiresAt && o.reviewExpiresAt <= now).forEach(order => {
    approveOrder(order.id, action === '自动审核通过')
    changed = true
  })
  if (changed) persist()
  return changed
}

function clearDemoState() { if (typeof wx !== 'undefined' && wx.removeStorageSync) wx.removeStorageSync(STORAGE_KEY) }

module.exports = {
  state, toast, hydrate, getAgent, getCurrentAgent, getAgentOrders, getAgentWithdrawals, getAgentLedger,
  getPendingWithdrawAmount, getAgentAvailableBalance, findOrder, createOrder, submitPaid, approveOrder,
  processReviewTimeouts, applyWithdraw, reviewWithdraw, completeWithdraw, createMerchant, updateMerchant,
  createAdmin, updateAdmin, resetAdminPassword, updateProfile, updateSettings, persist, clearDemoState, generatePassword, ORDER_DURATION
}
