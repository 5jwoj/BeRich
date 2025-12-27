/**
 * Weibo Daily Sign for Surge
 * 新浪微博每日签到（Surge 专用）
 * Author: 5jwoj (modified)
 * Version: v1.0.5
 */

console.log('--- Weibo Script Loaded (v1.0.5) ---')

const TOKEN_KEY = 'sy_token_wb'
const COOKIE_KEY = 'wb_cookie'

const isRequest = typeof $request !== 'undefined'

let wbsign = ''
let paybag = ''

if (isRequest) {
  console.log('Detecting Request mode...')
  try {
    getCookie()
  } catch (e) {
    console.log('getCookie error: ' + e)
  }
  $done()
} else {
  console.log('Detecting Cron/Manual mode...')
  main().catch(e => {
    console.log('Critical Error: ' + e.message + '\n' + e.stack)
    $done()
  })
}

async function main() {
  console.log('--- Weibo Sign Task Started ---')
  console.log('Script Version: v1.0.5')

  let tokens = $persistentStore.read(TOKEN_KEY)
  let cookies = $persistentStore.read(COOKIE_KEY)

  console.log(`PersistentStore Read - Tokens: ${tokens ? 'Found' : 'Empty'}, Cookies: ${cookies ? 'Found' : 'Empty'}`)

  if (!tokens) {
    console.log('未获取到 Token，停止执行')
    notify('新浪微博', '未获取到 Token', '请先打开微博触发 Token 获取')
    return $done()
  }

  let tokenArr = tokens.split('#')
  let cookieArr = cookies ? cookies.split('#') : []
  console.log(`Processing ${tokenArr.length} accounts...`)

  for (let i = 0; i < tokenArr.length; i++) {
    let token = tokenArr[i]
    let cookie = cookieArr[i] || ''

    if (!token) continue

    if (!token.includes('from=')) {
      token = '&from=10B3193010' + token
    }

    console.log(`Account ${i + 1}: Starting sign-in...`)
    await weiboSign(token)

    if (!cookie) {
      paybag = '钱包签到：未获取到 SUB Cookie'
      console.log(`Account ${i + 1}: No SUB cookie found for wallet sign-in`)
    } else {
      console.log(`Account ${i + 1}: Starting wallet sign-in...`)
      await paySign(token, cookie)
    }

    notify('新浪微博签到', wbsign, paybag)
  }

  console.log('--- Weibo Sign Task Finished ---')
  $done()
}

function getCookie() {
  const url = $request.url || ''
  const headers = $request.headers || {}
  const cookieHeader = headers['Cookie'] || headers['cookie'] || ''

  if (url.includes('users/show') && url.includes('gsid=')) {
    console.log('Interpreting Token request...')
    const from = url.match(/from=\w+/)
    const uid = url.match(/&uid=\d+/)
    const gsid = url.match(/&gsid=[\w-]+/)
    const s = url.match(/&s=\w+/)

    if (!from || !uid || !gsid || !s) {
      console.log('Token parameters incomplete')
      return
    }

    let token = from[0] + uid[0] + gsid[0] + s[0]
    let old = $persistentStore.read(TOKEN_KEY)
    if (old && old.includes(token)) {
      console.log('Token already exists')
      return
    }

    let val = old ? old + '#' + token : token
    $persistentStore.write(val, TOKEN_KEY)
    notify('微博 Token', '获取成功', '')
  }

  if (cookieHeader && cookieHeader.includes('SUB=')) {
    console.log('Interpreting Cookie request...')
    const m = cookieHeader.match(/SUB=([^;]+)/)
    if (!m) return

    let cookie = `SUB=${m[1]}`
    let old = $persistentStore.read(COOKIE_KEY)
    if (old && old.includes(cookie)) {
      console.log('Cookie already exists')
      return
    }

    let val = old ? old + '#' + cookie : cookie
    $persistentStore.write(val, COOKIE_KEY)
    notify('微博 Cookie', '获取成功', '')
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
        console.log(`微博签到回调 - Error: ${err}, Data exists: ${!!data}`)
        if (data) console.log(`微博签到原始返回: ${data}`)
        try {
          if (err) {
            wbsign = `每日签到：请求失败 (${err})`
            return resolve()
          }
          let res = JSON.parse(data)
          if (res.status === 10000) {
            wbsign = `每日签到：连续 ${res.data.continuous} 天`
          } else if (res.errno === 30000) {
            wbsign = '每日签到：已签到'
          } else {
            wbsign = `每日签到：失败 (${res.msg || res.errmsg || '未知错误'})`
          }
        } catch (e) {
          wbsign = '每日签到：解析失败'
          console.log('JSON Parse error in weiboSign: ' + e)
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
        console.log(`钱包签到回调 - Error: ${err}, Data exists: ${!!data}`)
        if (data) console.log(`钱包签到原始返回: ${data}`)
        try {
          if (err) {
            paybag = `钱包签到：请求失败 (${err})`
            return resolve()
          }
          let res = JSON.parse(data)
          if (res.status === 1) {
            paybag = `钱包签到：+${res.score} 积分`
          } else if (res.status === 2) {
            paybag = '钱包签到：已签到'
          } else {
            paybag = `钱包签到：失败 (${res.msg || '未知错误'})`
          }
        } catch (e) {
          paybag = '钱包签到：解析失败'
          console.log('JSON Parse error in paySign: ' + e)
        }
        resolve()
      }
    )
  })
}

function notify(title, subtitle, body) {
  console.log(`Notification: ${title} - ${subtitle} - ${body}`)
  $notification.post(title, subtitle, body)
}
