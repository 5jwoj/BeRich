/**
 * 邦邦赚 v7 Quantumult X 脚本
 * @version v1.0.0
 * 
 * ==================== Quantumult X 配置说明 ====================
 * [task_local]
 * 30 8 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/bangbangzhuan/bangbangzhuan_qx.js, tag=邦邦赚, img-url=https://raw.githubusercontent.com/Orz-3/mini/master/Color/reward.png, enabled=true
 * 
 * [rewrite_local]
 * ^https?:\/\/hd\.hnqlwlkj\.xyz\/g\/ url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/bangbangzhuan/bangbangzhuan_qx.js
 * 
 * [mitm]
 * hostname = hd.hnqlwlkj.xyz
 * 
 * ==================== 单机/多账号环境变量配置 ====================
 * 可以通过 BoxJS 或 QuanX 持久化存储设置：
 * - bbz_token : 抓取的 Bearer Token (支持多账号，以 # 或 & 分隔)
 * - bbz_device_id : 设备 ID
 * - bbz_oaid : OAID
 * - bbz_user_id : 用户 ID
 * - bbz_appcode : 应用 Code (默认 206)
 * - bbz_max_count : 单次运行刷广告上报次数 (默认 15 次)
 */

// ==================== 1. CryptoJS 算法库集成 ====================
var CryptoJS = CryptoJS || function (u, p) {
    var d = {}, l = d.lib = {}, s = function () { }, t = l.Base = { extend: function (a) { s.prototype = this; var c = new s; a && c.mixIn(a); c.hasOwnProperty("init") || (c.init = function () { c.$super.init.apply(this, arguments) }); c.init.prototype = c; c.$super = this; return c }, create: function () { var a = this.extend(); a.init.apply(a, arguments); return a }, init: function () { }, mixIn: function (a) { for (var c in a) a.hasOwnProperty(c) && (this[c] = a[c]); a.hasOwnProperty("toString") && (this.toString = a.toString) }, clone: function () { return this.init.prototype.extend(this) } },
        r = l.WordArray = t.extend({
            init: function (a, c) { a = this.words = a || []; this.sigBytes = c != p ? c : 4 * a.length }, toString: function (a) { return (a || v).stringify(this) }, concat: function (a) { var c = this.words, e = a.words, j = this.sigBytes; a = a.sigBytes; this.clamp(); if (j % 4) for (var k = 0; k < a; k++)c[j + k >>> 2] |= (e[k >>> 2] >>> 24 - 8 * (k % 4) & 255) << 24 - 8 * ((j + k) % 4); else if (55 < e.length) for (k = 0; k < a; k += 4)c[j + k >>> 2] = e[k >>> 2]; else c.push.apply(c, e); this.sigBytes += a; return this }, clamp: function () { var a = this.words, c = this.sigBytes; a[c >>> 2] &= 4294967295 << 32 - 8 * (c % 4); a.length = u.ceil(c / 4) }, clone: function () { var a = t.clone.call(this); a.words = this.words.slice(0); return a }, random: function (a) { for (var c = [], e = 0; e < a; e += 4)c.push(4294967296 * u.random() | 0); return new r.init(c, a) } }),
        w = d.enc = {}, v = w.Hex = { stringify: function (a) { var c = a.words; a = a.sigBytes; for (var e = [], j = 0; j < a; j++) { var k = c[j >>> 2] >>> 24 - 8 * (j % 4) & 255; e.push((k >>> 4).toString(16)); e.push((k & 15).toString(16)) } return e.join("") }, parse: function (a) { for (var c = a.length, e = [], j = 0; j < c; j += 2)e[j >>> 3] |= parseInt(a.substr(j, 2), 16) << 24 - 4 * (j % 8); return new r.init(e, c / 2) } },
        b = w.Utf8 = { stringify: function (a) { try { return decodeURIComponent(escape(v.stringify(a))) } catch (c) { throw Error("Malformed UTF-8 data"); } }, parse: function (a) { return v.parse(unescape(encodeURIComponent(a))) } },
        x = w.Base64 = {
            stringify: function (a) { var c = a.words, e = a.sigBytes, j = this._map; a.clamp(); for (var k = [], b = 0; b < e; b += 3)for (var d = (c[b >>> 2] >>> 24 - 8 * (b % 4) & 255) << 16 | (c[b + 1 >>> 2] >>> 24 - 8 * ((b + 1) % 4) & 255) << 8 | c[b + 2 >>> 2] >>> 24 - 8 * ((b + 2) % 4) & 255, n = 0; 4 > n; n++)b + .75 * n < e ? k.push(j.charAt(d >>> 6 * (3 - n) & 63)) : k.push("="); return k.join("") }, parse: function (a) {
                var c = a.length, e = this._map, j = e.charAt(64); j && (j = a.indexOf(j), -1 != j && (c = j)); for (var j = [], b = 0, d = 0; d < c; d++)if (d % 4) { var n = e.indexOf(a.charAt(d - 1)) << 2 * (d % 4), m = e.indexOf(a.charAt(d)) >>> 6 - 2 * (d % 4); j[b >>> 2] |= (n | m) << 24 - 8 * (b % 4); b++ } return r.init(j, b)
            }, _map: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
        },
        q = l.BufferedBlockAlgorithm = t.extend({
            reset: function () { this._data = new r.init; this._nDataBytes = 0 }, _append: function (a) { "string" == typeof a && (a = b.parse(a)); this._data.concat(a); this._nDataBytes += a.sigBytes }, _process: function (a) { var c = this._data, e = c.words, j = c.sigBytes, k = this.blockSize, b = j / (4 * k), b = a ? u.ceil(b) : u.max((b | 0) - this._minBufferSize, 0); a = b * k; j = u.min(4 * a, j); if (a) { for (var d = 0; d < a; d += k)this._doProcessBlock(e, d); d = e.splice(0, a); c.sigBytes -= j } return new r.init(d, j) }, clone: function () { var a = t.clone.call(this); a._data = this._data.clone(); return a }, _minBufferSize: 0
        });
    l.Hasher = q.extend({
        cfg: t.extend(), init: function (a) { this.cfg = this.cfg.extend(a); this.reset() }, reset: function () { q.reset.call(this); this._doReset() }, update: function (a) { this._append(a); this._process(); return this }, finalize: function (a) { a && this._append(a); return this._doFinalize() }, blockSize: 16, _createHelper: function (a) { return function (c, e) { return (new a.init(e)).finalize(c) } }, _createHmacHelper: function (a) { return function (c, e) { return (new n.HMAC.init(a, e)).finalize(c) } }
    });
    var n = d.algo = {}; return d
}(Math);

