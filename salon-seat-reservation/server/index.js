const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'reservations.json');
const DEFAULT_SEATS_FILE = path.join(DATA_DIR, 'default-seats.json');
const LOGS_FILE = path.join(DATA_DIR, 'history_logs.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 获取今天 YYYY-MM-DD 格式
function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 加载默认模板席位
function loadDefaultSeats() {
  if (fs.existsSync(DEFAULT_SEATS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DEFAULT_SEATS_FILE, 'utf-8'));
    } catch (e) {}
  }
  return [];
}

// 方案B：按日期索引的数据存储加载
function loadStore() {
  let store = {
    byDate: {},
    baseSeats: []
  };

  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      // 兼容旧格式（如果是纯数组，迁移为今天的记录）
      if (Array.isArray(raw)) {
        const today = getTodayString();
        store.byDate[today] = raw;
        store.baseSeats = raw.map(s => ({
          id: s.id,
          name: s.name,
          area: s.area,
          type: s.type,
          x: s.x,
          y: s.y
        }));
        saveStore(store);
        return store;
      } else if (raw && typeof raw === 'object') {
        store.byDate = raw.byDate || {};
        store.baseSeats = Array.isArray(raw.baseSeats) && raw.baseSeats.length > 0
          ? raw.baseSeats
          : loadDefaultSeats().map(s => ({
              id: s.id,
              name: s.name,
              area: s.area,
              type: s.type,
              x: s.x,
              y: s.y
            }));
        return store;
      }
    }
  } catch (err) {
    console.error('Error reading data file:', err.message);
  }

  // 兜底新建
  store.baseSeats = loadDefaultSeats().map(s => ({
    id: s.id,
    name: s.name,
    area: s.area,
    type: s.type,
    x: s.x,
    y: s.y
  }));
  saveStore(store);
  return store;
}

function saveStore(store) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save store:', err.message);
  }
}

// 获取指定日期的席位状态（如不存在则依据基础席位自动初始化）
function getSeatsForDate(targetDate) {
  const dateStr = targetDate || getTodayString();
  const store = loadStore();

  if (store.byDate[dateStr]) {
    // 确保与 baseSeats 的名称和坐标保持最新同步
    store.byDate[dateStr] = store.byDate[dateStr].map(seat => {
      const base = store.baseSeats.find(b => b.id === seat.id);
      if (base) {
        return {
          ...seat,
          name: base.name || seat.name,
          area: base.area || seat.area,
          x: base.x !== undefined ? base.x : seat.x,
          y: base.y !== undefined ? base.y : seat.y
        };
      }
      return seat;
    });
    return { date: dateStr, seats: store.byDate[dateStr] };
  }

  // 为新的一天生成干净席位
  const newDaySeats = store.baseSeats.map(b => ({
    ...b,
    status: 'unused',
    booking: null
  }));

  store.byDate[dateStr] = newDaySeats;
  saveStore(store);
  return { date: dateStr, seats: newDaySeats };
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error loading settings:', err.message);
  }
  return {
    stylists: ["Tony (总监)", "Alex (首席)", "David (资深)", "Emily (设计总监)", "Kevin (烫染总监)"],
    assistants: ["无", "阿杰", "小敏", "小刘"],
    services: [
      { name: "洗剪吹", mins: 45 },
      { name: "高级染发", mins: 120 },
      { name: "热烫/造型", mins: 150 },
      { name: "头皮深层SPA", mins: 60 },
      { name: "吹风造型", mins: 30 }
    ]
  };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save settings:', err.message);
  }
}

function appendLog(action, dateStr, seatId, seatName, details) {
  try {
    let logs = [];
    if (fs.existsSync(LOGS_FILE)) {
      logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
    }
    const logItem = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      date: dateStr,
      action,
      seatId,
      seatName,
      details
    };
    logs.unshift(logItem);
    if (logs.length > 200) logs = logs.slice(0, 200);
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to append log:', err.message);
  }
}

