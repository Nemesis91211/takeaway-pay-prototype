const api = require('../../services/api')
const auth = require('../../services/auth')
const { hydrate } = require('../../services/mock')

Page({
  data: { oldPassword: '', newPassword: '', confirmPassword: '', loading: false, error: '', force: false },
  onLoad(options) {
    if (!auth.getSession()) return wx.reLaunch({ url: '/pages/login/index' })
    this.setData({ force: options.force === '1' })
  },
  onInput(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value, error: '' }) },
  submit() {
    if (this.data.loading) return
    const session = auth.getSession()
    if (!session) return wx.reLaunch({ url: '/pages/login/index' })
    const oldPassword = this.data.oldPassword
    const newPassword = this.data.newPassword
    if (!oldPassword) return this.setData({ error: '请输入原密码' })
    if (newPassword.length < 8) return this.setData({ error: '新密码至少 8 位' })
    if (newPassword !== this.data.confirmPassword) return this.setData({ error: '两次输入的新密码不一致' })
    if (newPassword === oldPassword) return this.setData({ error: '新密码不能与原密码相同' })
    this.setData({ loading: true, error: '' })
    api.changePassword({ oldPassword, newPassword })
      .then(() => {
        auth.setSession({ ...session, mustChangePassword: false })
        if (!this.data.force) {
          wx.showToast({ title: '密码已更新', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 500)
          return null
        }
        return hydrate()
          .catch(() => false)
          .then(() => wx.reLaunch({ url: auth.homePath() }))
      })
      .catch(error => this.setData({ loading: false, error: error.message || '修改失败，请重试' }))
  },
  cancel() { wx.navigateBack() }
})