(function () {
    var u = CryptoJS, p = u.lib, d = p.WordArray, l = p.Hasher, s = u.algo, t = [];
    (function () { for (var r = 0; 64 > r; r++)t[r] = 4294967296 * Math.abs(Math.sin(r + 1)) | 0 })();
    s = s.MD5 = l.extend({
        _doReset: function () { this._hash = new d.init([1732584193, 4023233417, 2562383102, 271733878]) },
        _doProcessBlock: function (q, n) {
            for (var a = 0; 16 > a; a++) { var c = n + a, e = q[c]; q[c] = (e << 8 | e >>> 24) & 16711935 | (e << 24 | e >>> 8) & 4278255360 }
            var a = this._hash.words, c = q[n + 0], e = q[n + 1], j = q[n + 2], k = q[n + 3], b = q[n + 4], d = q[n + 5], l = q[n + 6], s = q[n + 7], u = q[n + 8], v = q[n + 9], w = q[n + 10], x = q[n + 11], y = q[n + 12], z = q[n + 13], A = q[n + 14], B = q[n + 15], f = a[0], g = a[1], h = a[2], m = a[3],
                f = r(f, g, h, m, c, 7, t[0]), m = r(m, f, g, h, e, 12, t[1]), h = r(h, m, f, g, j, 17, t[2]), g = r(g, h, m, f, k, 22, t[3]), f = r(f, g, h, m, b, 7, t[4]), m = r(m, f, g, h, d, 12, t[5]), h = r(h, m, f, g, l, 17, t[6]), g = r(g, h, m, f, s, 22, t[7]), f = r(f, g, h, m, u, 7, t[8]), m = r(m, f, g, h, v, 12, t[9]), h = r(h, m, f, g, w, 17, t[10]), g = r(g, h, m, f, x, 22, t[11]), f = r(f, g, h, m, y, 7, t[12]), m = r(m, f, g, h, z, 12, t[13]), h = r(h, m, f, g, A, 17, t[14]), g = r(g, h, m, f, B, 22, t[15]),
                f = o(f, g, h, m, e, 5, t[16]), m = o(m, f, g, h, l, 9, t[17]), h = o(h, m, f, g, x, 14, t[18]), g = o(g, h, m, f, c, 20, t[19]), f = o(f, g, h, m, d, 5, t[20]), m = o(m, f, g, h, w, 9, t[21]), h = o(h, m, f, g, B, 14, t[22]), g = o(g, h, m, f, b, 20, t[23]), f = o(f, g, h, m, v, 5, t[24]), m = o(m, f, g, h, A, 9, t[25]), h = o(h, m, f, g, k, 14, t[26]), g = o(g, h, m, f, u, 20, t[27]), f = o(f, g, h, m, z, 5, t[28]), m = o(m, f, g, h, j, 9, t[29]), h = o(h, m, f, g, s, 14, t[30]), g = o(g, h, m, f, y, 20, t[31]),
                f = p(f, g, h, m, d, 4, t[32]), m = p(m, f, g, h, u, 11, t[33]), h = p(h, m, f, g, x, 16, t[34]), g = p(g, h, m, f, A, 23, t[35]), f = p(f, g, h, m, e, 4, t[36]), m = p(m, f, g, h, b, 11, t[37]), h = p(h, m, f, g, s, 16, t[38]), g = p(g, h, m, f, w, 23, t[39]), f = p(f, g, h, m, z, 4, t[40]), m = p(m, f, g, h, c, 11, t[41]), h = p(h, m, f, g, k, 16, t[42]), g = p(g, h, m, f, l, 23, t[43]), f = p(f, g, h, m, v, 4, t[44]), m = p(m, f, g, h, y, 11, t[45]), h = p(h, m, f, g, B, 16, t[46]), g = p(g, h, m, f, j, 23, t[47]),
                f = n(f, g, h, m, c, 6, t[48]), m = n(m, f, g, h, s, 10, t[49]), h = n(h, m, f, g, A, 15, t[50]), g = n(g, h, m, f, d, 21, t[51]), f = n(f, g, h, m, y, 6, t[52]), m = n(m, f, g, h, k, 10, t[53]), h = n(h, m, f, g, w, 15, t[54]), g = n(g, h, m, f, e, 21, t[55]), f = n(f, g, h, m, b, 6, t[56]), m = n(m, f, g, h, x, 10, t[57]), h = n(h, m, f, g, B, 15, t[58]), g = n(g, h, m, f, j, 21, t[59]), f = n(f, g, h, m, v, 6, t[60]), m = n(m, f, g, h, j, 10, t[61]), h = n(h, m, f, g, l, 15, t[62]), g = n(g, h, m, f, z, 21, t[63]);
            a[0] = a[0] + f | 0; a[1] = a[1] + g | 0; a[2] = a[2] + h | 0; a[3] = a[3] + m | 0
        },
        _doFinalize: function () {
            var q = this._data, n = q.words, a = 8 * this._nDataBytes, c = 8 * q.sigBytes; n[c >>> 5] |= 128 << 24 - c % 32; var e = Math.floor(a / 4294967296); n[(c + 64 >>> 9 << 4) + 15] = (e << 8 | e >>> 24) & 16711935 | (e << 24 | e >>> 8) & 4278255360; n[(c + 64 >>> 9 << 4) + 14] = (a << 8 | a >>> 24) & 16711935 | (a << 24 | a >>> 8) & 4278255360; q.sigBytes = 4 * (n.length + 1); this._process(); q = this._hash; n = q.words; for (a = 0; 4 > a; a++)c = n[a], n[a] = (c << 8 | c >>> 24) & 16711935 | (c << 24 | c >>> 8) & 4278255360; return q
        }
    });
    function r(q, n, a, c, e, j, k) { q = q + (n & a | ~n & c) + e + k; return (q << j | q >>> 32 - j) + n }
    function o(q, n, a, c, e, j, k) { q = q + (n & c | a & ~c) + e + k; return (q << j | q >>> 32 - j) + n }
    function p(q, n, a, c, e, j, k) { q = q + (n ^ a ^ c) + e + k; return (q << j | q >>> 32 - j) + n }
    function n(q, n, a, c, e, j, k) { q = q + (a ^ (n | ~c)) + e + k; return (q << j | q >>> 32 - j) + n }
    u.MD5 = l._createHelper(s)
})();

