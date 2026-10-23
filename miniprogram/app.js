const { envList } = require('./envList')

App({
  globalData: { productName: '外卖订单助手', cloudReady: false, cloudError: '' },
  onLaunch() {
    const envId = envList && envList[0] && envList[0].envId
    if (!wx.cloud || !wx.cloud.init) return
    try {
      const cloudOptions = envId ? { env: envId, traceUser: true } : { traceUser: true }
      wx.cloud.init(cloudOptions)
      this.globalData.cloudReady = true
    } catch (error) {
      this.globalData.cloudError = error.message || '云开发初始化失败'
    }
  }
})
