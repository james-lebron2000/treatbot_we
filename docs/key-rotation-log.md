# 密钥轮换日志（PRD-2026Q3 T0-3）

## 用途
- 法务尽调 / 等保二级 / 商务签约 "密钥管理流程证据"。
- 每次轮换追加一行；最早一行不删，便于审计追溯。
- 历史泄露事件单独 `## 事件清单` 段落记录处置时间线。

## 字段说明
| 列 | 说明 |
| --- | --- |
| provider | 厂商或服务名（Kimi / ARK / Tencent COS / Tencent SMS / Sentry …）|
| rotated_at | 新 key 在生产生效时间（UTC+8） |
| actor | 操作人姓名（必须实名，便于追责） |
| new_fingerprint | 新 key 前 6 后 4 字符（不写完整 key） |
| old_revoked_at | 旧 key 在 provider 控制台吊销时间（UTC+8） |
| reason | 轮换原因：scheduled（90d 例行） / leaked（泄露应急） / staff_change（人员变动） |

## 轮换记录

| provider | rotated_at | actor | new_fingerprint | old_revoked_at | reason |
| --- | --- | --- | --- | --- | --- |
| _示例_ Kimi | 2026-05-01 10:00 | 张三 | <redacted-fingerprint> | 2026-05-01 10:05 | leaked |
| Kimi | _待填_ | _待填_ | _待填_ | _待填_ | leaked |
| ARK / 火山方舟 | _待填_ | _待填_ | _待填_ | _待填_ | leaked |
| Tencent COS (SecretId/Key) | _待填_ | _待填_ | _待填_ | _待填_ | leaked |
| Tencent SMS | _待填_ | _待填_ | _待填_ | _待填_ | leaked |
| Sentry DSN | _待填_ | _待填_ | _待填_ | _待填_ | leaked |

## 事件清单

### 2026-XX-XX：T0-3 历史 commit 密钥清理 + 全量轮换
- 触发：CI secret 扫描在历史 commit 仍命中。
- 处置：
  1. mirror clone 离线 tarball 备份到 COS（路径：`treatbot-backups/git-history-2026XXXX.tar.gz`）。
  2. `git filter-repo --replace-text patterns.txt --force`。
  3. `git push --mirror --force`（main 分支保护临时关闭 + 操作记录）。
  4. 5 类 key 在 provider 控制台逐一吊销 → 生成新 key → 更新 GitHub Actions Secrets。
  5. 触发一次 staging deploy + smoke test。
- 验证：`git log --all -p | grep -E "sk-[a-zA-Z0-9]{20,}|AKID[0-9A-Z]{16}"` 无命中。
- 操作人：_待填_
- 完成时间：_待填_