(function () {
    var u = CryptoJS, p = u.lib.WordArray;
    u.pad.Pkcs7 = {
        pad: function (a, b) { for (var c = 4 * b, c = c - a.sigBytes % c, d = c << 24 | c << 16 | c << 8 | c, e = [], f = 0; f < c; f += 4)e.push(d); c = p.create(e, c); a.concat(c) },
        unpad: function (a) { a.sigBytes -= a.words[a.sigBytes - 1 >>> 2] & 255 }
    }
})();

(function () {
    var u = CryptoJS, p = u.lib.BlockCipher, d = u.algo;
    d.AES = p.extend({
        _doReset: function () {
            for (var l = this._key, s = l.words, t = l.sigBytes / 4, l = 4 * ((this._nRounds = t + 6) + 1), r = this._keySchedule = [], o = 0; o < l; o++)if (o < t)r[o] = s[o]; else { var d = r[o - 1]; o % t ? 6 < t && 4 == o % t && (d = u[d >>> 24] << 24 | u[d >>> 16 & 255] << 16 | u[d >>> 8 & 255] << 8 | u[d & 255]) : (d = d << 8 | d >>> 24, d = u[d >>> 24] << 24 | u[d >>> 16 & 255] << 16 | u[d >>> 8 & 255] << 8 | u[d & 255], d ^= p[o / t | 0] << 24); r[o] = r[o - t] ^ d }
            s = this._invKeySchedule = []; for (t = 0; t < l; t++)o = l - t, d = r[o - (t % 4 ? 0 : 4)], s[t] = 4 > t || o <= 4 ? d : q[u[d >>> 24]] ^ n[u[d >>> 16 & 255]] ^ m[u[d >>> 8 & 255]] ^ k[u[d & 255]]
        },
        _doProcessBlock: function (l, u) { this._encryptBlock(l, u, this._keySchedule, r, o, d, s, t) },
        _encryptBlock: function (l, u, p, d, r, o, m, k) {
            for (var n = this._nRounds, q = l[u] ^ p[0], s = l[u + 1] ^ p[1], v = l[u + 2] ^ p[2], w = l[u + 3] ^ p[3], t = 4, x = 1; x < n; x++)var y = d[q >>> 24] ^ r[s >>> 16 & 255] ^ o[v >>> 8 & 255] ^ m[w & 255] ^ p[t++], z = d[s >>> 24] ^ r[v >>> 16 & 255] ^ o[w >>> 8 & 255] ^ m[q & 255] ^ p[t++], A = d[v >>> 24] ^ r[w >>> 16 & 255] ^ o[q >>> 8 & 255] ^ m[s & 255] ^ p[t++], w = d[w >>> 24] ^ r[q >>> 16 & 255] ^ o[s >>> 8 & 255] ^ m[v & 255] ^ p[t++], q = y, s = z, v = A;
            y = (k[q >>> 24] << 24 | k[s >>> 16 & 255] << 16 | k[v >>> 8 & 255] << 8 | k[w & 255]) ^ p[t++]; z = (k[s >>> 24] << 24 | k[v >>> 16 & 255] << 16 | k[w >>> 8 & 255] << 8 | k[q & 255]) ^ p[t++]; A = (k[v >>> 24] << 24 | k[w >>> 16 & 255] << 16 | k[q >>> 8 & 255] << 8 | k[s & 255]) ^ p[t++]; w = (k[w >>> 24] << 24 | k[q >>> 16 & 255] << 16 | k[s >>> 8 & 255] << 8 | k[v & 255]) ^ p[t++]; l[u] = y; l[u + 1] = z; l[u + 2] = A; l[u + 3] = w
        }
    });
    var r = [], o = [], d = [], s = [], t = [], u = [], p = [], q = [], n = [], m = [], k = [];
    (function () {
        for (var a = [], c = 0; 256 > c; c++)a[c] = 128 > c ? c << 1 : c << 1 ^ 283; for (var e = 0, j = 0, c = 0; 256 > c; c++) {
            var b = j ^ j << 1 ^ j << 2 ^ j << 3 ^ j << 4, b = b >>> 8 ^ b & 255 ^ 99; u[e] = b; t[b] = e; var g = a[e], f = a[g], h = a[f], i = 257 * a[b] ^ 16843008 * b; r[e] = i << 24 | i >>> 8; o[e] = i << 16 | i >>> 16; d[e] = i << 8 | i >>> 24; s[e] = i; i = 16843009 * h ^ 65537 * f ^ 257 * g ^ 16843008 * e; q[b] = i << 24 | i >>> 8; n[b] = i << 16 | i >>> 16; m[b] = i << 8 | i >>> 24; k[b] = i; e ? (e = g ^ a[a[a[h ^ g]]], j ^= a[a[j]]) : e = j = 1
        }
    })();
    d.AES = p.extend({
        init: function (a, b) { this.cfg = this.cfg.extend(b); p.init.call(this, a, b) },
        encryptBlock: function (a, b) { this._doProcessBlock(a, b) }
    });
    u.mode.CBC = (function () {
        var a = u.lib.BlockCipherMode.extend();
        a.Encryptor = a.extend({
            processBlock: function (a, c) {
                var d = this._cipher, e = d.blockSize;
                this.xorBlock(a, c, e);
                d.encryptBlock(a, c);
                this._prevBlock = a.slice(c, c + e);
            },
            xorBlock: function (a, c, d) {
                var e = this._prevBlock;
                if (!e) return;
                for (var f = 0; f < d; f++) a[c + f] ^= e[f];
            }
        });
        return a;
    })();
})();

