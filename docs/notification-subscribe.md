# 微信订阅消息接入手册（Plan §Phase 3.5 deferred）

> **状态：预埋。模板未审批前不要发送 —— 调用 `subscribe/send` 会被微信侧报
> `40036 invalid template_id`，且影响后续审批。**

## 为什么 deferred

`Plan §Phase 3.5`：微信订阅消息模板需到公众平台审批通过后才能发；本次实施
中模板尚未通过。因此本期只完成 schema + 接入说明 + 客户端弹窗预埋，不写
真正的发送逻辑。等模板下发后只需补一段 axios 调用，无需改 schema。

## 链路总览

```
客户端 OCR 完成弹窗
     │
     │ wx.requestSubscribeMessage({ tmplIds: ['<tmplId>'] })
     │
     │ 用户点"允许" → 客户端拿到 acceptItem
     ▼
POST /medical/subscribe-intent { recordId, tmplId }
     │
     │ 服务端 upsert（user, record, tmpl, granted_at）
     ▼
[OCR 完成事件] runOcrTask → record.update({status:'completed'})
     │
     │ queueService.notificationQueue.add({recordId})
     ▼
notificationQueue worker（待补）
     │
     │ SELECT * FROM subscribe_intents
     │   WHERE record_id=? AND sent_at IS NULL
     ▼
微信 cgi-bin/message/subscribe/send
     │
     │ 成功 → UPDATE subscribe_intents SET sent_at=NOW()
     │ 失败 → SET send_error=...，next attempt
```

## 预埋了什么

| 文件 | 状态 | 说明 |
| --- | --- | --- |
| `server/scripts/migrations/20260508_subscribe_intents.sql` | ✅ | 表结构，含两个查询索引 |
| `server/services/queue.js:notificationQueue` | ✅（壳） | Bull 队列已建，process 是 TODO 注释 |
| `server/controllers/auth.js:getWeAppAccessToken` | ✅ | access_token 缓存复用 |
| `server/controllers/medical.js:handleSubscribeIntent` | ❌ 未建 | 模板审批后建 |
| `notificationQueue.process(...)` 实现 | ❌ 未建 | 模板审批后建 |
| `MedicalRecord` 完成事件触发 enqueue | ❌ 未建 | 模板审批后建 |
| 客户端 `wx.requestSubscribeMessage` 弹窗 | ❌ 未建 | 模板审批后建 |

## 模板审批清单

到公众平台「订阅消息 → 公共模板库」选取以下两个 / 自定义申请：

1. **「OCR 识别完成通知」**
   - thing1：病历类型（"CT 报告"）
   - time2：完成时间（ISO 8601）
   - thing3：核心诊断（≤ 20 字）
   - 跳转：`pages/match/match?recordId=...`
2. **「报名状态变更通知」**（远期）
   - 不在本次范围

审批通过后将 tmplId 写入 `.env.production`：

```
WX_SUBSCRIBE_TMPL_OCR_DONE=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 模板下发后的接入工作（约 12 行 + 1 路由 + 1 客户端调用）

### 1. 服务端 controller（约 10 行）

```js
// server/controllers/medical.js
const handleSubscribeIntent = async (req, res, next) => {
  try {
    const { recordId, tmplId } = req.body || {};
    if (!recordId || !tmplId) return res.status(400).json(error('参数错误'));
    await SubscribeIntent.create({
      user_id: req.user.id, record_id: recordId, tmpl_id: tmplId, granted_at: new Date()
    });
    res.json(success(null, '已记录订阅意图'));
  } catch (e) { next(e); }
};
```

### 2. 队列消费者（约 12 行）

```js
// server/services/queue.js（替换 notificationQueue.process 占位）
notificationQueue.process(async (job) => {
  const { recordId } = job.data;
  const intents = await SubscribeIntent.findAll({ where: { record_id: recordId, sent_at: null } });
  const accessToken = await getWeAppAccessToken();
  for (const it of intents) {
    try {
      await axios.post(
        `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
        buildSubscribePayload(it, /* record */)
      );
      await it.update({ sent_at: new Date() });
    } catch (e) { await it.update({ send_error: String(e.message).slice(0, 255) }); }
  }
});
```

### 3. OCR 完成时入队（1 行）

```js
// server/services/queue.js runOcrTask 末尾
await notificationQueue.add({ recordId: record.id });
```

### 4. 客户端弹窗（约 8 行，pages/upload/upload.js）

```js
// 上传成功后，OCR 启动前
wx.requestSubscribeMessage({
  tmplIds: [getApp().globalData.config.subscribeTmplOcrDone],
  success: (r) => {
    Object.entries(r).forEach(([tmplId, status]) => {
      if (status === 'accept') {
        api.post('/medical/subscribe-intent', { recordId, tmplId });
      }
    });
  }
});
```

## 替代体验（已上线）

模板审批前用 toast + 页面 keepalive 替代：

- 用户 `onHide` 时 `wx.showToast({ title: '离开也没关系，3 分钟后回来看' })`
- 页面 keepalive 5 分钟，前台轮询自然恢复

参见 [pages/upload/upload.js](../pages/upload/upload.js) 的 `onHide` 钩子。

## 安全 / 隐私要点

- 不在订阅消息正文里写完整诊断 —— 只写"已生成报告，点击查看"，避免微信
  服务端日志留 PII。tmpl 字段用受控枚举（CT/MRI/病理/...）。
- `subscribe_intents.send_error` 不写微信原始 errmsg（可能含 access_token），
  统一用 `String(e.message).slice(0, 255)`。
- 用户注销时按 `user_id` 级联软删（`UserService.deleteAccount` 加一行）。
