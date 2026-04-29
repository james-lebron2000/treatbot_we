# 密钥治理 Playbook

对应 PRD-2026Q2 §2.1。

## 密钥清单

| 名称 | 用途 | 平台 | 轮换节奏 | Oncall |
|---|---|---|---|---|
| `KIMI_API_KEY` | Moonshot OCR | moonshot.cn | 季度 | @backend |
| `OPENAI_API_KEY` | 兜底 LLM | platform.openai.com | 季度 | @backend |
| `COS_SECRET_ID` / `COS_SECRET_KEY` | 腾讯云对象存储 | console.cloud.tencent.com | 半年 | @ops |
| `OCR_SECRET_ID` / `OCR_SECRET_KEY` | 腾讯云 OCR | console.cloud.tencent.com | 半年 | @ops |
| `SMS_*`（腾讯云短信） | H5 验证码 | console.cloud.tencent.com | 半年 | @ops |
| `JWT_SECRET` | 业务 token 签名 | 本地随机 | 半年 + 事件驱动 | @backend |
| `DB_PASSWORD` / `MYSQL_ROOT_PASSWORD` | MySQL | 部署机 | 半年 | @ops |

## 本地开发

1. `cp server/.env.example server/.env`
2. 从 1Password（team vault `treatbot-dev`）拉取 dev 专用 key 填入 `.env`
3. **严禁**把 `.env` 提交到仓库。`.gitignore` 已屏蔽；预提交 hook（见 `.pre-commit-config.yaml`）会再扫一次。
4. 推 PR 前跑 `pre-commit run --all-files` 自检。

## 生产注入

- 部署机 `/etc/treatbot/prod.env`，`chmod 0600 root:root`。
- `docker compose --env-file /etc/treatbot/prod.env up -d`
- `docker inspect treatbot-api | grep -i 'SECRET\|KEY\|PASSWORD' | wc -l` 应该只有 env var 名称，不含明文值（Docker 对 inspect 的 env 是明文，改用 `--env-file` 比 `environment:` 内嵌好一些；更强的做法是 Docker Swarm secrets 或 k8s Secret）。

## 轮换流程（以 Kimi 为例）

1. 在 Moonshot 控制台新建 key B，记录 `KIMI_API_KEY_B`。
2. 把 `/etc/treatbot/prod.env` 的 `KIMI_API_KEY=...B`，`docker compose restart api`，观察日志无 401。
3. 控制台禁用旧 key A。
4. 更新 1Password；通知 team。
5. 在 `docs/deploy-state.md` 写一条轮换记录（仅时间+操作人，**绝不**写 key 片段）。

## 事件响应：疑似泄露

1. 立即在对应平台 revoke 旧 key。
2. 按"轮换流程"上线新 key。
3. 检查平台账单 / 调用日志，看是否已被滥用。
4. `git filter-repo --path .env --invert-paths`（如果泄露入了 git 历史）+ 强推 + 全员 `git reset --hard`。**这一步破坏性极强，需团队协调 10 分钟窗口，并事先打 tag `pre-filter-YYYYMMDD`**。
5. 复盘：`docs/incidents/YYYYMMDD-<short>.md`。

## CI 入闸

- `.github/workflows/secret-scan.yml`：每个 PR 和 push 跑 TruffleHog（`--only-verified --fail`），命中即红屏。
- `.pre-commit-config.yaml`：本地提交拦一道 `detect-secrets` + `gitleaks`。
- 已知 false-positives 写入 `.secrets.baseline`（首次运行 `detect-secrets scan > .secrets.baseline` 生成）。

## 待办（需协调）

- [ ] 从 git 历史彻底清除已提交过的 `.env`（需团队停机窗口）
- [ ] 所有密钥走一次全量轮换（与上一步一起做）
- [ ] `.secrets.baseline` 首次生成
- [ ] 生产机 `/etc/treatbot/prod.env` 加 systemd-managed 权限
