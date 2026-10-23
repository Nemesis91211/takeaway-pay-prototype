const { state, toast, updateSettings, updateProfile } = require('../../services/mock')
const auth = require('../../services/auth')
const api = require('../../services/api')

Page({
  data: { user: {}, roleLabel: '', isSuper: false, settings: {}, profileForm: {}, showProfileEditor: false },
  onShow() {
    if (!auth.ensureAdmin()) return
    const user = auth.getSession() || {}
    this.setData({
      user,
      roleLabel: user.role === 'super_admin' ? '超级管理员' : '管理员',
      isSuper: user.role === 'super_admin',
      settings: state.settings,
      profileForm: this.getProfileForm(user),
      showProfileEditor: false
    })
  },
  getProfileForm(user) {
    return { name: user.name || '', phone: user.phone || '', email: user.email || '', department: user.department || '' }
  },
  save() { updateSettings(this.data.settings); toast('管理员设置已保存', 'success') },
  choose(e) {
    const type = e.currentTarget.dataset.type
    const items = type === 'review' ? ['人工审核后结算', '自动结算（暂不启用）'] : type === 'timeout' ? ['自动审核通过', '自动驳回'] : ['微信账户', '银行卡账户']
    const key = type === 'review' ? 'reviewMode' : type === 'timeout' ? 'reviewTimeoutAction' : 'payoutAccount'
    wx.showActionSheet({ itemList: items, success: ({ tapIndex }) => { const value = items[tapIndex]; updateSettings({ [key]: value }); this.setData({ [`settings.${key}`]: value }); toast('设置已更新', 'success') } })
  },
  toggle(e) { updateSettings({ merchantWithdrawEnabled: e.detail.value }); this.setData({ 'settings.merchantWithdrawEnabled': e.detail.value }); toast(e.detail.value ? '已开启代理人提现' : '已关闭代理人提现') },
  toggleNotify(e) { updateSettings({ notifyOnPending: e.detail.value }); this.setData({ 'settings.notifyOnPending': e.detail.value }); toast(e.detail.value ? '已开启待审提醒' : '已关闭待审提醒') },
  threshold() { wx.showActionSheet({ itemList: ['1 笔', '3 笔', '5 笔', '10 笔'], success: ({ tapIndex }) => { const value = [1, 3, 5, 10][tapIndex]; updateSettings({ pendingAlertThreshold: value }); this.setData({ 'settings.pendingAlertThreshold': value }) } }) },
  editProfile() { this.setData({ profileForm: this.getProfileForm(this.data.user), showProfileEditor: true }) },
  changeAvatar() {
    const pickImage = () => {
      const handler = ({ tempFilePath }) => {
        if (!tempFilePath) return
        // 立即用临时路径回填，让用户马上看到头像变化
        this.setData({ 'user.avatar': tempFilePath })
        // 后台异步上传到云存储，成功后用 fileID 持久化
        wx.showLoading({ title: '上传中', mask: true })
        api.uploadAvatar(tempFilePath).then(fileID => {
          updateProfile({ avatar: fileID })
          auth.setSession({ ...auth.getSession(), avatar: fileID })
          toast('头像已更新', 'success')
        }).catch(() => toast('头像上传失败，请稍后重试')).then(() => wx.hideLoading())
      }
      // 优先用 wx.chooseMedia（基础库 2.10.0+），降级用 wx.chooseImage
      if (wx.chooseMedia) {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sizeType: ['compressed'],
          success: res => handler(res.tempFiles[0]),
          fail: () => {}
        })
      } else {
        wx.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          success: ({ tempFilePaths }) => handler({ tempFilePath: tempFilePaths && tempFilePaths[0] })
        })
      }
    }
    pickImage()
  },
  inputProfile(e) { this.setData({ [`profileForm.${e.currentTarget.dataset.key}`]: e.detail.value }) },
  cancelProfile() { this.setData({ showProfileEditor: false }) },
  saveProfile() {
    const form = this.data.profileForm
    const name = (form.name || '').trim()
    const phone = (form.phone || '').trim()
    if (!name) return toast('请填写管理员姓名')
    if (phone && !/^[+\d][\d\s-]{5,19}$/.test(phone)) return toast('手机号格式不正确')
    const patch = { name, phone, email: (form.email || '').trim(), department: (form.department || '').trim() }
    updateProfile(patch)
    auth.setSession({ ...auth.getSession(), ...patch })
    this.setData({ showProfileEditor: false })
    this.onShow()
    toast('个人信息已保存', 'success')
  },
  changePassword() { wx.navigateTo({ url: '/pages/password/index' }) },
  admins() { wx.navigateTo({ url: '/pages/admin/admins' }) },
  logout() { wx.showModal({ title: '退出登录？', content: '退出后需要重新输入账号密码。', confirmText: '退出', success: result => { if (result.confirm) auth.logout() } }) },
  audit() { wx.navigateTo({ url: '/pages/admin/audit' }) },
  cleanup() {
    wx.showModal({
      title: '执行过期清理？',
      content: '将自动取消超时未付款订单，并按当前"审核超时处理"设置自动处理审核超时订单。此操作会写入审计日志。',
      confirmText: '立即执行',
      success: result => {
        if (!result.confirm) return
        wx.showLoading({ title: '清理中', mask: true })
        api.cleanExpiredOrders().then(res => {
          wx.hideLoading()
          const parts = []
          if (res.cancelledCount) parts.push(`取消 ${res.cancelledCount} 笔过期订单`)
          if (res.autoApprovedCount) parts.push(`自动结算 ${res.autoApprovedCount} 笔`)
          if (res.autoRejectedCount) parts.push(`自动驳回 ${res.autoRejectedCount} 笔`)
          toast(parts.length ? parts.join(' · ') : '没有需要清理的订单', parts.length ? 'success' : 'none')
        }).catch(err => { wx.hideLoading(); toast(err.message || '清理失败') })
      }
    })
  },
  home() { wx.redirectTo({ url: '/pages/admin/index' }) },
  merchants() { wx.navigateTo({ url: '/pages/admin/merchants' }) },
  orders() { wx.redirectTo({ url: '/pages/admin/orders' }) },
  withdrawals() { wx.redirectTo({ url: '/pages/admin/withdrawals' }) }
})
