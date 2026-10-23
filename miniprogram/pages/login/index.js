const api = require('../../services/api')
const auth = require('../../services/auth')
const { hydrate } = require('../../services/mock')

Page({
  data: { username: '', password: '', loading: false, error: '' },
  onShow() {
    const session = auth.getSession()
    if (!session) return
    if (session.mustChangePassword) return wx.reLaunch({ url: '/pages/password/index?force=1' })
    hydrate()
      .then(() => wx.reLaunch({ url: auth.homePath() }))
      .catch(error => {
        auth.clearSession()
        this.setData({ loading: false, error: error.message || '登录状态已失效，请重新登录' })
      })
  },
  onInput(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value, error: '' }) },
  submit() {
    if (this.data.loading) return
    const username = this.data.username.trim()
    const password = this.data.password
    if (!username || !password) return this.setData({ error: '请输入账号和密码' })
    this.setData({ loading: true, error: '' })
    api.login({ username, password })
      .then(user => {
        auth.setSession(user)
        return hydrate().then(() => user)
      })
      .then(user => {
        if (user.mustChangePassword) wx.reLaunch({ url: '/pages/password/index?force=1' })
        else wx.reLaunch({ url: auth.homePath() })
      })
      .catch(error => {
        auth.clearSession()
        this.setData({ loading: false, error: error.message || '登录失败，请重试' })
      })
  }
})
