<template>
  <!--
    PRD-2026Q3 §A.2 + 用户反馈：隐私政策页。
    - 写给患者和家属看（说人话，不是法务术语堆叠）
    - 同时满足合规：版本号、收集类型、保留期、删除流程、第三方共享、联系方式
  -->
  <section class="privacy-view">
    <header class="hero">
      <div class="hero-badge">数愈健康 · 隐私政策</div>
      <h1>您的数据，您说了算</h1>
      <p class="hero-sub">
        这是我们处理您病历和个人信息的方式。我们尽量说人话；如果您看完仍有疑问，
        随时联系我们 —— 客服 <a href="tel:4006668899">400-666-8899</a>，工作日 9:00–18:00。
      </p>
      <div class="meta">
        当前版本：<strong>{{ policyVersion }}</strong> · 更新日期：2026-04-25
      </div>
    </header>

    <article class="card promise-card">
      <h2>📌 三句话讲清楚</h2>
      <ul class="promise-list">
        <li><strong>只收必要的</strong> —— 病历用于看懂诊断+找试验，没拿来卖广告</li>
        <li><strong>能带走、能删除</strong> —— 一键导出 JSON、一键注销账号，您的数据跟着走</li>
        <li><strong>不向商家卖数据</strong> —— 只在您勾选同意后，把必要信息发给招募方研究团队</li>
      </ul>
    </article>

    <nav class="toc card">
      <h3>目录</h3>
      <ol>
        <li><a href="#what">1. 我们收集了什么</a></li>
        <li><a href="#why">2. 为什么收集 / 怎么用</a></li>
        <li><a href="#how-stored">3. 存在哪里 / 保留多久</a></li>
        <li><a href="#share">4. 会不会发给别人</a></li>
        <li><a href="#rights">5. 您的权利和操作方式</a></li>
        <li><a href="#minors">6. 未成年人 / 代为操作</a></li>
        <li><a href="#contact">7. 投诉与联系</a></li>
        <li><a href="#changes">8. 政策变更</a></li>
      </ol>
    </nav>

    <article id="what" class="card section">
      <h2>1. 我们收集了什么</h2>
      <p>为了帮您匹配临床试验，我们会收到以下三类信息：</p>
      <table class="data-table">
        <thead>
          <tr><th>类别</th><th>具体内容</th><th>来源</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>账户信息</td>
            <td>手机号、登录设备型号</td>
            <td>您注册时填写</td>
          </tr>
          <tr>
            <td>病历信息</td>
            <td>诊断、分期、基因检测、PD-L1、治疗经历、影像、肿瘤标志物等</td>
            <td>您主动上传的报告 / 拍照</td>
          </tr>
          <tr>
            <td>使用行为</td>
            <td>页面浏览路径、点了哪个按钮、停留时间（不含具体内容）</td>
            <td>页面自动记录（仅用于改进产品）</td>
          </tr>
        </tbody>
      </table>
      <p class="emph">我们 <strong>不会</strong> 收集：通讯录、定位、相册里的其他照片、其它 App 数据。</p>
    </article>

    <article id="why" class="card section">
      <h2>2. 为什么收集 / 怎么用</h2>
      <p>每一项数据都对应一件具体的事，超出范围的我们不做：</p>
      <ul class="bullet-list">
        <li><strong>账户信息</strong>：用于您下次登录、找回账号、给您发送匹配结果通知。</li>
        <li><strong>病历信息</strong>：用 AI 解析出诊断、分期、关键指标，再去试验库找匹配，最后告诉您「为什么适合」。</li>
        <li><strong>使用行为</strong>：仅用于发现哪些页面卡顿、哪些按钮没人点 —— 帮我们做更好用的产品。</li>
      </ul>
      <p class="emph">
        AI 解析模型只看您的病历内容，不会把您的姓名、手机号一并传给模型。
        敏感字段（姓名、住院号、身份证号）在解析前会被自动遮蔽。
      </p>
    </article>

    <article id="how-stored" class="card section">
      <h2>3. 存在哪里 / 保留多久</h2>
      <ul class="bullet-list">
        <li><strong>存放地点</strong>：境内云服务器（腾讯云·上海），全程 HTTPS 传输 + 静态加密存储。</li>
        <li><strong>保留时长</strong>：账户存续期间一直保留，方便您下次直接看历史匹配。<strong>您注销账户后，我们会在 7 天内彻底清除您的所有数据，包括备份。</strong></li>
        <li><strong>原始照片</strong>：解析完成后，我们只保留结构化字段（如「诊断：肝癌」），<strong>原始拍照图片在 30 天后自动删除</strong>，您也可以提前手动删除。</li>
        <li><strong>访问权限</strong>：只有授权工程师在排查具体故障时才能短暂访问，所有访问留痕可审计。</li>
      </ul>
    </article>

    <article id="share" class="card section">
      <h2>4. 会不会发给别人</h2>
      <p>会，但 <strong>仅在您勾选同意后</strong>，并且仅限以下两种情形：</p>
      <ol class="ol-list">
        <li>
          <strong>研究团队（您选择报名某个试验时）</strong>：把您的病历摘要 + 联系方式发给该试验的研究协调员
          —— 这是他们联系您完成入组评估的必要前提。每一次发送您都会看到弹窗确认，可以随时取消。
        </li>
        <li>
          <strong>法律强制要求时</strong>：例如法院传票或国家卫健委合规检查 —— 我们会按法律最小化原则提供。
        </li>
      </ol>
      <p class="emph">
        我们 <strong>不向</strong> 任何商业广告、保险公司、医药销售公司出售或分享您的数据 ——
        不是「不愿意」，是我们从架构层就没做这条路，做不到。
      </p>
    </article>

    <article id="rights" class="card section">
      <h2>5. 您的权利和操作方式</h2>
      <table class="data-table">
        <thead>
          <tr><th>权利</th><th>怎么做</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>查看 / 修改我的病历</td>
            <td>「我的病历」页直接编辑</td>
          </tr>
          <tr>
            <td>导出我的全部数据（JSON）</td>
            <td>「我的」→「导出我的数据」</td>
          </tr>
          <tr>
            <td>删除某一份病历</td>
            <td>「我的病历」长按 → 删除（软删除，30 天可恢复）</td>
          </tr>
          <tr>
            <td>撤回某一项同意</td>
            <td>「我的」→「我的同意记录」 → 单独撤回</td>
          </tr>
          <tr>
            <td>注销账号 + 清除所有数据</td>
            <td>「我的」→「注销账号」 → 二次确认</td>
          </tr>
          <tr>
            <td>对处理方式有异议</td>
            <td>邮件至 <a href="mailto:privacy@inseq.top">privacy@inseq.top</a> 或拨打客服电话</td>
          </tr>
        </tbody>
      </table>
    </article>

    <article id="minors" class="card section">
      <h2>6. 未成年人 / 代为操作</h2>
      <p>
        本产品面向 18 岁及以上的患者本人或直系亲属。如果您是 <strong>替家人代操作</strong>（最常见的场景），
        请确保您获得了家人的明确授权 —— 我们对所有同意行为留有记录，由代操作人承担授权真实性责任。
      </p>
      <p>
        若发现未授权代操作，本人可以致电客服立即冻结账户，我们 24 小时内处理。
      </p>
    </article>

    <article id="contact" class="card section">
      <h2>7. 投诉与联系</h2>
      <ul class="bullet-list">
        <li>客服电话：<a href="tel:4006668899">400-666-8899</a>（9:00–18:00）</li>
        <li>隐私邮件：<a href="mailto:privacy@inseq.top">privacy@inseq.top</a>（48 小时内回复）</li>
        <li>书面投诉：上海市浦东新区张江高科 数愈健康 隐私合规专员 收</li>
        <li>监管渠道：如对我们的处理不满意，您可以向网信办 12377 或所在地卫健委投诉</li>
      </ul>
    </article>

    <article id="changes" class="card section">
      <h2>8. 政策变更</h2>
      <p>
        如果我们调整了处理方式，会做两件事：
      </p>
      <ol class="ol-list">
        <li>更新页面顶部的版本号 + 更新日期</li>
        <li>在您下次进入上传或报名时，弹窗显示新条款 —— 您可以重新选择同意或拒绝</li>
      </ol>
      <p>
        旧版本的政策内容我们也会保留可追溯（30 天内联系客服可索取）。
      </p>
    </article>

    <footer class="bottom-actions">
      <button class="btn ghost" @click="goBack">← 返回</button>
      <a class="btn primary" :href="mailtoLink">写邮件给我们</a>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { POLICY_VERSION } from '../constants/privacy'