// ==================== 2. 环境兼容层 (QuanX / Surge / Loon / JSBox) ====================
function Env(name) {
    const isQX = typeof $task !== "undefined";
    const isLoon = typeof $loon !== "undefined";

    const getval = (key) => {
        if (isQX) return $prefs.valueForKey(key);
        return null;
    };
    const setval = (val, key) => {
        if (isQX) return $prefs.setValueForKey(val, key);
        return false;
    };
    const msg = (title, subtitle, body) => {
        if (isQX) $notify(title, subtitle, body);
        else console.log(`${title}\n${subtitle}\n${body}`);
    };
    const post = (options, callback) => {
        if (isQX) {
            if (typeof options === "string") options = { url: options };
            options.method = "POST";
            $task.fetch(options).then(
                (response) => {
                    response.status = response.statusCode;
                    callback(null, response, response.body);
                },
                (reason) => callback(reason.error, null, null)
            );
        }
    };
    const get = (options, callback) => {
        if (isQX) {
            if (typeof options === "string") options = { url: options };
            options.method = "GET";
            $task.fetch(options).then(
                (response) => {
                    response.status = response.statusCode;
                    callback(null, response, response.body);
                },
                (reason) => callback(reason.error, null, null)
            );
        }
    };
    const done = (value = {}) => {
        if (isQX) $done(value);
    };

    return { name, getval, setval, msg, post, get, done, isQX };
}

