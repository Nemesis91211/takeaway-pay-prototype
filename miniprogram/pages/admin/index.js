const { state } = require('../../services/mock')
const auth = require('../../services/auth')

Page({
  data: { pending: 0, withdraw: 0, orderTotal: 0, approved: 0, merchantTotal: 0, activeMerchants: 0, toPay: 0, tasks: [] },
  onShow() {
    if (!auth.ensureAdmin()) return
    const pendingOrders = state.orders.filter(o => o.status === '待审核')
    const pendingWithdrawals = state.withdrawals.filter(w => w.status === '待审核')
    const approved = state.orders.filter(o => o.status === '已审核')
    const activeMerchants = state.merchants.filter(m => m.enabled !== false)
    const toPay = state.withdrawals.filter(w => w.status === '待打款')
    this.setData({ pending: pendingOrders.length, withdraw: pendingWithdrawals.length, orderTotal: state.orders.length, approved: approved.length, merchantTotal: state.merchants.length, activeMerchants: activeMerchants.length, toPay: toPay.length, tasks: pendingOrders.slice(0, 2) })
  },
  create() { wx.navigateTo({ url: '/pages/admin/create' }) },
  orders() { wx.redirectTo({ url: '/pages/admin/orders' }) },
  reviews() { wx.navigateTo({ url: '/pages/admin/review' }) },
  merchants() { wx.navigateTo({ url: '/pages/admin/merchants' }) },
  withdrawals() { wx.redirectTo({ url: '/pages/admin/withdrawals' }) },
  settings() { wx.redirectTo({ url: '/pages/admin/settings' }) },
  task(e) { wx.navigateTo({ url: `/pages/admin/review?id=${e.currentTarget.dataset.id}` }) }
})
