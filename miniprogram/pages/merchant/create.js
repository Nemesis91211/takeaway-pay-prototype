const { getCurrentAgent, createOrder, toast } = require('../../services/mock')
const auth = require('../../services/auth')
Page({
  data: { merchant: '', item: '', detail: '', payAmount: '', settleAmount: '', imagePath: '', agent: {} },
  onShow() { if (!auth.ensureAgent()) return; this.setData({ agent: getCurrentAgent() }) },
  onInput(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }) },
  chooseImage() { wx.chooseMedia({ count: 1, mediaType: ['image'], success: ({ tempFiles }) => this.setData({ imagePath: tempFiles[0].tempFilePath }) }) },
  submit() {
    const d = this.data; const pay = Number(d.payAmount); const settle = Number(d.settleAmount)
    if (d.agent.enabled === false) return toast('账号已停用，暂不能创建订单')
    if (!d.merchant || !d.item || !pay || !settle) return toast('请填写完整订单信息')
    if (pay <= 0 || settle <= 0) return toast('金额必须大于 0')
    if (settle > pay) return toast('结算金额不能高于客户支付金额')
    const o = createOrder({ ...d, payAmount: pay.toFixed(2), settleAmount: settle.toFixed(2) }, d.agent.id)
    toast('订单已创建', 'success'); setTimeout(() => wx.navigateTo({ url: `/pages/merchant/orders?id=${o.id}` }), 450)
  }
})
