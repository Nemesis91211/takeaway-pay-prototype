const { getCurrentAgent, getAgentOrders, processReviewTimeouts, toast } = require('../../services/mock')
const auth = require('../../services/auth')
function formatRemaining(expiresAt) { if (!expiresAt) return '10:00'; const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }

Page({
  data: { list: [], filter: '全部', keyword: '', detailVisible: false, selected: {} },
  onLoad(options) { this.pendingId = options.id || '' },
  onShow() { if (!auth.ensureAgent()) return; this.refresh(); this.startTimer() },
  onHide() { this.stopTimer() },
  onUnload() { this.stopTimer() },
  startTimer() { this.stopTimer(); this.timer = setInterval(() => this.refresh(), 1000) },
  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null } },
  refresh() {
    processReviewTimeouts()
    const agent = getCurrentAgent(); const keyword = this.data.keyword.trim().toLowerCase(); const filter = this.data.filter
    let list = getAgentOrders(agent.id).map(order => ({ ...order, customerName: order.paid ? (order.userWechatName || '微信用户') : '', reviewCountdown: order.status === '待审核' ? formatRemaining(order.reviewExpiresAt) : '', statusClass: order.status === '已审核' ? 'green' : ['已驳回', '已关闭'].includes(order.status) ? 'red' : '' }))
    if (filter !== '全部') list = filter === '已关闭' ? list.filter(item => ['已驳回', '已取消'].includes(item.status)) : list.filter(item => item.status === filter)
    if (keyword) list = list.filter(item => `${item.id} ${item.item} ${item.merchant} ${item.customerName}`.toLowerCase().includes(keyword))
    this.setData({ list }, () => { if (this.pendingId) { const item = this.data.list.find(order => order.id === this.pendingId); if (item) this.openDetail({ currentTarget: { dataset: { id: item.id } } }); this.pendingId = '' } })
  },
  setFilter(e) { this.setData({ filter: e.currentTarget.dataset.filter }, () => this.refresh()) },
  onKeywordInput(e) { this.setData({ keyword: e.detail.value }, () => this.refresh()) },
  clearKeyword() { this.setData({ keyword: '' }, () => this.refresh()) },
  openDetail(e) { const selected = this.data.list.find(item => item.id === e.currentTarget.dataset.id); if (selected) this.setData({ selected, detailVisible: true }) },
  closeDetail() { this.setData({ detailVisible: false }) },
  stopPropagation() {},
  copy(e) { const item = this.data.list.find(order => order.id === e.currentTarget.dataset.id); const token = item && (item.shareToken || item.id); wx.setClipboardData({ data: `pages/index/index?token=${token || ''}`, success: () => toast('分享链接已复制', 'success') }) },
  preview() { const token = this.data.selected.shareToken || this.data.selected.id; wx.navigateTo({ url: `/pages/index/index?token=${token}` }) },
  goHome() { wx.redirectTo({ url: '/pages/merchant/index' }) },
  goWallet() { wx.redirectTo({ url: '/pages/merchant/wallet' }) },
  goSettings() { wx.redirectTo({ url: '/pages/merchant/settings' }) }
})
