const { getCurrentAgent, getAgentOrders, getAgentWithdrawals, getAgentAvailableBalance } = require('../../services/mock')
const auth = require('../../services/auth')

Page({
  data: { agent: {}, balance: '0.00', frozen: '0.00', pendingWithdraw: '0.00', monthSettlement: '0.00', pendingPayment: 0, pendingReview: 0, settledCount: 0, tasks: [], alerts: [] },
  onShow() { if (!auth.ensureAgent()) return; this.refresh() },
  refresh() {
    const agent = getCurrentAgent()
    const orders = getAgentOrders(agent.id)
    const withdrawals = getAgentWithdrawals(agent.id)
    const settledOrders = orders.filter(o => o.status === '已审核')
    const pendingWithdrawals = withdrawals.filter(w => ['待审核', '待打款'].includes(w.status))
    const frozen = withdrawals.filter(w => w.status === '待打款').reduce((sum, w) => sum + Number(w.amount || 0), 0)
    const pendingPayment = orders.filter(o => o.status === '待客户付款').length
    const pendingReview = orders.filter(o => o.status === '待审核').length
    const tasks = [
      ...orders.filter(o => o.status === '待审核').slice(0, 2).map(o => ({ id: o.id, title: '客户付款待审核', meta: `${o.item} · ¥${o.payAmount}`, icon: '/images/icons/examples.png', type: 'review' })),
      ...orders.filter(o => o.status === '待客户付款').slice(0, 2).map(o => ({ id: o.id, title: '等待客户付款', meta: `${o.item} · 订单即将过期`, icon: '/images/icons/goods.png', type: 'payment' }))
    ].slice(0, 3)
    const alerts = []
    if (pendingReview) alerts.push({ title: `${pendingReview} 笔订单待审核`, meta: '客户已提交付款通知，请及时确认', icon: '/images/icons/examples.png', action: 'orders' })
    if (pendingWithdrawals.length) alerts.push({ title: `提现处理中 ¥${pendingWithdrawals.reduce((sum, w) => sum + Number(w.amount || 0), 0).toFixed(2)}`, meta: '管理员审核和打款完成后到账', icon: '/images/icons/business.png', action: 'wallet' })
    this.setData({ agent, balance: getAgentAvailableBalance(agent.id).toFixed(2), frozen: frozen.toFixed(2), pendingWithdraw: pendingWithdrawals.reduce((sum, w) => sum + Number(w.amount || 0), 0).toFixed(2), monthSettlement: settledOrders.reduce((sum, o) => sum + Number(o.settleAmount || 0), 0).toFixed(2), pendingPayment, pendingReview, settledCount: settledOrders.length, tasks, alerts })
  },
  create() { wx.navigateTo({ url: '/pages/merchant/create' }) },
  orders() { wx.redirectTo({ url: '/pages/merchant/orders' }) },
  wallet() { wx.redirectTo({ url: '/pages/merchant/wallet' }) },
  withdraw() { wx.navigateTo({ url: '/pages/merchant/withdraw' }) },
  settings() { wx.redirectTo({ url: '/pages/merchant/settings' }) },
  task(e) { wx.navigateTo({ url: `/pages/merchant/orders?id=${e.currentTarget.dataset.id}` }) },
  alertAction(e) { const action = e.currentTarget.dataset.action; if (action === 'orders') this.orders(); else this.wallet() }
})
