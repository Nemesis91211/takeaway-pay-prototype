const { platforms } = require('../../config/platforms')
const { getOrderState } = require('../../services/order')
const { state, findOrder, submitPaid, toast, ORDER_DURATION } = require('../../services/mock')
const api = require('../../services/api')
Page({
  data: { order: {}, theme: platforms.default, status: { expired: false, countdown: '15:00' }, shareImagePath: '', showShareGuide: false, invalid: false, loading: true },
  onLoad(options) {
    const token = options.token || options.orderId
    if (!token) return this.setData({ invalid: true, loading: false })
    const local = findOrder(options.orderId || token) || (state.orders || []).find(item => item.shareToken === token)
    const apply = saved => {
      if (!saved) return this.setData({ invalid: true, loading: false })
      const savedExpiresAt = saved.expiresAt || Date.now() + ORDER_DURATION
      const order = { senderName: '商家邀请', greeting: '请帮我完成这笔餐品代付～', amount: saved.payAmount, activeAmount: saved.payAmount, merchant: saved.merchant, activeMerchant: saved.merchant, itemName: saved.item, activeItemName: saved.item, itemDetail: saved.detail, activeItemDetail: saved.detail, originalPrice: `¥${saved.payAmount}`, activeOriginalPrice: `¥${saved.payAmount}`, quantity: 'x1', orderId: saved.id || saved._id, shareToken: saved.shareToken || '', status: saved.status || '', expiresAt: savedExpiresAt, platform: options.platform || 'default' }
      this.setData({ order, theme: platforms[order.platform] || platforms.default, invalid: false, loading: false }, () => this.refreshCountdown())
    }
    if (typeof wx !== 'undefined' && wx.cloud && wx.cloud.callFunction) api.getSharedOrder(token).then(apply).catch(() => apply(local))
    else apply(local)
  },
  onShow() { this.refreshCountdown(); this.startTimer() },
  onReady() { this.renderShareCover() },
  onHide() { this.stopTimer() },
  onUnload() { this.stopTimer() },
  startTimer() { this.stopTimer(); this.timer = setInterval(() => this.refreshCountdown(), 1000) },
  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null } },
  refreshCountdown() {
    if (!this.data.order.expiresAt) return
    const status = getOrderState(this.data.order.expiresAt)
    this.setData({ status })
    const shareBucket = `${status.expired ? 'ended' : status.countdown.slice(0, -1)}`
    if (shareBucket !== this.shareBucket) {
      this.shareBucket = shareBucket
      this.renderShareCover()
    }
    if (status.expired) this.stopTimer()
  },
  renderShareCover() {
    if (!this.data.order.expiresAt || !wx.createCanvasContext) return
    const ctx = wx.createCanvasContext('shareCanvas', this)
    const { status } = this.data
    ctx.setFillStyle('#FFD62E')
    ctx.fillRect(0, 0, 500, 400)
    ctx.setFillStyle('#FFBE18')
    ctx.beginPath(); ctx.arc(430, 62, 80, 0, Math.PI * 2); ctx.fill()
    ctx.setFillStyle('#FFF5B7')
    ctx.beginPath(); ctx.arc(70, 340, 90, 0, Math.PI * 2); ctx.fill()
    ctx.setFillStyle('#2A2414')
    ctx.setFontSize(28)
    ctx.fillText('朋友邀请你查看订单', 52, 72)
    ctx.setFillStyle('#FFFFFF')
    ctx.fillRect(70, 105, 360, 210)
    ctx.setFillStyle('#8B8E92')
    ctx.setFontSize(20)
    ctx.fillText(status.expired ? '订单状态' : '剩余处理时间', 182, 145)
    ctx.setFillStyle('#202124')
    ctx.setFontSize(54)
    ctx.fillText(status.expired ? '已取消' : status.countdown, status.expired ? 174 : 165, 210)
    ctx.setFillStyle('#FFE15B')
    ctx.fillRect(120, 244, 260, 48)
    ctx.setFillStyle('#3A3000')
    ctx.setFontSize(21)
    ctx.fillText(status.expired ? '查看详情' : '查看订单', 205, 276)
    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: 'shareCanvas',
        x: 0, y: 0, width: 500, height: 400,
        destWidth: 500, destHeight: 400,
        success: ({ tempFilePath }) => this.setData({ shareImagePath: tempFilePath }),
        fail: () => {},
      }, this)
    })
  },
  acknowledge() { wx.showToast({ title: '已了解', icon: 'none' }) },
  showShareGuide() { this.setData({ showShareGuide: true }) },
  hideShareGuide() { this.setData({ showShareGuide: false }) },
  noop() {},
  goToPayment() {
    const { order } = this.data
    wx.navigateTo({
      url: `/pages/payment/index?expiresAt=${order.expiresAt}&platform=${order.platform}&amount=${encodeURIComponent(order.activeAmount || '')}&merchant=${encodeURIComponent(order.activeMerchant || '')}&item=${encodeURIComponent(order.activeItemName || '')}`
    })
  },
  notifyPaid() {
    if (!this.data.order.orderId) return toast('订单链接无效')
    if (this.data.order.status && this.data.order.status !== '待客户付款') return toast('订单当前不可重复提交付款通知')
    submitPaid(this.data.order.orderId, { token: this.data.order.shareToken })
    toast('已提交付款，等待管理员审核', 'success')
    this.setData({ paidNotice: true })
  },
  onShareAppMessage() {
    const { order } = this.data
    return { title: `${order.senderName}邀请你查看一笔餐饮订单`, path: `/pages/index/index?token=${order.shareToken || order.orderId || ''}&expiresAt=${order.expiresAt}&platform=${order.platform}`, imageUrl: this.data.shareImagePath || '/assets/share-cover.png' }
  }
})