const $ = Env("邦邦赚");

// ==================== 3. 核心配置与全局常量 ====================
const KEY_B64 = "QDZmQCqcbLJpCV/D/tto1w==";
const IV_B64 = "eNZKN5LRf9uKJt0Blal5MA==";
const KEY = CryptoJS.enc.Base64.parse(KEY_B64);
const IV = CryptoJS.enc.Base64.parse(IV_B64);
const BASE_HOST = "hd.hnqlwlkj.xyz";

// 15种抓包广告模板全集
const AD_TEMPLATES = [
    { admodel_id: "94", admodel_value: "7351331335799942", adplatform_name: "kuaishou", adtype_id: "87", adtype_name: "Banner广告", network_placement_id: "25333000546", reward_rate: "0.60", ecpm_min: 17, ecpm_max: 60, ecpm_avg: 35, weight: 25 },
    { admodel_id: "94", admodel_value: "7351331335799942", adplatform_name: "kuaishou", adtype_id: "87", adtype_name: "Banner广告", network_placement_id: "25333000582", reward_rate: "0.60", ecpm_min: 50, ecpm_max: 70, ecpm_avg: 60, weight: 3 },
    { admodel_id: "95", admodel_value: "8881361664149798", adplatform_name: "kuaishou", adtype_id: "88", adtype_name: "信息流广告", network_placement_id: "25333000399", reward_rate: "0.60", ecpm_min: 216, ecpm_max: 350, ecpm_avg: 280, weight: 8 },
    { admodel_id: "95", admodel_value: "8881361664149798", adplatform_name: "kuaishou", adtype_id: "88", adtype_name: "信息流广告", network_placement_id: "25333000546", reward_rate: "0.60", ecpm_min: 17, ecpm_max: 60, ecpm_avg: 30, weight: 5 },
    { admodel_id: "97", admodel_value: "1092_kuaishou_special", adplatform_name: "kuaishou", adtype_id: "1092", adtype_name: "信息流广告2", network_placement_id: "25333000582", reward_rate: "0.60", ecpm_min: 200, ecpm_max: 350, ecpm_avg: 270, weight: 3 },
    { admodel_id: "94", admodel_value: "7351331335799942", adplatform_name: "sigmob", adtype_id: "87", adtype_name: "Banner广告", network_placement_id: "1007318f24db", reward_rate: "0.60", ecpm_min: 28, ecpm_max: 64, ecpm_avg: 45, weight: 5 },
    { admodel_id: "95", admodel_value: "8881361664149798", adplatform_name: "sigmob", adtype_id: "88", adtype_name: "信息流广告", network_placement_id: "10070b9a7bd1", reward_rate: "0.60", ecpm_min: 24, ecpm_max: 96, ecpm_avg: 55, weight: 11 },
    { admodel_id: "97", admodel_value: "1092_sigmob_special", adplatform_name: "sigmob", adtype_id: "1092", adtype_name: "信息流广告2", network_placement_id: "sp1035afc7eeef", reward_rate: "0.60", ecpm_min: 200, ecpm_max: 400, ecpm_avg: 300, weight: 3 },
    { admodel_id: "95", admodel_value: "8881361664149798", adplatform_name: "gdt", adtype_id: "88", adtype_name: "信息流广告", network_placement_id: "3362285574444540", reward_rate: "0.60", ecpm_min: 200, ecpm_max: 230, ecpm_avg: 213, weight: 4 },
    { admodel_id: "96", admodel_value: "5757133111582364", adplatform_name: "gdt", adtype_id: "89", adtype_name: "插屏广告", network_placement_id: "3352389564338982", reward_rate: "0.60", ecpm_min: 1800, ecpm_max: 2200, ecpm_avg: 2000, weight: 4 },
    { admodel_id: "96", admodel_value: "5757133111582364", adplatform_name: "gdt", adtype_id: "89", adtype_name: "插屏广告", network_placement_id: "7302985514830981", reward_rate: "0.60", ecpm_min: 2800, ecpm_max: 3200, ecpm_avg: 3000, weight: 3 },
    { admodel_id: "96", admodel_value: "5757133111582364", adplatform_name: "gdt", adtype_id: "89", adtype_name: "插屏广告", network_placement_id: "8352183584435731", reward_rate: "0.60", ecpm_min: 3000, ecpm_max: 3500, ecpm_avg: 3260, weight: 3 },
    { admodel_id: "96", admodel_value: "5757133111582364", adplatform_name: "gdt", adtype_id: "89", adtype_name: "插屏广告", network_placement_id: "9392583504234903", reward_rate: "0.60", ecpm_min: 900, ecpm_max: 1100, ecpm_avg: 1000, weight: 3 },
    { admodel_id: "95", admodel_value: "8881361664149798", adplatform_name: "csj", adtype_id: "88", adtype_name: "信息流广告", network_placement_id: "984307813", reward_rate: "0.60", ecpm_min: 900, ecpm_max: 1100, ecpm_avg: 1000, weight: 4 },
    { admodel_id: "95", admodel_value: "8881361664149798", adplatform_name: "csj", adtype_id: "88", adtype_name: "信息流广告", network_placement_id: "984307812", reward_rate: "0.60", ecpm_min: 1800, ecpm_max: 2200, ecpm_avg: 2000, weight: 4 },
    { admodel_id: "96", admodel_value: "5757133111582364", adplatform_name: "baidu", adtype_id: "89", adtype_name: "插屏广告", network_placement_id: "19820850", reward_rate: "0.60", ecpm_min: 2500, ecpm_max: 5100, ecpm_avg: 3810, weight: 5 }
];

