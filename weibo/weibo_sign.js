/**
 * Weibo Daily Sign for Surge
 * 新浪微博每日签到（Surge 专用）
 * Author: 5jwoj (modified)
 * Version: v1.5.1
 */

console.log('--- Weibo Script Loaded (v1.5.1) ---')

const TOKEN_KEY = 'sy_token_wb'
const COOKIE_KEY = 'wb_cookie'

// 检查是否为 Surge 连通性测试 (apple.com)
const isAppleConnectivityTest = typeof $request !== 'undefined' &&
  $request.url &&
  $request.url.includes('apple.com');

// 手动运行或 Cron 运行,或 apple.com 连通性测试
let isTaskExecution = typeof $request === 'undefined' || isAppleConnectivityTest;

// Cookie 捕获模式:有请求且不是 apple.com 测试
const isCookieCapture = typeof $request !== 'undefined' &&
  $request.url &&
  !isAppleConnectivityTest;

if (isAppleConnectivityTest) {
  console.log('Surge connectivity test (apple.com) detected. Entering Task Execution mode.')
}

if (isCookieCapture) {
  console.log('Mode: Cookie Capture Interception')
  console.log(`URL: ${$request.url}`)
    ; (async () => {
      try {
        await getCookie()
      } catch (e) {
        console.log('getCookie Error: ' + e)
      } finally {
        $done()
      }
    })()
} else if (isTaskExecution) {
  console.log('Mode: Task Execution (Manual/Cron)')
  main().catch(e => {
    console.log('Critical Error: ' + e.message + '\n' + e.stack)
    $done()
  })
} else {
  console.log(`Mode: Irrelevant Request Intercepted (${$request.url || 'No URL'}) - Ignoring.`)
  $done()
}

// 全局变量声明
let wbsign = ''
let paybag = ''

