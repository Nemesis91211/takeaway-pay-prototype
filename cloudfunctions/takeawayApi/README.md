# takeawayApi 云函数

该函数是小程序的真实数据入口。首次调用 `bootstrap` 会尝试创建以下云数据库集合，并在 `users` 为空时写入两个开发代理人和一个开发管理员账号（`isSeed: true`，可在云开发控制台删除或修改）：

| 集合 | 用途 | 关键字段 |
| --- | --- | --- |
| `users` | 管理员/代理人资料、启停状态和余额 | `_id`, `role`, `username`, `enabled`, `balance` |
| `orders` | 订单、付款通知、审核状态和分享入口 | `_id`, `merchantId`, `status`, `payAmount`, `settleAmount`, `expiresAt` |
| `withdrawals` | 提现申请和审核/打款状态 | `_id`, `merchantId`, `amount`, `status`, `account` |
| `ledger` | 不可变余额流水 | `_id`, `merchantId`, `type`, `amount`, `orderId`/`withdrawalId` |
| `settings` | 平台单例设置，文档 ID 固定为 `platform` | `reviewMode`, `payoutAccount`, `merchantWithdrawEnabled` |
| `audit_logs` | 所有写操作审计 | `action`, `payload`, `openid`, `createdAt` |

## 微信开发者工具需要你配合的步骤

1. 开通当前 AppID 的云开发环境，复制环境 ID。
2. 把环境 ID 填到 `miniprogram/envList.js` 的 `envId`。
3. 在云函数目录右键部署 `takeawayApi`（勾选“云端安装依赖”）。

首次调用 `bootstrap` 时，云端会在空集合中写入一组可重复识别的演示数据：4 个用户（含 3 个代理人和 1 个管理员）、4 个订单、4 个提现、4 条流水和 4 条审计日志。已有非空业务集合不会被覆盖，平台设置仍保持为单条 `platform` 配置文档。
4. 编译小程序，首次启动会执行 `bootstrap`；如果集合不存在，函数会尝试自动创建。
5. 在云开发控制台确认集合和 `audit_logs` 写入，再按需要删除 `isSeed: true` 的开发数据。

本轮未实现登录。云函数已保留 `cloud.getWXContext()`、`openid` 和审计字段，但开发态角色仍由页面入口选择；正式上线前必须把角色校验改为服务端基于 `users.openid` 的权限判断。
