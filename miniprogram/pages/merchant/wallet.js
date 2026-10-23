const { getCurrentAgent, getAgentLedger, getAgentWithdrawals, getAgentAvailableBalance } = require('../../services/mock')
const auth = require('../../services/auth')
Page({
  data: { balance: '0.00', frozen: '0.00', settled: '0.00', ledger: [], filter: '全部' },
  onShow() { if (!auth.ensureAgent()) return; this.refresh() },
  refresh() {
    const agent = getCurrentAgent(); const withdrawals = getAgentWithdrawals(agent.id); const filter = this.data.filter
    let ledger = getAgentLedger(agent.id).map(item => ({ ...item, amount: Number(item.amount).toFixed(2) }))
    if (filter === '收入') ledger = ledger.filter(item => item.type === '收入')
    if (filter === '提现') ledger = ledger.filter(item => item.type !== '收入')
    this.setData({ balance: getAgentAvailableBalance(agent.id).toFixed(2), frozen: withdrawals.filter(w => w.status === '待打款').reduce((sum, w) => sum + Number(w.amount || 0), 0).toFixed(2), settled: getAgentLedger(agent.id).filter(item => item.type === '收入').reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2), ledger })
  },
  setFilter(e) { this.setData({ filter: e.currentTarget.dataset.filter }, () => this.refresh()) },
  withdraw() { wx.navigateTo({ url: '/pages/merchant/withdraw' }) },
  home() { wx.redirectTo({ url: '/pages/merchant/index' }) },
  orders() { wx.redirectTo({ url: '/pages/merchant/orders' }) },
  settings() { wx.redirectTo({ url: '/pages/merchant/settings' }) }
})
