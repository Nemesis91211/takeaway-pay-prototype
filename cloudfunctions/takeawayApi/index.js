const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const COLLECTIONS = ['users', 'orders', 'withdrawals', 'ledger', 'settings', 'audit_logs']

const ROLE_SUPER = 'super_admin'
const ROLE_ADMIN = 'admin'
const ROLE_AGENT = 'agent'
const ADMIN_ROLES = [ROLE_SUPER, ROLE_ADMIN]
const SEED_ADMIN_USERNAME = 'admin'
const SEED_ADMIN_PASSWORD = 'Takeaway@123'
const SEED_ADMIN_HASH = hashPassword(SEED_ADMIN_PASSWORD, 'takeaway-internal-seed')
const DEMO_VERSION = '20261021-v1'

const now = () => new Date().toISOString()
const id = prefix => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`
const getContext = () => (cloud.getWXContext ? cloud.getWXContext() : {})
const clean = value => (value === undefined ? null : value)
const normalizeUsername = value => String(value || '').trim().toLowerCase()
const normalizePhone = value => String(value || '').trim()
const withoutId = value => {
  const { _id, ...rest } = value || {}
  return rest
}
const mapId = list => (list || []).map(item => ({ ...item, id: item.id || item._id }))

let collectionsReady = false

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, stored) {
  if (!stored || stored.indexOf(':') < 0) return false
  const [salt, hash] = stored.split(':')
  try {
    const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex')
    const expected = Buffer.from(hash, 'hex')
    const actual = Buffer.from(candidate, 'hex')
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch (error) {
    return false
  }
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.randomBytes(12)
  let value = ''
  for (let index = 0; index < 10; index += 1) value += chars[bytes[index] % chars.length]
  return value
}

function apiError(message, code) {
  const error = new Error(message)
  error.code = code || 'TAKEAWAY_API_ERROR'
  return error
}

function publicUser(user) {
  if (!user) return null
  const { passwordHash, openid, failedAttempts, lockedUntil, ...rest } = user
  return { ...rest, id: user.id || user._id }
}

function publicSettings(settings, forAgent) {
  const base = {
    reviewMode: settings.reviewMode,
    payoutAccount: settings.payoutAccount,
    merchantWithdrawEnabled: settings.merchantWithdrawEnabled,
    reviewTimeoutAction: settings.reviewTimeoutAction
  }
  return forAgent ? base : { ...settings, ...base }
}

function buildSeedAdmin() {
  const createdAt = now()
  return {
    _id: SEED_ADMIN_USERNAME,
    id: SEED_ADMIN_USERNAME,
    role: ROLE_SUPER,
    name: '平台管理员',
    username: SEED_ADMIN_USERNAME,
    usernameLower: SEED_ADMIN_USERNAME,
    contact: '',
    phone: '',
    email: '',
    department: '平台运营',
    note: '',
    balance: 0,
    enabled: true,
    passwordHash: SEED_ADMIN_HASH,
    mustChangePassword: true,
    isSeed: true,
    demoVersion: DEMO_VERSION,
    createdAt,
    updatedAt: createdAt
  }
}

async function ensureCollections() {
  if (collectionsReady) return
  for (const name of COLLECTIONS) {
    if (typeof db.createCollection === 'function') {
      try {
        await db.createCollection(name)
      } catch (error) {
        // 集合已存在时云开发会抛错，这里视为正常状态。
      }
    }
    try {
      await db.collection(name).limit(1).get()
    } catch (error) {
      const message = String((error && (error.errMsg || error.message)) || '')
      if (!/not exist|不存在|-502005/i.test(message)) throw error
      throw apiError(`云数据库集合 ${name} 不存在，请在云开发控制台创建后重试`, 'COLLECTION_MISSING')
    }
  }
  collectionsReady = true
}

async function getAll(name, where) {
  const query = where ? db.collection(name).where(where) : db.collection(name)
  const result = await query.limit(1000).get()
  return result.data || []
}

async function audit(action, payload, context, actor) {
  try {
    await db.collection('audit_logs').add({
      data: {
        action,
        payload: payload || {},
        openid: (context && context.OPENID) || '',
        actorId: actor ? actor._id : '',
        actorRole: actor ? actor.role : '',
        createdAt: now()
      }
    })
  } catch (error) {
    return { warning: error.message || 'audit log failed' }
  }
  return null
}

async function migrateUsers() {
  const users = await getAll('users')
  if (!users.length) {
    const admin = buildSeedAdmin()
    await db.collection('users').doc(admin._id).set({ data: withoutId(admin) })
    return
  }
  for (const user of users) {
    const patch = {}
    if (!user.usernameLower && user.username) patch.usernameLower = normalizeUsername(user.username)
    if (!user.role) patch.role = user._id === SEED_ADMIN_USERNAME ? ROLE_SUPER : ROLE_AGENT
    if (user._id === SEED_ADMIN_USERNAME && user.role === ROLE_ADMIN) patch.role = ROLE_SUPER
    if (!user.passwordHash && (user.isSeed || user._id === SEED_ADMIN_USERNAME)) {
      patch.passwordHash = SEED_ADMIN_HASH
      patch.mustChangePassword = true
    }
    if (user.mustChangePassword === undefined && (user.isSeed || user._id === SEED_ADMIN_USERNAME) && user.passwordHash === SEED_ADMIN_HASH) {
      patch.mustChangePassword = true
    }
    if (Object.keys(patch).length) {
      await db.collection('users').doc(user._id).update({ data: { ...patch, updatedAt: now() } })
    }
  }
}

async function ensureSettings() {
  const result = await db.collection('settings').doc('platform').get().catch(() => null)
  if (result && result.data) return result.data
  const settings = {
    _id: 'platform',
    reviewMode: '人工审核后结算',
    payoutAccount: '微信账户',
    merchantWithdrawEnabled: true,
    notifyOnPending: true,
    pendingAlertThreshold: 3,
    reviewTimeoutAction: '自动审核通过',
    updatedAt: now()
  }
  await db.collection('settings').doc('platform').set({ data: withoutId(settings) })
  return settings
}

async function findUserByOpenId(context) {
  const openid = (context && context.OPENID) || ''
  if (!openid) return null
  try {
    const result = await db.collection('users').where({ openid }).limit(1).get()
    return (result.data || [])[0] || null
  } catch (error) {
    return null
  }
}

async function requireUser(context) {
  const user = await findUserByOpenId(context)
  if (!user) throw apiError('登录状态已失效，请重新登录', 'UNAUTHENTICATED')
  if (user.enabled === false) throw apiError('账号已停用，请联系管理员', 'FORBIDDEN')
  return user
}

function requireRole(user, roles) {
  if (!roles.includes(user.role)) throw apiError('当前账号没有权限执行该操作', 'FORBIDDEN')
}

async function assertUsernameAvailable(usernameLower, excludeId) {
  const result = await db.collection('users').where({ usernameLower }).limit(5).get()
  const conflict = (result.data || []).find(item => item._id !== excludeId)
  if (conflict) throw new Error('登录账号已存在')
}

async function assertPhoneAvailable(phone, excludeId) {
  if (!phone) return
  const result = await db.collection('users').where({ phone }).limit(5).get()
  const conflict = (result.data || []).find(item => item._id !== excludeId && item.role === ROLE_AGENT)
  if (conflict) throw new Error('该手机号已绑定其他代理人账号')
}

async function requireAgent(agentId) {
  if (!agentId) throw new Error('缺少代理人 ID')
  const result = await db.collection('users').doc(agentId).get().catch(() => null)
  const agent = result && result.data
  if (!agent || agent.role !== ROLE_AGENT || agent.enabled === false) throw new Error('代理人不存在或已停用')
  return agent
}

async function login(event, context) {
  await ensureCollections()
  await migrateUsers()
  const usernameLower = normalizeUsername(event.username)
  const password = String(event.password || '')
  if (!usernameLower || !password) throw new Error('请输入账号和密码')
  const result = await db.collection('users').where({ usernameLower }).limit(1).get()
  const user = (result.data || [])[0]
  if (!user) throw new Error('账号或密码不正确')
  if (user.enabled === false) throw new Error('账号已停用，请联系管理员')
  const lockedUntil = Number(user.lockedUntil || 0)
  if (lockedUntil > Date.now()) {
    const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000))
    throw new Error(`尝试次数过多，请 ${minutes} 分钟后再试`)
  }
  if (!verifyPassword(password, user.passwordHash)) {
    const failed = Number(user.failedAttempts || 0) + 1
    const patch = { failedAttempts: failed, updatedAt: now() }
    if (failed >= 5) {
      patch.lockedUntil = Date.now() + 10 * 60 * 1000
      patch.failedAttempts = 0
    }
    await db.collection('users').doc(user._id).update({ data: patch })
    throw new Error('账号或密码不正确')
  }
  const openid = (context && context.OPENID) || ''
  if (user.openid && openid && user.openid !== openid) throw new Error('该账号已绑定其他微信，请联系管理员解绑')
  const patch = {
    openid,
    failedAttempts: 0,
    lockedUntil: 0,
    lastLoginAt: now(),
    updatedAt: now()
  }
  await db.collection('users').doc(user._id).update({ data: patch })
  await audit('login', { userId: user._id }, context, user)
  return publicUser({ ...user, ...patch })
}

async function changePassword(event, context) {
  const user = await requireUser(context)
  const oldPassword = String(event.oldPassword || '')
  const newPassword = String(event.newPassword || '')
  if (newPassword.length < 8) throw new Error('新密码至少 8 位')
  if (!verifyPassword(oldPassword, user.passwordHash)) throw new Error('原密码不正确')
  await db.collection('users').doc(user._id).update({
    data: { passwordHash: hashPassword(newPassword), mustChangePassword: false, updatedAt: now() }
  })
  await audit('changePassword', {}, context, user)
  return { ok: true }
}

async function updateProfile(event, context) {
  const user = await requireUser(context)
  const source = event.patch || event
  const patch = {}
  ;['name', 'phone', 'email', 'department', 'contact', 'payoutMethod', 'avatar'].forEach(key => {
    if (source[key] !== undefined) patch[key] = String(source[key]).trim()
  })
  if (user.role === ROLE_AGENT) delete patch.phone
  if (patch.name === '') throw new Error('姓名不能为空')
  if (patch.phone && !/^[+\d][\d\s-]{5,19}$/.test(patch.phone)) throw new Error('手机号格式不正确')
  if (!Object.keys(patch).length) return publicUser(user)
  patch.updatedAt = now()
  await db.collection('users').doc(user._id).update({ data: patch })
  await audit('updateProfile', patch, context, user)
  return publicUser({ ...user, ...patch })
}

async function listAdmins(context) {
  const user = await requireUser(context)
  requireRole(user, [ROLE_SUPER])
  const result = await getAll('users', { role: _.in([ROLE_SUPER, ROLE_ADMIN]) })
  return mapId(result).map(publicUser)
}

async function createAdmin(event, context) {
  const user = await requireUser(context)
  requireRole(user, [ROLE_SUPER])
  const username = String(event.username || '').trim()
  const usernameLower = normalizeUsername(username)
  if (!usernameLower) throw new Error('请输入登录账号')
  await assertUsernameAvailable(usernameLower)
  const role = event.role === ROLE_SUPER ? ROLE_SUPER : ROLE_ADMIN
  const initialPassword = String(event.password || '').trim() || generatePassword()
  if (initialPassword.length < 8) throw new Error('初始密码至少 8 位')
  const adminId = event.id || id('a')
  const item = {
    _id: adminId,
    id: adminId,
    role,
    name: String(event.name || username).trim(),
    username,
    usernameLower,
    contact: '',
    phone: normalizePhone(event.phone),
    email: String(event.email || '').trim(),
    department: String(event.department || '').trim(),
    note: String(event.note || '').trim(),
    balance: 0,
    enabled: true,
    passwordHash: hashPassword(initialPassword),
    mustChangePassword: true,
    createdBy: user._id,
    createdAt: now(),
    updatedAt: now()
  }
  await db.collection('users').doc(adminId).set({ data: withoutId(item) })
  await audit('createAdmin', { adminId, role }, context, user)
  return { user: publicUser(item), initialPassword }
}

async function updateAdmin(event, context) {
  const user = await requireUser(context)
  requireRole(user, [ROLE_SUPER])
  const targetId = event.id
  if (!targetId) throw new Error('缺少管理员 ID')
  const result = await db.collection('users').doc(targetId).get().catch(() => null)
  const target = result && result.data
  if (!target || !ADMIN_ROLES.includes(target.role)) throw new Error('管理员不存在')
  const patch = {}
  ;['name', 'phone', 'email', 'department', 'note'].forEach(key => {
    if (event[key] !== undefined) patch[key] = String(event[key]).trim()
  })
  if (typeof event.username === 'string' && event.username.trim()) {
    const usernameLower = normalizeUsername(event.username)
    await assertUsernameAvailable(usernameLower, targetId)
    patch.username = event.username.trim()
    patch.usernameLower = usernameLower
  }
  if (typeof event.enabled === 'boolean') patch.enabled = event.enabled
  if (event.password) {
    if (String(event.password).length < 8) throw new Error('新密码至少 8 位')
    patch.passwordHash = hashPassword(String(event.password))
    patch.mustChangePassword = true
    patch.openid = ''
  }
  if (targetId === user._id && patch.enabled === false) throw new Error('不能停用当前登录账号')
  if (patch.enabled === false) {
    const allAdmins = await getAll('users', { role: _.in([ROLE_SUPER, ROLE_ADMIN]) })
    const activeSupers = allAdmins.filter(item => item.role === ROLE_SUPER && item.enabled !== false && item._id !== targetId)
    if (target.role === ROLE_SUPER && !activeSupers.length) throw new Error('至少需要保留一个启用中的超级管理员')
  }
  if (!Object.keys(patch).length) return publicUser(target)
  patch.updatedAt = now()
  await db.collection('users').doc(targetId).update({ data: patch })
  await audit('updateAdmin', { targetId, patch: Object.keys(patch) }, context, user)
  return publicUser({ ...target, ...patch })
}

async function createAgent(event, context) {
  const user = await requireUser(context)
  requireRole(user, ADMIN_ROLES)
  const username = String(event.username || '').trim()
  const usernameLower = normalizeUsername(username)
  const phone = normalizePhone(event.phone)
  if (!usernameLower) throw new Error('请输入登录账号')
  if (!phone) throw new Error('请填写手机号')
  await assertUsernameAvailable(usernameLower)
  await assertPhoneAvailable(phone)
  const initialPassword = String(event.password || '').trim() || generatePassword()
  if (initialPassword.length < 8) throw new Error('初始密码至少 8 位')
  const agentId = event.id || id('m')
  const item = {
    _id: agentId,
    id: agentId,
    role: ROLE_AGENT,
    name: String(event.name || username).trim(),
    username,
    usernameLower,
    contact: String(event.contact || '').trim(),
    phone,
    email: String(event.email || '').trim(),
    note: String(event.note || '').trim(),
    payoutMethod: String(event.payoutMethod || '').trim(),
    balance: 0,
    enabled: true,
    passwordHash: hashPassword(initialPassword),
    mustChangePassword: true,
    createdBy: user._id,
    createdAt: now(),
    updatedAt: now()
  }
  await db.collection('users').doc(agentId).set({ data: withoutId(item) })
  await audit('createAgent', { agentId }, context, user)
  return { user: publicUser(item), initialPassword }
}

async function updateAgent(event, context) {
  const user = await requireUser(context)
  requireRole(user, ADMIN_ROLES)
  const targetId = event.id
  if (!targetId) throw new Error('缺少代理人 ID')
  const target = await requireAgent(targetId)
  const patch = {}
  ;['name', 'contact', 'email', 'note', 'payoutMethod'].forEach(key => {
    if (event[key] !== undefined) patch[key] = String(event[key]).trim()
  })
  if (event.phone !== undefined) {
    const phone = normalizePhone(event.phone)
    if (!phone) throw new Error('手机号不能为空')
    await assertPhoneAvailable(phone, targetId)
    patch.phone = phone
  }
  if (typeof event.username === 'string' && event.username.trim()) {
    const usernameLower = normalizeUsername(event.username)
    await assertUsernameAvailable(usernameLower, targetId)
    patch.username = event.username.trim()
    patch.usernameLower = usernameLower
  }
  if (typeof event.enabled === 'boolean') patch.enabled = event.enabled
  if (event.password) {
    if (String(event.password).length < 8) throw new Error('新密码至少 8 位')
    patch.passwordHash = hashPassword(String(event.password))
    patch.mustChangePassword = true
    patch.openid = ''
  }
  if (event.unbindOpenid) patch.openid = ''
  if (!Object.keys(patch).length) return publicUser(target)
  patch.updatedAt = now()
  await db.collection('users').doc(targetId).update({ data: patch })
  await audit('updateAgent', { targetId, patch: Object.keys(patch) }, context, user)
  return publicUser({ ...target, ...patch })
}

async function bootstrap(user) {
  await ensureCollections()
  await migrateUsers()
  const settings = await ensureSettings()
  if (user.role === ROLE_AGENT) {
    const [orders, withdrawals, ledger, fresh] = await Promise.all([
      getAll('orders', { merchantId: user._id }),
      getAll('withdrawals', { merchantId: user._id }),
      getAll('ledger', { merchantId: user._id }),
      db.collection('users').doc(user._id).get().catch(() => null)
    ])
    const profile = publicUser((fresh && fresh.data) || user)
    return {
      merchant: profile,
      merchants: [profile],
      orders: mapId(orders),
      withdrawals: mapId(withdrawals),
      ledger: mapId(ledger),
      settings: publicSettings(settings, true),
      currentAgentId: profile.id,
      user: publicUser(user)
    }
  }
  requireRole(user, ADMIN_ROLES)
  const [users, orders, withdrawals, ledger] = await Promise.all([
    getAll('users'), getAll('orders'), getAll('withdrawals'), getAll('ledger')
  ])
  const agents = users.filter(item => item.role === ROLE_AGENT).map(publicUser)
  const defaultAgent = agents.find(item => item.enabled !== false) || agents[0]
  return {
    merchant: defaultAgent || null,
    merchants: agents,
    orders: mapId(orders),
    withdrawals: mapId(withdrawals),
    ledger: mapId(ledger),
    settings: publicSettings(settings, false),
    currentAgentId: defaultAgent ? defaultAgent.id : '',
    user: publicUser(user),
    admins: user.role === ROLE_SUPER ? users.filter(item => ADMIN_ROLES.includes(item.role)).map(publicUser) : []
  }
}

async function runTransaction(work) {
  if (typeof db.runTransaction === 'function') return db.runTransaction(work)
  return work(db)
}

async function reviewPayment(event, context) {
  const user = await requireUser(context)
  requireRole(user, ADMIN_ROLES)
  const orderId = event.orderId || event.id
  if (!orderId) throw new Error('缺少订单 ID')
  const pass = event.pass !== false
  const result = await runTransaction(async transaction => {
    const orderResult = await transaction.collection('orders').doc(orderId).get()
    const order = orderResult.data
    if (!order) throw new Error('订单不存在')
    if (!['待审核', '待客户付款'].includes(order.status)) throw new Error('订单当前不可审核')
    const patch = {
      status: pass ? '已审核' : '已驳回',
      reviewedAt: now(),
      reviewNote: String(event.note || ''),
      reviewedBy: user._id
    }
    if (pass && !order.settled) {
      const agentResult = await transaction.collection('users').doc(order.merchantId).get()
      const agent = agentResult.data
      if (!agent) throw new Error('代理人不存在')
      const amount = Number(order.settleAmount || 0)
      const balance = Number(agent.balance || 0) + amount
      await transaction.collection('users').doc(order.merchantId).update({ data: { balance, updatedAt: now() } })
      await transaction.collection('ledger').doc(`LG-ORDER-${orderId}`).set({
        data: {
          merchantId: order.merchantId,
          orderId,
          title: `订单 ${orderId} 结算入账`,
          amount: `+${amount.toFixed(2)}`,
          type: '收入',
          time: now(),
          createdAt: now()
        }
      })
      patch.settled = true
    }
    await transaction.collection('orders').doc(orderId).update({ data: patch })
    return { ...order, ...patch, id: orderId }
  })
  await audit('reviewPayment', { orderId, pass }, context, user)
  return result
}

async function applyWithdrawal(event, context) {
  const user = await requireUser(context)
  requireRole(user, [ROLE_AGENT])
  const amount = Number(event.amount)
  if (!amount || amount <= 0) throw new Error('提现金额不正确')
  const agent = await requireAgent(user._id)
  const pending = await getAll('withdrawals', { merchantId: user._id, status: _.in(['待审核', '待打款']) })
  const pendingAmount = pending.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  if (amount > Number(agent.balance || 0) - pendingAmount) throw new Error('可用余额不足')
  const withdrawalId = event.withdrawalId || id('TX')
  const item = {
    _id: withdrawalId,
    id: withdrawalId,
    merchantId: user._id,
    agentName: agent.name || agent.username,
    amount: amount.toFixed(2),
    status: '待审核',
    method: String(event.method || '微信账户'),
    account: String(event.account || agent.phone || ''),
    note: String(event.note || ''),
    createdAt: now()
  }
  await db.collection('withdrawals').doc(withdrawalId).set({ data: withoutId(item) })
  await audit('applyWithdrawal', { withdrawalId }, context, user)
  return item
}

async function reviewWithdrawal(event, context) {
  const user = await requireUser(context)
  requireRole(user, ADMIN_ROLES)
  const withdrawalId = event.withdrawalId || event.id
  if (!withdrawalId) throw new Error('缺少提现单号')
  const pass = event.pass !== false
  const result = await runTransaction(async transaction => {
    const withdrawalResult = await transaction.collection('withdrawals').doc(withdrawalId).get()
    const item = withdrawalResult.data
    if (!item || item.status !== '待审核') throw new Error('提现当前不可审核')
    const patch = {
      status: pass ? '待打款' : '已驳回',
      reviewedAt: now(),
      reviewedBy: user._id,
      rejectReason: pass ? '' : String(event.reason || '未填写驳回原因')
    }
    if (pass) {
      const agentResult = await transaction.collection('users').doc(item.merchantId).get()
      const agent = agentResult.data
      if (!agent) throw new Error('代理人不存在')
      const amount = Number(item.amount || 0)
      const balance = Math.max(0, Number(agent.balance || 0) - amount)
      await transaction.collection('users').doc(item.merchantId).update({ data: { balance, updatedAt: now() } })
      await transaction.collection('ledger').doc(`LG-WD-${withdrawalId}`).set({
        data: {
          merchantId: item.merchantId,
          withdrawalId,
          title: `提现 ${withdrawalId}`,
          amount: `-${amount.toFixed(2)}`,
          type: '提现',
          time: now(),
          createdAt: now()
        }
      })
    }
    await transaction.collection('withdrawals').doc(withdrawalId).update({ data: patch })
    return { ...item, ...patch, id: withdrawalId }
  })
  await audit('reviewWithdrawal', { withdrawalId, pass }, context, user)
  return result
}

async function completeWithdrawal(event, context) {
  const user = await requireUser(context)
  requireRole(user, ADMIN_ROLES)
  const withdrawalId = event.withdrawalId || event.id
  if (!withdrawalId) throw new Error('缺少提现单号')
  const result = await db.collection('withdrawals').doc(withdrawalId).get()
  const item = result.data
  if (!item || item.status !== '待打款') throw new Error('提现当前不可完成')
  const patch = { status: '已完成', paidAt: now(), paymentProof: String(event.proof || ''), paidBy: user._id }
  await db.collection('withdrawals').doc(withdrawalId).update({ data: patch })
  await audit('completeWithdrawal', { withdrawalId }, context, user)
  return { ...item, ...patch, id: withdrawalId }
}

async function createOrder(event, context) {
  const user = await requireUser(context)
  let agentId
  if (user.role === ROLE_AGENT) {
    agentId = user._id
  } else {
    requireRole(user, ADMIN_ROLES)
    agentId = event.agentId
    if (!agentId) throw new Error('请选择结算代理人')
  }
  const agent = await requireAgent(agentId)
  if (!event.item || !event.payAmount) throw new Error('餐品和客户支付金额不能为空')
  const orderId = event.orderId || id('OD')
  const shareToken = event.shareToken || id('ST')
  const order = {
    _id: orderId,
    id: orderId,
    shareToken,
    merchantId: agent._id,
    merchant: clean(event.merchant || agent.name),
    item: String(event.item),
    detail: clean(event.detail || '规格待确认'),
    payAmount: Number(event.payAmount).toFixed(2),
    settleAmount: Number(event.settleAmount || event.payAmount).toFixed(2),
    status: '待客户付款',
    paid: false,
    expiresAt: Date.now() + 15 * 60 * 1000,
    createdAt: now(),
    createdBy: user._id,
    imagePath: event.imagePath || ''
  }
  await db.collection('orders').doc(orderId).set({ data: withoutId(order) })
  await audit('createOrder', { orderId, agentId }, context, user)
  return order
}

async function submitPayment(event, context) {
  const token = event.token || event.shareToken
  if (!token) throw new Error('订单链接无效')
  const result = await db.collection('orders').where({ shareToken: token }).limit(1).get()
  const order = (result.data || [])[0]
  if (!order) throw new Error('订单链接无效')
  if (event.orderId && event.orderId !== order._id) throw new Error('订单链接无效')
  if (order.status !== '待客户付款') throw new Error('订单当前不可重复提交付款')
  if (order.expiresAt && order.expiresAt <= Date.now()) throw new Error('订单已过期')
  const patch = {
    paid: true,
    status: '待审核',
    userWechatName: String(event.userWechatName || '微信用户'),
    paidAt: Date.now(),
    reviewExpiresAt: Date.now() + 10 * 60 * 1000,
    paymentProof: String(event.paymentProof || ''),
    paymentReference: String(event.paymentReference || ''),
    updatedAt: now()
  }
  await db.collection('orders').doc(order._id).update({ data: patch })
  await audit('submitPayment', { orderId: order._id }, context, null)
  return { orderId: order._id, status: patch.status }
}

async function getSharedOrder(event) {
  const token = event.token || event.orderId
  if (!token) throw new Error('订单链接无效')
  let order = null
  const result = await db.collection('orders').where({ shareToken: token }).limit(1).get()
  order = (result.data || [])[0] || null
  if (!order) {
    const legacy = await db.collection('orders').doc(token).get().catch(() => null)
    order = legacy && legacy.data
  }
  if (!order) throw new Error('订单不存在')
  return {
    id: order._id,
    shareToken: order.shareToken || '',
    merchant: order.merchant || '',
    item: order.item || '',
    detail: order.detail || '',
    payAmount: order.payAmount || '0.00',
    status: order.status || '',
    paid: !!order.paid,
    expiresAt: order.expiresAt || 0,
    imagePath: order.imagePath || '',
    createdAt: order.createdAt || ''
  }
}

async function cleanExpiredOrders(event, context) {
  // 支持两种触发：管理员手动调用（有 OPENID，走鉴权）、定时触发器（无 OPENID，直接执行）
  let actor = null
  if (context && context.OPENID) {
    const user = await findUserByOpenId(context)
    if (!user || ADMIN_ROLES.indexOf(user.role) < 0) throw new Error('仅管理员可触发清理')
    actor = user
  }
  const settings = await ensureSettings()
  const timeoutAction = settings.reviewTimeoutAction === '自动驳回' ? 'reject' : 'approve'
  const nowTs = Date.now()
  let cancelledCount = 0
  let autoApprovedCount = 0
  let autoRejectedCount = 0

  // 1. 过期未付款订单 → 已取消
  const expiring = await db.collection('orders')
    .where({ status: '待客户付款', expiresAt: _.gt(0).and(_.lte(nowTs)) })
    .get()
  for (const order of (expiring.data || [])) {
    await db.collection('orders').doc(order._id).update({
      data: { status: '已取消', updatedAt: now() }
    })
    cancelledCount += 1
  }

  // 2. 审核超时订单 → 自动处理
  const reviewing = await db.collection('orders')
    .where({ status: '待审核', reviewExpiresAt: _.gt(0).and(_.lte(nowTs)) })
    .get()
  for (const order of (reviewing.data || [])) {
    const orderId = order._id
    if (timeoutAction === 'approve') {
      try {
        await runTransaction(async transaction => {
          const orderResult = await transaction.collection('orders').doc(orderId).get()
          const current = orderResult.data
          if (!current || current.status !== '待审核') return
          const agentResult = await transaction.collection('users').doc(current.merchantId).get()
          const agent = agentResult.data
          if (!agent) throw new Error('代理人不存在')
          const amount = Number(current.settleAmount || 0)
          const balance = Number(agent.balance || 0) + amount
          await transaction.collection('users').doc(current.merchantId).update({
            data: { balance, updatedAt: now() }
          })
          await transaction.collection('ledger').doc(`LG-ORDER-${orderId}`).set({
            data: {
              merchantId: current.merchantId,
              orderId,
              title: `订单 ${orderId} 自动结算入账`,
              amount: `+${amount.toFixed(2)}`,
              type: '收入',
              time: now(),
              createdAt: now()
            }
          })
          await transaction.collection('orders').doc(orderId).update({
            data: {
              status: '已审核', settled: true, settledAt: now(),
              reviewedAt: now(), reviewedBy: 'system', reviewNote: '审核超时自动通过', updatedAt: now()
            }
          })
        })
        autoApprovedCount += 1
      } catch (err) {
        // 单笔失败不影响其他订单，记录为驳回
        await db.collection('orders').doc(orderId).update({
          data: { status: '已驳回', reviewedAt: now(), reviewedBy: 'system', reviewNote: `自动通过失败：${err.message}`, updatedAt: now() }
        })
        autoRejectedCount += 1
      }
    } else {
      await db.collection('orders').doc(orderId).update({
        data: {
          status: '已驳回', reviewedAt: now(), reviewedBy: 'system', reviewNote: '审核超时自动驳回', updatedAt: now()
        }
      })
      autoRejectedCount += 1
    }
  }

  const summary = { cancelledCount, autoApprovedCount, autoRejectedCount, timeoutAction }
  if (cancelledCount + autoApprovedCount + autoRejectedCount > 0) {
    await audit('cleanExpiredOrders', summary, context, actor)
  }
  return summary
}

async function updateSettings(event, context) {
  const user = await requireUser(context)
  requireRole(user, ADMIN_ROLES)
  const source = event.patch || event
  const allowed = ['reviewMode', 'payoutAccount', 'merchantWithdrawEnabled', 'notifyOnPending', 'pendingAlertThreshold', 'reviewTimeoutAction']
  const patch = {}
  allowed.forEach(key => {
    if (source[key] !== undefined) patch[key] = source[key]
  })
  if (!Object.keys(patch).length) return ensureSettings()
  const current = await ensureSettings()
  const next = { ...withoutId(current), ...patch, updatedAt: now() }
  await db.collection('settings').doc('platform').set({ data: next })
  await audit('updateSettings', patch, context, user)
  return { ...next, _id: 'platform' }
}

async function listAuditLogs(event, context) {
  const user = await requireUser(context)
  requireRole(user, ADMIN_ROLES)
  const page = Math.max(0, Number(event.page) || 0)
  const pageSize = Math.min(100, Math.max(1, Number(event.pageSize) || 20))
  const conditions = []
  if (event.action) conditions.push({ action: event.action })
  if (event.actorId) conditions.push({ actorId: event.actorId })
  const kw = String(event.keyword || '').trim()
  if (kw) {
    conditions.push(_.or([
      { openid: db.RegExp({ regexp: kw, options: 'i' }) },
      { actorRole: db.RegExp({ regexp: kw, options: 'i' }) },
      { action: db.RegExp({ regexp: kw, options: 'i' }) }
    ]))
  }
  const where = conditions.length === 0 ? {} : conditions.length === 1 ? conditions[0] : _.and(conditions)
  const countResult = await db.collection('audit_logs').where(where).count()
  const total = countResult.total
  const listResult = await db.collection('audit_logs')
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get()
  return {
    list: (listResult.data || []).map(item => ({ ...item, id: item.id || item._id })),
    total,
    page,
    pageSize,
    hasMore: (page + 1) * pageSize < total
  }
}

async function handle(event, context) {
  const data = event || {}
  switch (data.action) {
    case 'login':
      return { success: true, data: await login(data, context) }
    case 'getSession': {
      const user = await findUserByOpenId(context)
      if (!user || user.enabled === false) return { success: true, data: { authenticated: false, user: null } }
      return { success: true, data: { authenticated: true, user: publicUser(user) } }
    }
    case 'logout': {
      const user = await findUserByOpenId(context)
      if (user) {
        await db.collection('users').doc(user._id).update({ data: { openid: '', updatedAt: now() } })
        await audit('logout', {}, context, user)
      }
      return { success: true, data: { ok: true } }
    }
    case 'changePassword':
      return { success: true, data: await changePassword(data, context) }
    case 'updateProfile':
      return { success: true, data: await updateProfile(data, context) }
    case 'bootstrap': {
      const user = await requireUser(context)
      return { success: true, data: await bootstrap(user) }
    }
    case 'getAdminOverview': {
      const user = await requireUser(context)
      requireRole(user, ADMIN_ROLES)
      return { success: true, data: await bootstrap(user) }
    }
    case 'getAgentOverview':
    case 'getAgentOrders':
    case 'getAgentWallet':
    case 'getAgentWithdrawals': {
      const user = await requireUser(context)
      requireRole(user, [ROLE_AGENT])
      return { success: true, data: await bootstrap(user) }
    }
    case 'listAdmins':
      return { success: true, data: await listAdmins(context) }
    case 'createAdmin':
      return { success: true, data: await createAdmin(data, context) }
    case 'updateAdmin':
      return { success: true, data: await updateAdmin(data, context) }
    case 'createAgent':
    case 'createMerchant':
      return { success: true, data: await createAgent(data, context) }
    case 'updateAgent':
    case 'updateMerchant': {
      const payload = data.action === 'updateMerchant' ? { ...data, ...(data.patch || {}) } : data
      return { success: true, data: await updateAgent(payload, context) }
    }
    case 'updateAgentProfile': {
      const user = await requireUser(context)
      requireRole(user, [ROLE_AGENT])
      const payload = { ...(data.patch || {}) }
      if (data.name !== undefined) payload.name = data.name
      return { success: true, data: await updateProfile(payload, context) }
    }
    case 'createOrder':
      return { success: true, data: await createOrder(data, context) }
    case 'submitPayment':
      return { success: true, data: await submitPayment(data, context) }
    case 'reviewPayment':
      return { success: true, data: await reviewPayment(data, context) }
    case 'applyWithdrawal':
      return { success: true, data: await applyWithdrawal(data, context) }
    case 'reviewWithdrawal':
      return { success: true, data: await reviewWithdrawal(data, context) }
    case 'completeWithdrawal':
      return { success: true, data: await completeWithdrawal(data, context) }
    case 'updateSettings':
      return { success: true, data: await updateSettings(data, context) }
    case 'getSharedOrder':
      return { success: true, data: await getSharedOrder(data) }
    case 'listAuditLogs':
      return { success: true, data: await listAuditLogs(data, context) }
    case 'cleanExpiredOrders':
      return { success: true, data: await cleanExpiredOrders(data, context) }
    default:
      throw new Error(`未知 action: ${data.action || ''}`)
  }
}

exports.main = async (event, context) => {
  try {
    // 运行时 context 不含 OPENID，必须以 cloud.getWXContext() 为准
    const wxContext = { ...(context || {}), ...getContext() }
    // 定时触发器入口：微信 Timer 触发时 event 没有 action 字段，直接执行清理
    if (!event.action || event.Type === 'Timer') {
      const result = await cleanExpiredOrders(event, wxContext)
      return { success: true, data: result }
    }
    const result = await handle(event, wxContext)
    return result
  } catch (error) {
    return {
      success: false,
      error: error.message || String(error),
      code: error.code || 'TAKEAWAY_API_ERROR'
    }
  }
}
