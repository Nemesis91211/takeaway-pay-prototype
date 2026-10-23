const { state, toast, createAdmin, updateAdmin, resetAdminPassword } = require('../../services/mock')
const auth = require('../../services/auth')

Page({
  data: {
    admins: [], total: 0, enabledCount: 0, superCount: 0,
    showForm: false, editingId: '', formTitle: '新增管理员',
    username: '', name: '', phone: '', email: '', department: '',
    roleOptions: ['管理员', '超级管理员'], roleIndex: 0
  },
  onShow() {
    if (!auth.ensureSuperAdmin()) return
    this.refresh()
  },
  refresh() {
    const session = auth.getSession() || {}
    const admins = (state.admins || []).map(item => ({
      ...item,
      roleLabel: item.role === 'super_admin' ? '超级管理员' : '管理员',
      isSelf: item.id === session.id
    }))
    this.setData({
      admins,
      total: admins.length,
      enabledCount: admins.filter(item => item.enabled !== false).length,
      superCount: admins.filter(item => item.role === 'super_admin').length
    })
  },
  showAdd() {
    this.setData({ showForm: true, editingId: '', formTitle: '新增管理员', username: '', name: '', phone: '', email: '', department: '', roleIndex: 0 })
  },
  edit(e) {
    const item = state.admins.find(admin => admin.id === e.currentTarget.dataset.id)
    if (!item) return
    this.setData({ showForm: true, editingId: item.id, formTitle: '编辑管理员资料', username: item.username || '', name: item.name || '', phone: item.phone || '', email: item.email || '', department: item.department || '', roleIndex: item.role === 'super_admin' ? 1 : 0 })
  },
  closeForm() { this.setData({ showForm: false, editingId: '' }) },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }) },
  chooseRole(e) { this.setData({ roleIndex: Number(e.detail.value) }) },
  save() {
    const data = this.data
    if (!data.username || !data.name) return toast('登录账号和姓名不能为空')
    if (data.editingId) {
      updateAdmin(data.editingId, { username: data.username, name: data.name, phone: data.phone, email: data.email, department: data.department })
      this.closeForm(); this.refresh(); return toast('管理员资料已更新', 'success')
    }
    wx.showLoading({ title: '创建中', mask: true })
    createAdmin({
      username: data.username,
      name: data.name,
      phone: data.phone,
      email: data.email,
      department: data.department,
      role: data.roleIndex === 1 ? 'super_admin' : 'admin'
    }).then(admin => {
      wx.hideLoading(); this.closeForm(); this.refresh()
      wx.showModal({ title: '管理员创建成功', content: `账号：${admin.username}\n初始密码：${admin.defaultPassword}\n首次登录需修改密码。`, showCancel: false, confirmText: '我已记录' })
    }).catch(error => { wx.hideLoading(); toast(error.message || '创建失败，请重试') })
  },
  toggle(e) {
    const id = e.currentTarget.dataset.id
    const session = auth.getSession() || {}
    if (id === session.id) return toast('不能停用当前登录账号')
    const item = state.admins.find(admin => admin.id === id)
    if (!item) return
    updateAdmin(id, { enabled: !item.enabled })
    this.refresh()
    toast(item.enabled ? '账号已停用' : '账号已启用', 'success')
  },
  resetPassword(e) {
    const id = e.currentTarget.dataset.id
    const session = auth.getSession() || {}
    if (id === session.id) return wx.navigateTo({ url: '/pages/password/index' })
    wx.showLoading({ title: '重置中', mask: true })
    resetAdminPassword(id).then(password => {
      wx.hideLoading()
      wx.showModal({ title: '密码已重置', content: `新密码：${password}\n该管理员需使用新密码重新登录。`, showCancel: false, confirmText: '我已记录' })
    }).catch(error => { wx.hideLoading(); toast(error.message || '重置失败，请重试') })
  },
  back() { wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/admin/settings' }) }) }
})
