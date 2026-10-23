const { state, reviewWithdraw, completeWithdraw, toast } = require('../../services/mock')
const auth = require('../../services/auth')

function maskAccount(value) {
  const text = String(value || '收款账号待补充')
  if (text.includes('*')) return text
  if (text.length <= 6) return text
  return `${text.slice(0, 3)}****${text.slice(-4)}`
}

function formatCreatedAt(value) {
  if (value) return value
  const date = new Date()
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function statusClass(status) {
  if (status === '待打款' || status === '已完成') return 'green'
  if (status === '已驳回') return 'red'
  return 'pending'
}

Page({
  data: {
    withdrawals: [],
    filter: '全部',
    keyword: '',
    counts: { all: 0, pending: 0, toPay: 0, completed: 0, rejected: 0 },
    summary: { pendingAmount: '0.00', pendingCount: 0, toPayCount: 0, completedCount: 0, rejectedCount: 0 },
    detailVisible: false,
    selected: {}
  },

  onShow() {
    if (!auth.ensureAdmin()) return
    this.refresh()
  },

  normalize(item) {
    const merchant = state.merchants.find(m => m.id === item.merchantId) || state.merchant
    const agentName = item.agentName || (merchant && (merchant.name || merchant.username)) || '未关联代理人'
    const method = item.method || state.settings.payoutAccount || '微信账户'
    const account = item.account || (merchant && (merchant.phone || merchant.contact)) || '收款账号待补充'
    return {
      ...item,
      amount: Number(item.amount || 0).toFixed(2),
      agentName,
      method,
      maskedAccount: item.maskedAccount || maskAccount(account),
      createdAt: formatCreatedAt(item.createdAt),
      statusClass: statusClass(item.status),
      canReview: item.status === '待审核',
      canPay: item.status === '待打款'
    }
  },

  refresh() {
    const all = state.withdrawals.map(item => this.normalize(item))
    const counts = {
      all: all.length,
      pending: all.filter(item => item.status === '待审核').length,
      toPay: all.filter(item => item.status === '待打款').length,
      completed: all.filter(item => item.status === '已完成').length,
      rejected: all.filter(item => item.status === '已驳回').length
    }
    const keyword = String(this.data.keyword || '').trim().toLowerCase()
    const filtered = all.filter(item => {
      const statusMatch = this.data.filter === '全部' || item.status === this.data.filter
      const keywordMatch = !keyword || `${item.agentName} ${item.id} ${item.maskedAccount}`.toLowerCase().includes(keyword)
      return statusMatch && keywordMatch
    })
    const pending = all.filter(item => item.status === '待审核' || item.status === '待打款')
    const pendingAmount = pending.reduce((total, item) => total + Number(item.amount || 0), 0)
    this.setData({
      withdrawals: filtered,
      counts,
      summary: {
        pendingAmount: pendingAmount.toFixed(2),
        pendingCount: counts.pending,
        toPayCount: counts.toPay,
        completedCount: counts.completed,
        rejectedCount: counts.rejected
      }
    })
    if (this.data.detailVisible && this.data.selected.id) {
      const selected = all.find(item => item.id === this.data.selected.id)
      if (selected) this.setData({ selected })
    }
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value }, () => this.refresh())
  },

  clearKeyword() {
    this.setData({ keyword: '' }, () => this.refresh())
  },

  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.filter }, () => this.refresh())
  },

  openDetail(e) {
    const item = state.withdrawals.find(withdrawal => withdrawal.id === e.currentTarget.dataset.id)
    if (!item) return
    this.setData({ detailVisible: true, selected: this.normalize(item) })
  },

  closeDetail() {
    this.setData({ detailVisible: false })
  },

  stopPropagation() {},

  approve(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({ title: '通过提现申请？', content: '通过后将进入待打款状态，并扣减代理人可用余额。', confirmText: '确认通过', success: result => { if (result.confirm) { reviewWithdraw(id, true); this.closeDetail(); this.refresh(); toast('已通过，等待打款', 'success') } } })
  },

  reject(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({ title: '驳回提现申请？', content: '驳回后申请会保留在记录中，代理人可重新发起提现。', confirmText: '确认驳回', confirmColor: '#c44f4f', success: result => { if (result.confirm) { reviewWithdraw(id, false); this.closeDetail(); this.refresh(); toast('提现已驳回') } } })
  },

  paid(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({ title: '确认已完成打款？', content: '请确认你已向代理人收款账号完成转账。', confirmText: '确认完成', success: result => { if (result.confirm) { completeWithdraw(id); this.closeDetail(); this.refresh(); toast('已记录打款完成', 'success') } } })
  },

  home() { wx.redirectTo({ url: '/pages/admin/index' }) },
  orders() { wx.redirectTo({ url: '/pages/admin/orders' }) },
  settings() { wx.redirectTo({ url: '/pages/admin/settings' }) }
})
