const { state, getCurrentAgent, toast, updateProfile } = require('../../services/mock')
const auth = require('../../services/auth')
const api = require('../../services/api')

Page({
  data: { profile: {}, settings: {} },
  onShow() {
    if (!auth.ensureAgent()) return
    const profile = getCurrentAgent()
    this.setData({ profile, settings: { payoutMethod: profile.payoutMethod || state.settings.payoutAccount, withdrawEnabled: state.settings.merchantWithdrawEnabled, reviewMode: state.settings.reviewMode } })
  },
  changeAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: ({ tempFilePaths }) => {
        const filePath = tempFilePaths && tempFilePaths[0]
        if (!filePath) return
        wx.showLoading({ title: '上传中', mask: true })
        api.uploadAvatar(filePath).then(fileID => {
          updateProfile({ avatar: fileID })
          auth.setSession({ ...auth.getSession(), avatar: fileID })
          this.onShow()
          toast('头像已更新', 'success')
        }).catch(() => toast('头像上传失败，请重试')).then(() => wx.hideLoading())
      }
    })
  },
  editName() { wx.showModal({ title: '修改代理人名称', editable: true, content: this.data.profile.name || '', success: r => { if (r.confirm && r.content && r.content.trim()) { const name = r.content.trim(); updateProfile({ name }); auth.setSession({ ...auth.getSession(), name }); this.onShow() } } }) },
  editContact() { wx.showModal({ title: '修改联系人', editable: true, content: this.data.profile.contact || '', success: r => { if (r.confirm && r.content && r.content.trim()) { updateProfile({ contact: r.content.trim() }); this.onShow() } } }) },
  account() { wx.showActionSheet({ itemList: ['微信零钱', '指定银行卡'], success: ({ tapIndex }) => { const payoutMethod = tapIndex === 0 ? '微信零钱' : '指定银行卡'; updateProfile({ payoutMethod }); this.onShow(); toast('收款方式已更新', 'success') } }) },
  security() { wx.navigateTo({ url: '/pages/password/index' }) },
  logout() { wx.showModal({ title: '退出登录？', content: '退出后需要重新输入账号密码。', confirmText: '退出', success: result => { if (result.confirm) auth.logout() } }) },
  home() { wx.redirectTo({ url: '/pages/merchant/index' }) },
  orders() { wx.redirectTo({ url: '/pages/merchant/orders' }) },
  wallet() { wx.redirectTo({ url: '/pages/merchant/wallet' }) }
})