// 广播给所有连接的前端客户端
function broadcast(type, payload, targetDate) {
  const message = JSON.stringify({ type, payload, targetDate, timestamp: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// WebSocket 连接处理
wss.on('connection', (ws) => {
  const today = getTodayString();
  const { seats } = getSeatsForDate(today);
  const settings = loadSettings();
  ws.send(JSON.stringify({ type: 'init', payload: seats, date: today, settings }));

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (e) {}
  });
});

// API: 获取员工与服务项目设置
app.get('/api/settings', (req, res) => {
  const settings = loadSettings();
  res.json({ success: true, data: settings });
});

// API: 保存员工与服务项目设置
app.post('/api/settings', (req, res) => {
  const { stylists, assistants, services } = req.body;
  if (!Array.isArray(stylists) || !Array.isArray(assistants)) {
    return res.status(400).json({ success: false, message: '数据格式错误' });
  }
  const newSettings = {
    stylists: stylists.filter(Boolean),
    assistants: assistants.filter(Boolean),
    services: Array.isArray(services) ? services : []
  };
  saveSettings(newSettings);
  broadcast('settings_updated', newSettings);
  res.json({ success: true, message: '员工与服务配置保存成功', data: newSettings });
});

// API: 获取指定日期的全部席位及状态 (GET /api/seats?date=YYYY-MM-DD)
app.get('/api/seats', (req, res) => {
  const targetDate = req.query.date || getTodayString();
  const { date, seats } = getSeatsForDate(targetDate);
  res.json({ success: true, date, data: seats });
});

// API: 预约/占用席位 (支持指定日期)
app.post('/api/seats/:id/book', (req, res) => {
  const { id } = req.params;
  const {
    date,
    stylist,
    assistant,
    arrivalTime,
    serviceItem,
    endTime,
    customerSource,
    customerName,
    customerPhone,
    notes
  } = req.body;

  if (!stylist || !arrivalTime || !serviceItem) {
    return res.status(400).json({ success: false, message: '发型师、到店时间与服务项目为必填项' });
  }

  const targetDate = date || getTodayString();
  const store = loadStore();
  if (!store.byDate[targetDate]) {
    getSeatsForDate(targetDate);
  }

  const dateSeats = store.byDate[targetDate] || [];
  const seat = dateSeats.find(s => s.id === id);

  if (!seat) {
    return res.status(404).json({ success: false, message: '未找到指定席位' });
  }

  seat.status = 'booked';
  seat.booking = {
    date: targetDate,
    stylist: stylist.trim(),
    assistant: (assistant || '无').trim(),
    arrivalTime: arrivalTime.trim(),
    serviceItem: serviceItem.trim(),
    endTime: (endTime || '').trim(),
    customerSource: (customerSource || '自然到店').trim(),
    customerName: (customerName || '').trim(),
    customerPhone: (customerPhone || '').trim(),
    notes: (notes || '').trim(),
    bookedAt: new Date().toISOString()
  };

  saveStore(store);
  appendLog('book', targetDate, seat.id, seat.name, seat.booking);
  broadcast('seats_updated', dateSeats, targetDate);

  res.json({ success: true, message: '预约成功', data: seat, date: targetDate });
});

// API: 取消占用（释放座位为未使用，支持指定日期）
app.post('/api/seats/:id/cancel', (req, res) => {
  const { id } = req.params;
  const targetDate = req.body.date || req.query.date || getTodayString();

  const store = loadStore();
  const dateSeats = store.byDate[targetDate];

  if (!dateSeats) {
    return res.status(404).json({ success: false, message: '未找到该日期的席位记录' });
  }

  const seat = dateSeats.find(s => s.id === id);
  if (!seat) {
    return res.status(404).json({ success: false, message: '未找到指定席位' });
  }

  const prevBooking = seat.booking;
  seat.status = 'unused';
  seat.booking = null;

  saveStore(store);
  appendLog('cancel', targetDate, seat.id, seat.name, { prevBooking, canceledAt: new Date().toISOString() });
  broadcast('seats_updated', dateSeats, targetDate);

  res.json({ success: true, message: '座位已释放为未使用', data: seat, date: targetDate });
});

// API: 重命名席位/房间名称（全局同步基础模板及所有日期）
app.post('/api/seats/:id/rename', (req, res) => {
  const { id } = req.params;
  const { name, area } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: '席位/房间名称不能为空' });
  }

  const store = loadStore();
  // 1. 更新 baseSeats
  const base = store.baseSeats.find(b => b.id === id);
  if (base) {
    base.name = name.trim();
    if (area && area.trim()) base.area = area.trim();
  }

  // 2. 更新所有日期的席位名称
  Object.keys(store.byDate).forEach(d => {
    const s = store.byDate[d].find(x => x.id === id);
    if (s) {
      s.name = name.trim();
      if (area && area.trim()) s.area = area.trim();
    }
  });

  saveStore(store);
  appendLog('rename', 'ALL', id, name, { newName: name, area });

  // 广播更新
  broadcast('seats_global_updated', store.baseSeats);

  res.json({ success: true, message: '名称修改成功', data: { id, name, area } });
});

