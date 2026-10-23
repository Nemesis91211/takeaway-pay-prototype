const { platforms } = require('../../config/platforms')
const { createOrder, getOrderState } = require('../../services/order')

Page({
  data: { order: {}, theme: platforms.default, status: { countdown: '15:00', expired: false } },
  onLoad(options) {
    const order = createOrder(options)
    this.setData({ order, theme: platforms[order.platform] || platforms.default })
    this.refreshCountdown()
  },
  onShow() { this.startTimer() },
  onHide() { this.stopTimer() },
  onUnload() { this.stopTimer() },
  startTimer() { this.stopTimer(); this.timer = setInterval(() => this.refreshCountdown(), 1000) },
  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null } },
  refreshCountdown() {
    if (!this.data.order.expiresAt) return
    const status = getOrderState(this.data.order.expiresAt)
    this.setData({ status })
    if (status.expired) this.stopTimer()
  },
  confirmForTest() {
    wx.showToast({ title: '测试页面，未发起支付', icon: 'none' })
  }
})
