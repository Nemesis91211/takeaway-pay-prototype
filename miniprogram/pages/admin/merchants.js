const { state, toast, createMerchant, updateMerchant } = require('../../services/mock')
const auth = require('../../services/auth')

Page({
  data: { list: [], allList: [], totalCount: 0, enabledCount: 0, pendingCount: 0, showForm: false, editingId: '', formTitle: '新增代理人', username: '', phone: '', name: '', contact: '', email: '', note: '', keyword: '', filter: '全部', monitorAgent: null },
  onShow() { if (!auth.ensureAdmin()) return; this.refresh() },
  refresh() { const all = state.merchants.map(m => { const orders = state.orders.filter(o => o.merchantId === m.id); const pending = orders.filter(o => o.status === '待审核').length; const settled = orders.filter(o => o.status === '已审核').reduce((sum, o) => sum + Number(o.settleAmount || 0), 0); return { ...m, username: m.username || m.name, balanceDisplay: Number(m.balance || 0).toFixed(2), orderCount: orders.length, pending, settledDisplay: settled.toFixed(2), risk: !m.enabled ? '账号已停用' : pending >= 3 ? '待审核较多' : '正常' } }); this.setData({ allList: all, totalCount: all.length, enabledCount: all.filter(m => m.enabled).length, pendingCount: all.reduce((n, m) => n + m.pending, 0) }, () => this.applyFilter()) },
  applyFilter() { const key = this.data.keyword.trim().toLowerCase(); const list = this.data.allList.filter(m => (!key || [m.name, m.username, m.contact, m.phone].some(v => String(v || '').toLowerCase().includes(key))) && (this.data.filter === '全部' || (this.data.filter === '启用中' ? m.enabled : !m.enabled))); this.setData({ list }) },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }, () => e.currentTarget.dataset.key === 'keyword' && this.applyFilter()) },
  setFilter(e) { this.setData({ filter: e.currentTarget.dataset.filter }, () => this.applyFilter()) },
  showAdd() { this.setData({ showForm: true, editingId: '', formTitle: '新增代理人', username: '', phone: '', name: '', contact: '', email: '', note: '' }) },
  edit(e) { const m = state.merchants.find(item => item.id === e.currentTarget.dataset.id); this.setData({ showForm: true, editingId: m.id, formTitle: '编辑代理人资料', username: m.username || m.name, phone: m.phone || '', name: m.name || '', contact: m.contact || '', email: m.email || '', note: m.note || '' }) },
  closeForm() { this.setData({ showForm: false, editingId: '' }) },
  save() {
    const d = this.data
    if (!d.username || !d.phone) return toast('账号和手机号为必填项')
    if (d.editingId) {
      updateMerchant(d.editingId, { username: d.username, name: d.name || d.username, phone: d.phone, contact: d.contact, email: d.email, note: d.note })
      this.closeForm(); this.refresh(); return toast('代理人资料已更新', 'success')
    }
    wx.showLoading({ title: '创建中', mask: true })
    createMerchant({ username: d.username, name: d.name || d.username, phone: d.phone, contact: d.contact, email: d.email, note: d.note })
      .then(agent => {
        wx.hideLoading(); this.closeForm(); this.refresh()
        wx.showModal({ title: '代理人创建成功', content: `账号：${agent.username}\n初始密码：${agent.defaultPassword}\n首次登录需修改密码。`, showCancel: false, confirmText: '我已记录' })
      })
      .catch(error => { wx.hideLoading(); toast(error.message || '创建失败，请重试') })
  },
  toggle(e) { const merchant = state.merchants.find(m => m.id === e.currentTarget.dataset.id); updateMerchant(merchant.id, { enabled: !merchant.enabled }); this.refresh(); toast(merchant.enabled ? '账号已启用' : '账号已停用', 'success') },
  monitor(e) { const m = this.data.allList.find(item => item.id === e.currentTarget.dataset.id); this.setData({ monitorAgent: m }) },
  closeMonitor() { this.setData({ monitorAgent: null }) },
  monitorAction(e) { const action = e.currentTarget.dataset.action; const m = this.data.monitorAgent; if (action === 'edit') { this.closeMonitor(); this.edit({ currentTarget: { dataset: { id: m.id } } }) } else if (action === 'orders') { this.closeMonitor(); wx.redirectTo({ url: '/pages/admin/orders' }) } else if (action === 'toggle') { this.closeMonitor(); this.toggle({ currentTarget: { dataset: { id: m.id } } }) } },
  settings() { wx.redirectTo({ url:'/pages/admin/settings' }) }, home() { wx.redirectTo({ url:'/pages/admin/index' }) }, orders() { wx.redirectTo({ url:'/pages/admin/orders' }) }, withdrawals() { wx.redirectTo({ url:'/pages/admin/withdrawals' }) }
})