async function main() {
  console.log('--- Weibo Sign Task Started ---')
  console.log('Script Version: v1.5.1')

  let tokens = $persistentStore.read(TOKEN_KEY)
  let cookies = $persistentStore.read(COOKIE_KEY)

  console.log(`Data Check - Token: ${tokens ? 'Found' : 'NotFound'}, Cookie: ${cookies ? 'Found' : 'NotFound'}`)

  if (!tokens) {
    console.log('未获取到 Weibo Token，停止执行。')
    notify('新浪微博', '未获取到 Token', '请先打开微博触发 Token 获取')
    return $done()
  }

  let tokenArr = tokens.split('#')
  let cookieArr = cookies ? cookies.split('#') : []
  console.log(`Processing ${tokenArr.length} account(s)...`)

  let summary = []
  let invalidAccounts = []  // 记录失效的账号索引

  for (let i = 0; i < tokenArr.length; i++) {
    let token = tokenArr[i]
    let cookie = cookieArr[i] || ''
    if (!token) continue

    if (!token.includes('from=')) {
      token = '&from=10B3193010' + token
    }

    console.log(`[Account ${i + 1}] Executing Daily Sign-in...`)
    await weiboSign(token)

    // 检测账号是否失效
    if (wbsign === '失效') {
      console.log(`[Account ${i + 1}] Token expired, marking for deletion.`)
      invalidAccounts.push(i)
    }

    if (cookie) {
      console.log(`[Account ${i + 1}] Executing Wallet Sign-in...`)
      await paySign(token, cookie)

      // 检测 Cookie 是否失效
      if (paybag === '失效') {
        console.log(`[Account ${i + 1}] Cookie expired.`)
        // Cookie 失效不影响 Token,仅标记
      }
    } else {
      paybag = '钱包:无'
      console.log(`[Account ${i + 1}] Skip wallet sign-in: No SUB cookie found.`)
    }

    // 简化通知内容
    let wbRes = wbsign.replace('签到:', '').replace('每日签到：', '')
    let payRes = paybag.replace('钱包签到：', '').replace('钱包:', '')
    summary.push(`[${i + 1}] 微博:${wbRes} | 钱包:${payRes}`)

    // 账号间增加延迟
    if (i < tokenArr.length - 1) {
      console.log('Wait 1s for the next account...')
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  console.log('--- Summary Notification ---')

  // 清理失效账号
  if (invalidAccounts.length > 0) {
    console.log(`Cleaning up ${invalidAccounts.length} invalid account(s)...`)

    // 过滤掉失效的账号
    let validTokens = tokenArr.filter((_, idx) => !invalidAccounts.includes(idx))
    let validCookies = cookieArr.filter((_, idx) => !invalidAccounts.includes(idx))

    // 更新持久化存储
    if (validTokens.length > 0) {
      $persistentStore.write(validTokens.join('#'), TOKEN_KEY)
      console.log(`Updated tokens: ${validTokens.length} valid account(s) remaining.`)
    } else {
      $persistentStore.write('', TOKEN_KEY)
      console.log('All tokens invalid, cleared storage.')
    }

    if (validCookies.length > 0) {
      $persistentStore.write(validCookies.join('#'), COOKIE_KEY)
      console.log(`Updated cookies: ${validCookies.length} valid account(s) remaining.`)
    } else {
      $persistentStore.write('', COOKIE_KEY)
      console.log('All cookies invalid, cleared storage.')
    }

    // 添加清理提示到通知
    summary.push(`\n⚠️ 已自动清理 ${invalidAccounts.length} 个失效账号`)
  }

  // 添加时间戳到通知标题
  const now = new Date()
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const validCount = tokenArr.length - invalidAccounts.length
  const notifyTitle = tokenArr.length > 1
    ? `微博签到 [${timeStr}] (${validCount}/${tokenArr.length}个账号)`
    : `微博签到 [${timeStr}]`

  notify(notifyTitle, '', summary.join('\n'))

  console.log('--- Weibo Sign Task Finished ---')
  // 直接结束，不使用延迟
  $done()
}

async function getCookie() {
  const url = $request.url || ''
  const headers = $request.headers || {}
  const cookieHeader = headers['Cookie'] || headers['cookie'] || ''

  // 处理 Token 捕获
  if (url.includes('users/show') && url.includes('gsid=')) {
    console.log('Matching Token capturing rule...')
    const from = url.match(/from=\w+/)
    const uid = url.match(/&uid=\d+/)
    const gsid = url.match(/&gsid=[\w-]+/)
    const s = url.match(/&s=\w+/)

    if (!from || !uid || !gsid || !s) {
      console.log('Token parameters incomplete - missing: ' +
        (!from ? 'from ' : '') +
        (!uid ? 'uid ' : '') +
        (!gsid ? 'gsid ' : '') +
        (!s ? 's' : ''))
      return
    }

    let token = from[0] + uid[0] + gsid[0] + s[0]
    console.log('Token extracted successfully')

    // 先执行签到验证
    console.log('Executing sign-in verification...')
    await weiboSign(token)
    let signResult = wbsign || '签到无返回'
    console.log(`Sign-in result: ${signResult}`)

    // 判断签到结果：成功或重复签到则不保存，失败或失效才保存
    const isSignSuccess = signResult.includes('✅') || signResult === '重复'

    if (isSignSuccess) {
      console.log('Sign-in verified successfully, no need to update Token')
      // notify('微博 Token', '✅ 验证通过 & ' + signResult, 'Token 有效，无需更新')  // 禁用验证通知，避免频繁提醒
      return
    }

    // 签到失败，需要更新Token
    console.log('Sign-in failed, updating Token...')
    let old = $persistentStore.read(TOKEN_KEY)

    // 检查是否重复
    if (old && old.includes(token)) {
      console.log('Token already exists but invalid, replacing it')
      notify('微博 Token', '⚠️ Token失效', '签到失败: ' + signResult)
      return
    }

    let val = old ? old + '#' + token : token
    if ($persistentStore.write(val, TOKEN_KEY)) {
      console.log('Token saved to PersistentStore successfully')
      notify('微博 Token', '✅ 已更新 & ' + signResult, '新Token已写入存储')
    } else {
      console.log('Failed to save Token to PersistentStore')
      notify('微博 Token', '❌ 保存失败', '请检查 Surge 存储权限')
    }
    return
  }

  // 处理 Cookie 捕获
  if (cookieHeader && cookieHeader.includes('SUB=')) {
    console.log('Matching Cookie capturing rule...')
    const m = cookieHeader.match(/SUB=([^;]+)/)
    if (!m) {
      console.log('SUB Cookie format invalid')
      return
    }

    let cookie = `SUB=${m[1]}`
    console.log('Cookie extracted successfully')

    // 获取对应的Token进行钱包签到验证
    let tokens = $persistentStore.read(TOKEN_KEY)
    if (!tokens) {
      console.log('No Token found, cannot verify wallet sign-in')
      notify('微博 Cookie', '⚠️ 无法验证', '请先获取微博Token')
      return
    }

    // 使用第一个Token进行验证（假设Cookie对应第一个账号）
    let tokenArr = tokens.split('#')
    let token = tokenArr[0]
    if (!token.includes('from=')) {
      token = '&from=10B3193010' + token
    }

    // 执行钱包签到验证
    console.log('Executing wallet sign-in verification...')
    await paySign(token, cookie)
    let walletResult = paybag || '验证无返回'
    console.log(`Wallet sign-in result: ${walletResult}`)

    // 判断钱包签到结果：成功或重复则不保存，失败或失效才保存
    const isWalletSuccess = walletResult.includes('✅') || walletResult === '重复'

    if (isWalletSuccess) {
      console.log('Wallet verification successful, no need to update Cookie')
      // notify('微博 Cookie', '✅ 验证通过 & ' + walletResult, 'Cookie 有效，无需更新')  // 禁用验证通知，避免频繁提醒
      return
    }

    // 钱包验证失败，需要更新Cookie
    console.log('Wallet verification failed, updating Cookie...')
    let old = $persistentStore.read(COOKIE_KEY)

    // 检查是否重复
    if (old && old.includes(cookie)) {
      console.log('Cookie already exists but invalid')
      notify('微博 Cookie', '⚠️ Cookie失效', '验证失败: ' + walletResult)
      return
    }

    let val = old ? old + '#' + cookie : cookie
    if ($persistentStore.write(val, COOKIE_KEY)) {
      console.log('Cookie saved to PersistentStore successfully')
      notify('微博 Cookie', '✅ 已更新 & ' + walletResult, '新Cookie已写入存储')
    } else {
      console.log('Failed to save Cookie to PersistentStore')
      notify('微博 Cookie', '❌ 保存失败', '请检查 Surge 存储权限')
    }
    return
  }

  // 没有匹配到任何规则
  console.log('No capturing rules matched for this request')
}

function weiboSign(token) {
  return new Promise(resolve => {
    $httpClient.post(
      {
        url: `https://api.weibo.cn/2/checkin/add?c=iphone&${token}`,
        headers: {
          'User-Agent': 'Weibo/62823 (iPhone; iOS 15.2)'
        }
      },
      (err, resp, data) => {
        if (err) {
          console.log(`Weibo Sign API Error: ${err}`)
          wbsign = `签到:失败`
        } else {
          console.log(`Weibo Sign API Response: ${data}`)
          try {
            let res = JSON.parse(data)
            if (res.status === 10000) {
              wbsign = `✅连签${res.data.continuous}天`
            } else if (res.errno === 30000) {
              wbsign = '重复'
            } else if (res.errno === -100) {
              wbsign = '失效'
            } else {
              wbsign = `❌${(res.msg || res.errmsg || '错').substring(0, 10)}`
            }
          } catch (e) {
            wbsign = '解析失败'
          }
        }
        resolve()
      }
    )
  })
}

function paySign(token, cookie) {
  return new Promise(resolve => {
    $httpClient.post(
      {
        url: 'https://pay.sc.weibo.com/aj/mobile/home/welfare/signin/do',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: cookie,
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 15_2 like Mac OS X)'
        },
        body: token + '&lang=zh_CN&wm=3333_2001'
      },
      (err, resp, data) => {
        if (err) {
          console.log(`Wallet Sign API Error: ${err}`)
          paybag = `钱包:失败`
        } else {
          console.log(`Wallet Sign API Response: ${data.substring(0, 100)}...`)
          if (data && data.includes('<html')) {
            paybag = '失效'
          } else {
            try {
              let res = JSON.parse(data)
              if (res.status === 1) {
                paybag = `✅+${res.score}`
              } else if (res.status === 2) {
                paybag = '重复'
              } else {
                paybag = `❌${(res.msg || '错').substring(0, 10)}`
              }
            } catch (e) {
              paybag = '解析失败'
            }
          }
        }
        resolve()
      }
    )
  })
}

function notify(title, subtitle, body) {
  console.log(`Notify: ${title} - ${subtitle} - ${body}`)
  $notification.post(title, subtitle, body)
}
