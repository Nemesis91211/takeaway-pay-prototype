const { state, getCurrentAgent, getAgentWithdrawals, getAgentAvailableBalance, applyWithdraw, toast } = require('../../services/mock')
const auth = require('../../services/auth')
function maskAccount(account) { const value = String(account || ''); return value.length > 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value }
function statusClass(status) { return status === '已完成' ? 'green' : status === '已驳回' ? 'red' : '' }
Page({
  data: { amount: '', method: '微信零钱', account: '', stateBalance: '0.00', history: [], filter: '全部', detailVisible: false, selected: {} },
  onShow() { if (!auth.ensureAgent()) return; this.refresh() },
  refresh() {
    const agent = getCurrentAgent(); const filter = this.data.filter
    let history = getAgentWithdrawals(agent.id).map(item => ({ ...item, maskedAccount: maskAccount(item.account), statusClass: statusClass(item.status) }))
    if (filter !== '全部') history = history.filter(item => item.status === filter)
    this.setData({ account: agent.phone || agent.contact || '', stateBalance: getAgentAvailableBalance(agent.id).toFixed(2), history })
  },
  onInput(e) { this.setData({ amount: e.detail.value }) },
  choose() { wx.showActionSheet({ itemList: ['微信零钱', '指定银行卡'], success: ({ tapIndex }) => this.setData({ method: tapIndex === 0 ? '微信零钱' : '指定银行卡' }) }) },
  setFilter(e) { this.setData({ filter: e.currentTarget.dataset.filter }, () => this.refresh()) },
  submit() {
    if (!state.settings.merchantWithdrawEnabled) return toast('当前暂未开放提现')
    const n = Number(this.data.amount); if (!n || n <= 0) return toast('请输入提现金额'); if (n < 1) return toast('提现金额不能低于 1 元')
    if (n > Number(this.data.stateBalance)) return toast('提现金额不能超过可用余额')
    const item = applyWithdraw(n, { method: this.data.method, account: this.data.account })
    if (!item) return toast('提现申请提交失败，请稍后重试')
    this.setData({ amount: '' }); this.refresh(); toast('提现申请已提交', 'success')
  },
  openDetail(e) { const selected = this.data.history.find(item => item.id === e.currentTarget.dataset.id); if (selected) this.setData({ selected, detailVisible: true }) },
  closeDetail() { this.setData({ detailVisible: false }) },
  stopPropagation() {},
  home() { wx.redirectTo({ url: '/pages/merchant/index' }) },
  orders() { wx.redirectTo({ url: '/pages/merchant/orders' }) },
  wallet() { wx.redirectTo({ url: '/pages/merchant/wallet' }) },
  settings() { wx.redirectTo({ url: '/pages/merchant/settings' }) }
})
