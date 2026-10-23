const { state, createOrder, toast } = require('../../services/mock')
const auth = require('../../services/auth')

Page({
  data: { agents: [], agentNames: [], agentIndex: 0, merchant: '', item: '', detail: '', payAmount: '', settleAmount: '', imagePath: '' },
  onShow() {
    if (!auth.ensureAdmin()) return
    const agents = state.merchants.filter(item => item.enabled !== false)
    this.setData({ agents, agentNames: agents.map(item => `${item.name || item.username}（${item.username}）`), agentIndex: 0 })
  },
  onInput(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }) },
  chooseAgent(e) { this.setData({ agentIndex: Number(e.detail.value) }) },
  chooseImage() { wx.chooseMedia({ count: 1, mediaType: ['image'], success: ({ tempFiles }) => this.setData({ imagePath: tempFiles[0].tempFilePath }) }) },
  submit() {
    const data = this.data
    const agent = data.agents[data.agentIndex]
    if (!agent) return toast('请选择结算代理人')
    if (!data.merchant || !data.item || !data.payAmount || !data.settleAmount) return toast('请填写完整订单信息')
    const order = createOrder({
      merchant: data.merchant,
      item: data.item,
      detail: data.detail,
      payAmount: data.payAmount,
      settleAmount: data.settleAmount,
      imagePath: data.imagePath
    }, agent.id)
    if (!order) return
    toast('订单创建成功', 'success')
    setTimeout(() => wx.navigateTo({ url: `/pages/admin/orders?id=${order.id}` }), 450)
  },
  share() { toast('订单创建后可在订单详情分享') }
})