// ==================== 4. 加密与随机工具函数 ====================
function aesCbcEncrypt(dataObj) {
    const plainText = JSON.stringify(dataObj);
    const encrypted = CryptoJS.AES.encrypt(plainText, KEY, {
        iv: IV,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    return encrypted.toString();
}

function calcSignature(token, detailsJson, ts) {
    const raw = token + detailsJson + ts;
    return CryptoJS.MD5(raw).toString();
}

function getRandomUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function getRandomHex(len) {
    var result = '';
    var chars = '0123456789abcdef';
    for (var i = 0; i < len; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function weightedChoice(templates) {
    const totalWeight = templates.reduce((acc, cur) => acc + cur.weight, 0);
    let rand = Math.random() * totalWeight;
    for (let i = 0; i < templates.length; i++) {
        if (rand < templates[i].weight) return templates[i];
        rand -= templates[i].weight;
    }
    return templates[0];
}

function realisticEcpm(template) {
    const min = template.ecpm_min;
    const max = template.ecpm_max;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 5. 模式选择 (Rewrite 抓包 vs Task 执行) ====================
if (typeof $request !== "undefined") {
    // 【Rewrite 模式】：捕抓网页 / APP 请求 Header
    GetTokenFromRewrite();
} else {
    // 【Task 模式】：定时任务执行脚本
    MainTask().catch(e => console.log("执行异常: " + e)).finally(() => $.done());
}

function GetTokenFromRewrite() {
    const headers = $request.headers;
    const auth = headers["Authorization"] || headers["authorization"];
    const appcode = headers["APPCODE"] || headers["appcode"];
    
    if (auth) {
        const token = auth.replace("Bearer ", "").trim();
        $.setval(token, "bbz_token");
        if (appcode) $.setval(appcode, "bbz_appcode");
        $.msg("邦邦赚", "🎉 成功抓取 Authorization Token", `Token: ${token.substring(0, 15)}...`);
        console.log(`[邦邦赚] 成功抓取 Token: ${token}`);
    }
    $.done({});
}

// ==================== 6. Task 主任务逻辑 ====================
async function MainTask() {
    console.log("=================== 邦邦赚 v7 Quantumult X 任务开始 (v1.0.0) ===================");
    
    const tokenVal = $.getval("bbz_token") || "";
    if (!tokenVal) {
        $.msg("邦邦赚", "❌ 缺少 Token", "请打开 APP 进行抓包，或者手动在 QuanX 填写 bbz_token");
        return;
    }

    // 支持多账号，使用 # 或 & 分隔
    const tokenList = tokenVal.split(/[#&]/).filter(t => t.trim().length > 0);
    const maxCount = parseInt($.getval("bbz_max_count") || "15");

    console.log(`检测到 ${tokenList.length} 个账号，单次运行预计执行 ${maxCount} 次广告上报`);

    let summaryReport = "";

    for (let index = 0; index < tokenList.length; index++) {
        const token = tokenList[index].trim();
        const accountName = `账号${index + 1}`;
        const deviceId = $.getval("bbz_device_id") || getRandomHex(16);
        const oaid = $.getval("bbz_oaid") || getRandomHex(16);
        const userId = $.getval("bbz_user_id") || "user_id";
        const appcode = $.getval("bbz_appcode") || "206";

        console.log(`\n------------------- [${accountName}] 开始处理 -------------------`);

        // 1. 查询初始余额
        const startBalance = await queryBalance(token, appcode);
        console.log(`[${accountName}] 初始金币余额: ${startBalance}`);

        let successCount = 0;
        let totalGained = 0;

        // 2. 循环上报广告
        for (let i = 1; i <= maxCount; i++) {
            // 模拟观看广告延迟 5 ~ 12 秒
            const delay = Math.floor(Math.random() * 7000) + 5000;
            await sleep(delay);

            const result = await reportOne(token, appcode, deviceId, oaid, userId);
            if (result.success) {
                successCount++;
                totalGained += result.gain;
                console.log(`[${accountName}] #${i}/${maxCount} | ✅ ${result.info}`);
            } else {
                console.log(`[${accountName}] #${i}/${maxCount} | ❌ ${result.info}`);
                await sleep(4000); // 失败时额外冷却 4s
            }
        }

        // 3. 任务结束查询最终余额
        const endBalance = await queryBalance(token, appcode);
        const accountSummary = `💰 [${accountName}] 初始: ${startBalance} | 最终: ${endBalance} (预估增加: +${totalGained})`;
        console.log(accountSummary);
        summaryReport += accountSummary + "\n";
    }

    // 发送 QuanX 结果通知
    $.msg("邦邦赚 v7 运行完成", `完成 ${tokenList.length} 个账号打卡`, summaryReport);
}

// ==================== 7. API 请求函数 ====================
function queryBalance(token, appcode) {
    return new Promise((resolve) => {
        const url = `https://${BASE_HOST}/g/GetUserinfo.ashx`;
        const headers = {
            "Host": BASE_HOST,
            "Authorization": token.startsWith("Bearer ") ? token : `Bearer ${token}`,
            "APPCODE": appcode,
            "Accept-Language": "zh-CN",
            "Content-Type": "application/json",
            "User-Agent": "okhttp/4.9.0"
        };

        $.get({ url, headers }, (err, resp, body) => {
            if (!err && resp.status === 200) {
                try {
                    const data = JSON.parse(body);
                    if (data.Code === 200 && data.Data) {
                        const val = data.Data.coins || data.Data.coin || data.Data.balance || 0;
                        return resolve(val);
                    }
                } catch (e) {}
            }
            resolve(0);
        });
    });
}

function reportOne(token, appcode, deviceId, oaid, userId) {
    return new Promise((resolve) => {
        const tmpl = weightedChoice(AD_TEMPLATES);
        const ecpmVal = realisticEcpm(tmpl);
        const gainEstimate = Math.max(1, Math.floor(ecpmVal / 22));
        const baseTs = Date.now();
        const displayedAt = String(baseTs + Math.floor(Math.random() * 4000) - 2000);

        const detail = {
            "admodel_id": tmpl.admodel_id,
            "admodel_value": tmpl.admodel_value,
            "adplatform_name": tmpl.adplatform_name,
            "adtype_id": tmpl.adtype_id,
            "adtype_name": tmpl.adtype_name,
            "amount": String(Math.max(1, Math.floor(ecpmVal / 17))),
            "appUserId": "",
            "device_id": deviceId,
            "displayed_at": displayedAt,
            "ecpm": String(ecpmVal),
            "exchange_rate": "10000",
            "extraInfo": "",
            "loadId": getRandomUUID(),
            "network_placement_id": tmpl.network_placement_id,
            "real_money": (ecpmVal / 100000).toFixed(5),
            "reward_rate": tmpl.reward_rate,
            "user_id": userId
        };

        const ts = Math.floor(Date.now() / 1000);
        const randToken = getRandomHex(32);
        const detailsArr = [detail];
        const detailsJson = JSON.stringify(detailsArr);
        const signature = calcSignature(randToken, detailsJson, ts);

        const plainObj = {
            "clickRedPack": 0,
            "details": detailsJson,
            "device_id": deviceId,
            "oaid": oaid,
            "signature": signature,
            "timestamp": ts,
            "token": randToken
        };

        const encBody = aesCbcEncrypt(plainObj);
        const url = `https://${BASE_HOST}/g/GetAdrewardCoinsNew.ashx`;
        const headers = {
            "Host": BASE_HOST,
            "Authorization": token.startsWith("Bearer ") ? token : `Bearer ${token}`,
            "APPCODE": appcode,
            "Accept-Language": "zh-CN",
            "Content-Type": "application/json",
            "User-Agent": "okhttp/4.9.0"
        };

        $.post({ url, headers, body: encBody }, (err, resp, body) => {
            if (!err && resp.status === 200) {
                try {
                    const resJson = JSON.parse(body);
                    if (resJson.Code === 200) {
                        const coins = (resJson.Data && resJson.Data.coins) ? resJson.Data.coins : gainEstimate;
                        return resolve({
                            success: true,
                            gain: coins,
                            info: `${tmpl.adtype_name}(${tmpl.adplatform_name}) eCPM:${ecpmVal} +${coins}金币`
                        });
                    } else {
                        return resolve({
                            success: false,
                            gain: 0,
                            info: `${tmpl.adtype_name} 接口返回错误: ${resJson.Message || resJson.Code}`
                        });
                    }
                } catch (e) {
                    return resolve({ success: false, gain: 0, info: `解析失败: ${body}` });
                }
            } else {
                return resolve({ success: false, gain: 0, info: `HTTP Error: ${resp ? resp.status : err}` });
            }
        });
    });
}
