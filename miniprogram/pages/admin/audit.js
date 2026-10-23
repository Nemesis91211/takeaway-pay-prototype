const auth = require('../../services/auth')
const api = require('../../services/api')

const ACTION_LABELS = {
  login: '登录',
  logout: '退出登录',
  changePassword: '修改密码',
  updateProfile: '更新资料',
  createAdmin: '创建管理员',
  updateAdmin: '更新管理员',
  createAgent: '创建代理人',
  updateAgent: '更新代理人',
  createOrder: '创建订单',
  submitPayment: '客户付款',
  reviewPayment: '审核付款',
  applyWithdrawal: '申请提现',
  reviewWithdrawal: '审核提现',
  completeWithdrawal: '完成提现打款',
  updateSettings: '更新平台设置',
  cleanExpiredOrders: '清理过期订单'
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const pad = n => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== 'object') return ''
  const keys = Object.keys(payload)
  if (!keys.length) return ''
  // 优先展示有业务含义的字段
  const preferred = ['agentName', 'merchantName', 'username', 'name', 'role', 'pass', 'orderId', 'withdrawalId', 'amount']
  const picks = []
  preferred.forEach(k => { if (payload[k] !== undefined && payload[k] !== null && payload[k] !== '') picks.push(`${k}=${payload[k]}`) })
  if (picks.length) return picks.join(' · ')
  // 否则只展示前 2 个字段
  return keys.slice(0, 2).map(k => `${k}=${payload[k]}`).join(' · ')
}

Page({
  data: {
    logs: [],
    actionFilter: '',
    keyword: '',
    page: 0,
    pageSize: 20,
    total: 0,
    hasMore: true,
    loading: false,
    showDetail: false,
    detailItem: null,
    actionOptions: [
      { key: '', label: '全部操作' },
      { key: 'login', label: '登录' },
      { key: 'changePassword', label: '改密' },
      { key: 'createAdmin', label: '建管理员' },
      { key: 'createAgent', label: '建代理人' },
      { key: 'createOrder', label: '建订单' },
      { key: 'reviewPayment', label: '审核付款' },
      { key: 'applyWithdrawal', label: '申请提现' },
      { key: 'reviewWithdrawal', label: '审核提现' },
      { key: 'completeWithdrawal', label: '完成打款' },
      { key: 'updateSettings', label: '平台设置' }
    ]
  },

  onShow() {
    if (!auth.ensureAdmin()) return
    this.setData({ logs: [], page: 0, hasMore: true })
    this.loadMore()
  },

  setActionFilter(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ actionFilter: key, logs: [], page: 0, hasMore: true }, () => this.loadMore())
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  search() {
    this.setData({ logs: [], page: 0, hasMore: true }, () => this.loadMore())
  },

  async loadMore() {
    if (this.data.loading || !this.data.hasMore) return
    this.setData({ loading: true })
    try {
      const result = await api.listAuditLogs({
        page: this.data.page,
        pageSize: this.data.pageSize,
        action: this.data.actionFilter || undefined,
        keyword: this.data.keyword || undefined
      })
      const newItems = (result.list || []).map(item => ({
        ...item,
        actionLabel: ACTION_LABELS[item.action] || item.action || '未知操作',
        timeLabel: formatTime(item.createdAt),
        payloadSummary: summarizePayload(item.payload),
        actorName: item.actorId || '-',
        roleLabel: item.actorRole === 'super_admin' ? '超管' : item.actorRole === 'admin' ? '管理员' : item.actorRole === 'agent' ? '代理人' : '-'
      }))
      this.setData({
        logs: this.data.logs.concat(newItems),
        total: result.total || 0,
        hasMore: result.hasMore === true,
        page: this.data.page + 1
      })
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  openDetail(e) {
    const item = this.data.logs.find(l => l.id === e.currentTarget.dataset.id)
    if (!item) return
    const detailItem = {
      ...item,
      payloadJson: item.payload ? JSON.stringify(item.payload, null, 2) : '{}'
    }
    this.setData({ showDetail: true, detailItem })
  },

  closeDetail() {
    this.setData({ showDetail: false, detailItem: null })
  }
})
