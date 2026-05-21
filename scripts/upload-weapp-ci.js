#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')

const root = path.resolve(__dirname, '..')

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

const parseArgs = () => {
  const args = process.argv.slice(2)
  const out = {}
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = args[i + 1]
    if (!next || next.startsWith('--')) {
      out[key] = '1'
    } else {
      out[key] = next
      i += 1
    }
  }
  return out
}

const ensurePrivateKeyPath = ({ privateKey, privateKeyPath }) => {
  if (privateKeyPath) {
    if (!fs.existsSync(privateKeyPath)) {
      throw new Error(`WEAPP private key file does not exist: ${privateKeyPath}`)
    }
    return { privateKeyPath, cleanup: () => {} }
  }
  if (!privateKey) {
    throw new Error('Missing WEAPP_UPLOAD_PRIVATE_KEY or WEAPP_UPLOAD_PRIVATE_KEY_PATH')
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'treatbot-weapp-key-'))
  const keyPath = path.join(tmpDir, 'private.key')
  fs.writeFileSync(keyPath, privateKey.replace(/\\n/g, '\n'), { mode: 0o600 })
  return {
    privateKeyPath: keyPath,
    cleanup: () => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_e) {}
    }
  }
}

const main = async () => {
  let ci
  try {
    ci = require('miniprogram-ci')
  } catch (err) {
    throw new Error('miniprogram-ci is not installed. Run: npm install --no-save miniprogram-ci@2.1.31')
  }

  const args = parseArgs()
  const projectConfig = readJson(path.join(root, 'project.config.json'))
  const mode = args.mode || process.env.WEAPP_UPLOAD_MODE || 'upload'
  const appid = args.appid || process.env.WEAPP_APPID || projectConfig.appid
  const version = args.version || process.env.WEAPP_VERSION || `ci-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12)}`
  const desc = `${args.desc || process.env.WEAPP_DESC || `Treatbot ${version}`}`.slice(0, 180)
  const robot = Number(args.robot || process.env.WEAPP_UPLOAD_ROBOT || 1)
  const qrcodeOutputDest = args.qr || process.env.WEAPP_PREVIEW_QR || path.join(root, 'weapp-preview-qrcode.jpg')
  const key = ensurePrivateKeyPath({
    privateKey: process.env.WEAPP_UPLOAD_PRIVATE_KEY,
    privateKeyPath: args.privateKeyPath || process.env.WEAPP_UPLOAD_PRIVATE_KEY_PATH
  })

  try {
    const project = new ci.Project({
      appid,
      type: 'miniProgram',
      projectPath: root,
      privateKeyPath: key.privateKeyPath,
      ignores: [
        'node_modules/**/*',
        'server/**/*',
        'web/**/*',
        'docs/**/*',
        '.git/**/*',
        '.github/**/*',
        'scripts/**/*',
        '**/*.test.js'
      ]
    })

    const setting = {
      es6: true,
      minify: true,
      minifyJS: true,
      minifyWXML: true,
      minifyWXSS: true,
      autoPrefixWXSS: true
    }

    if (mode === 'preview') {
      await ci.preview({
        project,
        desc,
        setting,
        qrcodeFormat: 'image',
        qrcodeOutputDest,
        robot,
        onProgressUpdate: console.log
      })
      console.log(`WeApp preview QR written to ${qrcodeOutputDest}`)
      return
    }

    await ci.upload({
      project,
      version,
      desc,
      setting,
      robot,
      onProgressUpdate: console.log
    })
    console.log(`WeApp uploaded: appid=${appid} version=${version} robot=${robot}`)
  } finally {
    key.cleanup()
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err)
  process.exit(1)
})
