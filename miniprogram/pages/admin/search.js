const { state, processReviewTimeouts } = require('../../services/mock')
const auth = require('../../services/auth')
const HISTORY_KEY = 'takeaway_order_search_history'
Page({
  data: { keyword: '', history: [], results: [], searched: false },
  onShow() { if (!auth.ensureAdmin()) return; this.loadHistory(); if (this.data.keyword) this.searchNow() },
  loadHistory() { this.setData({ history: wx.getStorageSync(HISTORY_KEY) || [] }) },
  input(e) { this.setData({ keyword: e.detail.value }) },
  clearKeyword() { this.setData({ keyword: '', results: [], searched: false }) },
  searchNow() { const keyword = this.data.keyword.trim(); if (!keyword) return this.setData({ results: [], searched: false }); processReviewTimeouts(); const lowered = keyword.toLowerCase(); const results = state.orders.filter(order => { const agent = state.merchants.find(m => m.id === order.merchantId); const agentName = agent ? `${agent.name || ''} ${agent.username || ''}` : ''; return [order.merchant, order.payAmount, order.settleAmount, agentName, order.id, order.item].some(value => String(value || '').toLowerCase().includes(lowered)) }).map(order => { const agent = state.merchants.find(m => m.id === order.merchantId); return { ...order, agentName: agent ? (agent.name || agent.username) : '未关联代理人' } }); const history = [keyword, ...this.data.history.filter(item => item !== keyword)].slice(0, 10); wx.setStorageSync(HISTORY_KEY, history); this.setData({ results, searched: true, history }) },
  useHistory(e) { this.setData({ keyword: e.currentTarget.dataset.keyword }, () => this.searchNow()) },
  deleteHistory(e) { const keyword = e.currentTarget.dataset.keyword; const history = this.data.history.filter(item => item !== keyword); wx.setStorageSync(HISTORY_KEY, history); this.setData({ history }) },
  clearHistory() { wx.removeStorageSync(HISTORY_KEY); this.setData({ history: [] }) },
  open(e) { wx.navigateTo({ url: `/pages/admin/review?id=${e.currentTarget.dataset.id}` }) },
  back() { wx.navigateBack() }
})