const router = useRouter()
const policyVersion = POLICY_VERSION
const mailtoLink = 'mailto:privacy@inseq.top?subject=' + encodeURIComponent('隐私问题 / ' + POLICY_VERSION)

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}
</script>

<style scoped>
.privacy-view {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px 16px 80px;
  color: #1f2937;
  font-size: 0.95rem;
  line-height: 1.7;
}

.hero {
  text-align: left;
  margin-bottom: 16px;
}

.hero-badge {
  display: inline-block;
  background: #ecfdf5;
  color: #065f46;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}

.hero h1 {
  margin: 12px 0 8px;
  font-size: 1.5rem;
  color: #0f172a;
}

.hero-sub {
  color: #475569;
  margin: 0 0 12px;
}

.meta {
  font-size: 0.84rem;
  color: #64748b;
}

.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 14px;
}

.promise-card {
  background: linear-gradient(135deg, #ecfdf5 0%, #eff6ff 100%);
  border-color: #d1fae5;
}

.promise-list {
  margin: 8px 0 0;
  padding-left: 22px;
}

.promise-list li {
  margin-bottom: 6px;
}

.toc h3 {
  margin: 0 0 8px;
  font-size: 1rem;
  color: #475569;
}

.toc ol {
  margin: 0;
  padding-left: 22px;
  color: #1e40af;
}

.toc a {
  color: inherit;
  text-decoration: none;
}

.toc a:hover {
  text-decoration: underline;
}

.section {
  scroll-margin-top: 16px;
}

.section h2 {
  margin: 0 0 10px;
  font-size: 1.1rem;
  color: #0f172a;
}

.bullet-list,
.ol-list {
  margin: 0 0 8px;
  padding-left: 22px;
}

.bullet-list li,
.ol-list li {
  margin-bottom: 6px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 0.9rem;
}

.data-table th,
.data-table td {
  border: 1px solid #e5e7eb;
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}

.data-table th {
  background: #f9fafb;
  color: #374151;
  font-weight: 600;
}

.emph {
  margin: 8px 0 0;
  padding: 8px 12px;
  background: #fffbeb;
  border-left: 3px solid #f59e0b;
  border-radius: 0 6px 6px 0;
  color: #78350f;
  font-size: 0.9rem;
}

a {
  color: #1e40af;
}

.bottom-actions {
  display: flex;
  gap: 10px;
  margin-top: 24px;
}

.bottom-actions .btn {
  flex: 1;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 0.95rem;
  text-align: center;
  text-decoration: none;
  border: 1px solid transparent;
  cursor: pointer;
}

.bottom-actions .btn.ghost {
  background: #fff;
  border-color: #d1d5db;
  color: #374151;
}

.bottom-actions .btn.primary {
  background: #1e40af;
  color: #fff;
}
</style>
