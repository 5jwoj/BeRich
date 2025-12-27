/**
 * Weibo Daily Sign for Surge
 * 新浪微博每日签到（Surge 专用）
 * Author: 5jwoj (modified)
 * Version: v1.0.4
 */

const TOKEN_KEY = 'sy_token_wb'
const COOKIE_KEY = 'wb_cookie'

const isRequest = typeof $request !== 'undefined'

let wbsign = ''
let paybag = ''

if (isRequest) {
  getCookie()
  $done()
} else {
  main()
}

async function main() {
  console.log('--- Weibo Sign Script Start ---')
  console.log('Script Version: v1.0.4')

  let tokens = $persistentStore.read(TOKEN_KEY)
  let cookies = $persistentStore.read(COOKIE_KEY)

  if (!tokens) {
    console.log('未获取到 Token')
    notify('新浪微博', '未获取到 Token', '请先打开微博触发 Token 获取')
    return $done()
  }

  let tokenArr = tokens.split('#')
  let cookieArr = cookies ? cookies.split('#') : []

  for (let i = 0; i < tokenArr.length; i++) {
    let token = tokenArr[i]
    let cookie = cookieArr[i] || ''

    if (!token) continue

    // 兼容旧数据：若 token 未包含 from= 则补上
    if (!token.includes('from=')) {
      token = '&from=10B3193010' + token
    }

    await weiboSign(token)

    // 钱包签到依赖 SUB cookie；如果没有就给出提示但不中断微博签到
    if (!cookie) {
      paybag = '钱包签到：未获取到 SUB Cookie（请打开微博/钱包页触发 Cookie 获取）'
    } else {
      await paySign(token, cookie)
    }

    notify('新浪微博签到', wbsign, paybag)
  }

  $done()
}

function getCookie() {
  const url = $request.url || ''
  const headers = $request.headers || {}

  // 兼容 Surge header key 大小写差异
  const cookieHeader = headers['Cookie'] || headers['cookie'] || ''

  // 1) 抓 Token：来自 users/show 且带 gsid=
  if (url.includes('users/show') && url.includes('gsid=')) {
    const from = url.match(/from=\w+/)
    const uid = url.match(/&uid=\d+/)
    const gsid = url.match(/&gsid=[\w-]+/)
    const s = url.match(/&s=\w+/)

    if (!from || !uid || !gsid || !s) return

    let token = from[0] + uid[0] + gsid[0] + s[0]

    let old = $persistentStore.read(TOKEN_KEY)
    if (old && old.includes(token)) return

    let val = old ? old + '#' + token : token
    $persistentStore.write(val, TOKEN_KEY)
    notify('微博 Token', '获取成功', '')
  }

  // 2) 抓 Cookie：SUB=...（注意 SUB 里可能有 =，原 regex 会漏）
  if (cookieHeader && cookieHeader.includes('SUB=')) {
    // 匹配 SUB 的值直到分号或字符串结束
    const m = cookieHeader.match(/SUB=([^;]+)/)
    if (!m) return

    let cookie = `SUB=${m[1]}`

    let old = $persistentStore.read(COOKIE_KEY)
    if (old && old.includes(cookie)) return

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
        console.log(`微博签到原始返回: ${data}`)
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
        console.log(`钱包签到原始返回: ${data}`)
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
        }
        resolve()
      }
    )
  })
}

function notify(title, subtitle, body) {
  console.log(`${title} - ${subtitle} - ${body}`)
  $notification.post(title, subtitle, body)
}
