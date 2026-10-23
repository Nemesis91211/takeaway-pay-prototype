const DEFAULT_DURATION = 15 * 60 * 1000
const FORCE_EXPIRED_PREVIEW = false
function createOrder(options = {}) {
  const candidate = Number(options.expiresAt)
  const expiresAt = Number.isFinite(candidate) && candidate > 0
    ? candidate
    : (FORCE_EXPIRED_PREVIEW ? Date.now() - 1 : Date.now() + DEFAULT_DURATION)
  const amount = options.amount || options.payAmount || ''
  const merchant = options.merchant || ''
  const item = options.item || options.itemName || ''
  return {
    senderName: options.senderName || '商家邀请', greeting: options.greeting || '请帮我完成这笔餐品代付～',
    amount, activeAmount: amount, merchant, activeMerchant: merchant, itemName: item, activeItemName: item,
    itemDetail: options.detail || options.itemDetail || '', activeItemDetail: options.detail || options.itemDetail || '',
    quantity: options.quantity || 'x1', originalPrice: amount ? `¥${amount}` : '', activeOriginalPrice: amount ? `¥${amount}` : '',
    expiresAt, platform: options.platform || 'default'
  }
}
function getOrderState(expiresAt, now = Date.now()) {
  const remainingMs = Math.max(0, expiresAt - now)
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return { expired: remainingMs <= 0, hours, minutes, seconds, countdown: `${minutes}:${seconds}` }
}
module.exports = { createOrder, getOrderState }