// API: 批量修改席位/房间名称
app.post('/api/seats/batch-rename', (req, res) => {
  const { seats: updatedList } = req.body;
  if (!Array.isArray(updatedList)) {
    return res.status(400).json({ success: false, message: '参数格式错误' });
  }

  const store = loadStore();
  updatedList.forEach(item => {
    const base = store.baseSeats.find(b => b.id === item.id);
    if (base && item.name && item.name.trim()) {
      base.name = item.name.trim();
      if (item.area && item.area.trim()) base.area = item.area.trim();
    }

    Object.keys(store.byDate).forEach(d => {
      const s = store.byDate[d].find(x => x.id === item.id);
      if (s && item.name && item.name.trim()) {
        s.name = item.name.trim();
        if (item.area && item.area.trim()) s.area = item.area.trim();
      }
    });
  });

  saveStore(store);
  broadcast('seats_global_updated', store.baseSeats);
  res.json({ success: true, message: '席位与房间名称批量保存成功' });
});

// API: 更新席位坐标微调（全局同步）
app.post('/api/seats/coords', (req, res) => {
  const { coords } = req.body;
  if (!Array.isArray(coords)) {
    return res.status(400).json({ success: false, message: '无效坐标参数' });
  }

  const store = loadStore();
  coords.forEach(item => {
    const base = store.baseSeats.find(b => b.id === item.id);
    if (base) {
      if (typeof item.x === 'number') base.x = item.x;
      if (typeof item.y === 'number') base.y = item.y;
    }

    Object.keys(store.byDate).forEach(d => {
      const s = store.byDate[d].find(x => x.id === item.id);
      if (s) {
        if (typeof item.x === 'number') s.x = item.x;
        if (typeof item.y === 'number') s.y = item.y;
      }
    });
  });

  saveStore(store);
  broadcast('seats_global_updated', store.baseSeats);
  res.json({ success: true, message: '坐标更新保存成功' });
});

// API: 获取历史操作日志
app.get('/api/history', (req, res) => {
  try {
    if (fs.existsSync(LOGS_FILE)) {
      const logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
      return res.json({ success: true, data: logs });
    }
    return res.json({ success: true, data: [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: 系统信息
app.get('/api/system-info', (req, res) => {
  const packageJson = require('../package.json');
  res.json({
    success: true,
    version: packageJson.version,
    nodeVersion: process.version,
    serverTime: new Date().toISOString(),
    today: getTodayString()
  });
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`💈 ReMINGLE PLUS Seat System running at http://0.0.0.0:${PORT}`);
});
