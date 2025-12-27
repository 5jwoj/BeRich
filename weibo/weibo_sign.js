/**
 * Weibo Daily Sign for Surge
 * 新浪微博每日签到（Surge 专用）
 * Author: 5jwoj (modified)
 * Version: v1.0.9
 */

console.log('--- Weibo Script Loaded (v1.0.9) ---')

const TOKEN_KEY = 'sy_token_wb'
const COOKIE_KEY = 'wb_cookie'

// 仅在匹配微博域名时进入获取 Cookie 模式
const isCookieCapture = typeof $request !== 'undefined' &&
  $request.url &&
  (/weibo\.cn/.test($request.url) || /weibo\.com/.test($request.url));

// 手动运行或 Cron 运行
let isTaskExecution = typeof $request === 'undefined';

// 特殊处理：apple.com 触发强制进入任务模式
if (typeof $request !== 'undefined' && $request.url && $request.url.includes('apple.com')) {
  console.log('Surge connectivity test (apple.com) detected. Forcing Task Execution mode.')
  isTaskExecution = true;
}

if (isCookieCapture) {
  console.log('Mode: Cookie Capture Interception')
  console.log(`URL: ${$request.url}`)
  try {
    getCookie()
  } catch (e) {
    console.log('getCookie Error: ' + e)
  }
  $done()
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

async function main() {
  console.log('--- Weibo Sign Task Started ---')
  console.log('Script Version: v1.0.9')

  let tokens = $persistentStore.read(TOKEN_KEY)
  let cookies = $persistentStore.read(COOKIE_KEY)

  console.log(`Data Check - Token: ${tokens ? 'Found' : 'NotFound'}, Cookie: ${cookies ? 'Found' : 'NotFound'}`)

  if (!tokens) {
    console.log('未获取到 Weibo Token，停止执行。请先通过微博 App 获取。')
    notify('新浪微博', '未获取到 Token', '请先打开微博触发 Token 获取')
    return $done()
  }

  let tokenArr = tokens.split('#')
  let cookieArr = cookies ? cookies.split('#') : []
  console.log(`Processing ${tokenArr.length} account(s)...`)

  let summary = []

  for (let i = 0; i < tokenArr.length; i++) {
    let token = tokenArr[i]
    let cookie = cookieArr[i] || ''
    if (!token) continue

    if (!token.includes('from=')) {
      token = '&from=10B3193010' + token
    }

    console.log(`[Account ${i + 1}] Executing Daily Sign-in...`)
    await weiboSign(token)

    if (!cookie) {
      paybag = '钱包:无'
      console.log(`[Account ${i + 1}] Skip wallet sign-in: No SUB cookie found.`)
    } else {
      console.log(`[Account ${i + 1}] Executing Wallet Sign-in...`)
      await paySign(token, cookie)
    }

    // 简化通知内容，防止长度超限
    let wbRes = wbsign.replace('签到:', '').replace('每日签到：', '')
    let payRes = paybag.replace('钱包签到：', '').replace('钱包:', '')
    summary.push(`[${i + 1}] 微博:${wbRes} | 钱包:${payRes}`)

    // 账号间增加延迟
    if (i < tokenArr.length - 1) {
      console.log('Wait 2s for the next account...')
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  console.log('--- Summary Notification ---')
  const notifyTitle = tokenArr.length > 1 ? `微博签到汇总结算 (${tokenArr.length})` : '新浪微博签到'
  notify(notifyTitle, '', summary.join('\n'))

  console.log('--- Weibo Sign Task Finished ---')
  // 延迟 1 秒后结束脚本，确保通知成功发送
  setTimeout(() => {
    $done()
  }, 1000)
}

function getCookie() {
  const url = $request.url || ''
  const headers = $request.headers || {}
  const cookieHeader = headers['Cookie'] || headers['cookie'] || ''

  if (url.includes('users/show') && url.includes('gsid=')) {
    console.log('Matching Token capturing rule...')
    const from = url.match(/from=\w+/)
    const uid = url.match(/&uid=\d+/)
    const gsid = url.match(/&gsid=[\w-]+/)
    const s = url.match(/&s=\w+/)

    if (!from || !uid || !gsid || !s) return

    let token = from[0] + uid[0] + gsid[0] + s[0]
    let old = $persistentStore.read(TOKEN_KEY)
    if (old && old.includes(token)) return

    let val = old ? old + '#' + token : token
    if ($persistentStore.write(val, TOKEN_KEY)) {
      notify('微博 Token', '获取成功', '已更新，请尝试运行签到')
    }
  }

  if (cookieHeader && cookieHeader.includes('SUB=')) {
    console.log('Matching Cookie capturing rule...')
    const m = cookieHeader.match(/SUB=([^;]+)/)
    if (!m) return

    let cookie = `SUB=${m[1]}`
    let old = $persistentStore.read(COOKIE_KEY)
    if (old && old.includes(cookie)) return

    let val = old ? old + '#' + cookie : cookie
    if ($persistentStore.write(val, COOKIE_KEY)) {
      notify('微博 Cookie', '获取成功', '已更新，请尝试运行签到')
    }
  }
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
