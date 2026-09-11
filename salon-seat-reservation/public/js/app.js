/**
 * ReMINGLE PLUS - SEAT RESERVATION SYSTEM CLIENT
 * Version: 1.1.0
 */

// 日期辅助工具
function getFormattedDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

let todayDate = getFormattedDate(0);
let currentDate = todayDate;
let seats = [];
let salonSettings = { stylists: [], assistants: [], services: [] };
let activeAreaFilter = 'ALL';
let searchQuery = '';
let isCalibrating = false;
let draggedSeat = null;
let originalCoords = {};
let ws = null;

// DOM 元素引用
const floorplanContainer = document.getElementById('floorplan-container');
const seatsOverlay = document.getElementById('seats-overlay');
const wsStatus = document.getElementById('ws-status');
const statTotal = document.getElementById('stat-total');
const statBooked = document.getElementById('stat-booked');
const statUnused = document.getElementById('stat-unused');
const statRate = document.getElementById('stat-rate');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const areaFilters = document.getElementById('area-filters');
const calibrateBtn = document.getElementById('calibrate-toggle-btn');
const calibrateBtnText = document.getElementById('calibrate-btn-text');
const calibrationBar = document.getElementById('calibration-bar');
const saveCoordsBtn = document.getElementById('save-coords-btn');
const cancelCoordsBtn = document.getElementById('cancel-coords-btn');

// 日期切换器 DOM
const dateChips = document.getElementById('date-chips');
const customDatePicker = document.getElementById('custom-date-picker');
const futureDateBanner = document.getElementById('future-date-banner');
const bannerDateLabel = document.getElementById('banner-date-label');
const btnBackToToday = document.getElementById('btn-back-to-today');

// 预约模态框
const bookingModal = document.getElementById('booking-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const bookingForm = document.getElementById('booking-form');
const formSeatId = document.getElementById('form-seat-id');
const modalSeatTitle = document.getElementById('modal-seat-title');
const modalSeatArea = document.getElementById('modal-seat-area');
const formBookingDate = document.getElementById('form-booking-date');
const formStylist = document.getElementById('form-stylist');
const formAssistant = document.getElementById('form-assistant');
const formArrivalTime = document.getElementById('form-arrival-time');
const formEndTime = document.getElementById('form-end-time');
const formService = document.getElementById('form-service');
const formCustomerName = document.getElementById('form-customer-name');
const formCustomerPhone = document.getElementById('form-customer-phone');
const formNotes = document.getElementById('form-notes');

// 详情模态框
const detailModal = document.getElementById('detail-modal');
const detailCloseBtn = document.getElementById('detail-close-btn');
const detailCloseBottomBtn = document.getElementById('detail-close-bottom-btn');
const detailCancelSeatBtn = document.getElementById('detail-cancel-seat-btn');
const detailSeatName = document.getElementById('detail-seat-name');
const dStylist = document.getElementById('d-stylist');
const dAssistant = document.getElementById('d-assistant');
const dArrival = document.getElementById('d-arrival');
const dEnd = document.getElementById('d-end');
const dService = document.getElementById('d-service');
const dSource = document.getElementById('d-source');
const dCustomer = document.getElementById('d-customer');
const dNotes = document.getElementById('d-notes');
const dNotesRow = document.getElementById('d-notes-row');
let currentDetailSeat = null;

// 历史抽屉
const historyBtn = document.getElementById('history-btn');
const historyDrawer = document.getElementById('history-drawer');
const historyCloseBtn = document.getElementById('history-close-btn');
const historyList = document.getElementById('history-list');

// 初始化入口
document.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  fetchSeats(currentDate);
  fetchSettings();
  setupEventListeners();
  setupQuickTags();
  setupSettingsModal();
  setupRenameFeature();
  setupZoomAndPan();
  setupDateSwitcher();
});

// 1. 初始化 WebSocket 实时连接
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    wsStatus.classList.remove('disconnected');
    wsStatus.querySelector('.status-text').textContent = '实时连接';
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'init') {
        if (!data.date || data.date === currentDate) {
          seats = data.payload;
          render();
        }
        if (data.settings) {
          salonSettings = data.settings;
          renderBookingOptions();
        }
      } else if (data.type === 'seats_updated') {
        // 如果推送的日期与当前正在查看的日期一致，则实时刷新
        if (!data.targetDate || data.targetDate === currentDate) {
          seats = data.payload;
          render();
        }
      } else if (data.type === 'seats_global_updated') {
        // 全局基础模板（名称/坐标）发生修改，重新拉取当前日期
        fetchSeats(currentDate);
      } else if (data.type === 'settings_updated') {
        salonSettings = data.payload;
        renderBookingOptions();
      }
    } catch (e) {
      console.error('WebSocket parse error:', e);
    }
  };

  ws.onclose = () => {
    wsStatus.classList.add('disconnected');
    wsStatus.querySelector('.status-text').textContent = '已断连 (重试中)';
    setTimeout(initWebSocket, 3000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

// 2. 获取指定日期的席位数据
async function fetchSeats(targetDate) {
  try {
    const queryDate = targetDate || currentDate;
    const res = await fetch(`/api/seats?date=${queryDate}`);
    const json = await res.json();
    if (json.success) {
      seats = json.data;
      render();
    }
  } catch (err) {
    console.error('Failed to fetch seats:', err);
  }
}

// 获取员工与项目设置
async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (json.success) {
      salonSettings = json.data;
      renderBookingOptions();
    }
  } catch (err) {
    console.error('Failed to fetch settings:', err);
  }
}

// 动态渲染预约弹窗中的发型师、助理与服务快捷选项
function renderBookingOptions() {
  // 1. 发型师
  const quickStylists = document.getElementById('quick-stylists');
  const stylistDatalist = document.getElementById('stylist-list');
  if (quickStylists && salonSettings.stylists) {
    quickStylists.innerHTML = salonSettings.stylists.map(name => `<span class="q-tag">${name}</span>`).join('');
  }
  if (stylistDatalist && salonSettings.stylists) {
    stylistDatalist.innerHTML = salonSettings.stylists.map(name => `<option value="${name}"></option>`).join('');
  }

  // 2. 助理
  const quickAssistants = document.getElementById('quick-assistants');
  const assistantDatalist = document.getElementById('assistant-list');
  if (quickAssistants && salonSettings.assistants) {
    quickAssistants.innerHTML = salonSettings.assistants.map(name => `<span class="q-tag">${name}</span>`).join('');
  }
  if (assistantDatalist && salonSettings.assistants) {
    assistantDatalist.innerHTML = salonSettings.assistants.map(name => `<option value="${name}"></option>`).join('');
  }

  // 3. 服务项目
  const quickServices = document.getElementById('quick-services');
  if (quickServices && salonSettings.services) {
    quickServices.innerHTML = salonSettings.services.map(s => 
      `<span class="q-tag service-tag" data-mins="${s.mins}">${s.name} (+${s.mins}分)</span>`
    ).join('');
  }
}

// 3. 页面渲染核心
function render() {
  renderStats();
  renderSeats();
}

// 渲染统计指标
function renderStats() {
  const total = seats.length;
  const booked = seats.filter(s => s.status === 'booked').length;
  const unused = total - booked;
  const rate = total > 0 ? Math.round((booked / total) * 100) : 0;

  statTotal.textContent = total;
  statBooked.textContent = booked;
  statUnused.textContent = unused;
  statRate.textContent = `${rate}%`;
}

// 渲染平面图席位卡片
function renderSeats() {
  seatsOverlay.innerHTML = '';

  seats.forEach(seat => {
    // 区域筛选过滤
    const isFiltered = (activeAreaFilter !== 'ALL') && (
      activeAreaFilter === '独立包间'
        ? (seat.area.includes('单人间') || seat.area.includes('SPA'))
        : (seat.area !== activeAreaFilter)
    );

    // 搜索关键词命中
    let isSearchHit = false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const b = seat.booking;
      if (
        seat.name.toLowerCase().includes(q) ||
        seat.area.toLowerCase().includes(q) ||
        (b && (
          b.stylist.toLowerCase().includes(q) ||
          (b.assistant && b.assistant.toLowerCase().includes(q)) ||
          (b.customerName && b.customerName.toLowerCase().includes(q)) ||
          (b.customerPhone && b.customerPhone.includes(q)) ||
          b.serviceItem.toLowerCase().includes(q) ||
          b.customerSource.toLowerCase().includes(q)
        ))
      ) {
        isSearchHit = true;
      }
    }

    const node = document.createElement('div');
    node.className = `seat-node ${isFiltered ? 'filtered-out' : ''} ${isSearchHit ? 'searched-hit' : ''} ${isCalibrating ? 'calibrating' : ''}`;
    node.id = `seat-node-${seat.id}`;
    node.style.left = `${seat.x}%`;
    node.style.top = `${seat.y}%`;
    node.dataset.id = seat.id;

    if (seat.status === 'unused') {
      node.innerHTML = `
        <div class="seat-card unused">
          <span class="seat-id">${seat.name}</span>
          <span class="seat-status-tag">未使用</span>
        </div>
      `;
    } else {
      const b = seat.booking || {};
      const sourceClass = `source-${b.customerSource || '自然到店'}`;
      node.innerHTML = `
        <div class="seat-card booked">
          <div class="card-header-row">
            <span class="seat-id">${seat.name}</span>
            <span class="source-badge ${sourceClass}">${b.customerSource || '到店'}</span>
          </div>
          <div class="staff-info">
            <span class="stylist-name">👤 ${b.stylist}</span>
            ${b.assistant && b.assistant !== '无' ? `<span class="assistant-name">(${b.assistant})</span>` : ''}
          </div>
          <div class="customer-info" title="顾客信息: ${b.customerName || '未留姓名'} ${b.customerPhone || ''}">
            <span class="customer-phone">📱 ${b.customerPhone || '未留手机'}</span>
            ${b.customerName ? `<span class="customer-name">(${b.customerName})</span>` : ''}
          </div>
          <div class="service-info" title="${b.serviceItem}">
            ✂️ ${b.serviceItem}
          </div>
          <div class="time-info">
            ⏰ ${b.arrivalTime}${b.endTime ? ` - ${b.endTime}` : ''}
          </div>
          <button type="button" class="quick-cancel-btn" data-cancel-id="${seat.id}">取消占用</button>
        </div>
      `;
    }

    // 席位点击逻辑
    node.addEventListener('click', (e) => {
      if (isCalibrating) return;

      if (e.target.classList.contains('quick-cancel-btn') || e.target.closest('.quick-cancel-btn')) {
        e.stopPropagation();
        confirmCancelSeat(seat);
        return;
      }

      if (seat.status === 'unused') {
        openBookingModal(seat);
      } else {
        openDetailModal(seat);
      }
    });

    if (isCalibrating) {
      setupDrag(node, seat);
    }

    seatsOverlay.appendChild(node);
  });
}

// 4. 打开预约开单弹窗
function openBookingModal(seat) {
  formSeatId.value = seat.id;
  modalSeatTitle.textContent = `预约席位：${seat.name}`;
  modalSeatArea.textContent = seat.area;

  bookingForm.reset();

  // 默认日期为当前正在查看的日期
  if (formBookingDate) {
    formBookingDate.value = currentDate;
  }

  const now = new Date();
  const currentHH = String(now.getHours()).padStart(2, '0');
  const currentMM = String(now.getMinutes()).padStart(2, '0');
  formArrivalTime.value = `${currentHH}:${currentMM}`;

  const end = new Date(now.getTime() + 60 * 60 * 1000);
  formEndTime.value = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;

  bookingModal.style.display = 'flex';
  setTimeout(() => formStylist.focus(), 100);
}

// 5. 打开详情弹窗
function openDetailModal(seat) {
  currentDetailSeat = seat;
  const b = seat.booking || {};

  detailSeatName.textContent = `${seat.name} (${seat.area})`;
  dStylist.textContent = b.stylist || '-';
  dAssistant.textContent = b.assistant || '无';
  dArrival.textContent = b.arrivalTime || '-';
  dEnd.textContent = b.endTime || '未指定';
  dService.textContent = b.serviceItem || '-';
  dSource.textContent = b.customerSource || '自然到店';

  const customerText = [];
  if (b.customerName) customerText.push(b.customerName);
  if (b.customerPhone) customerText.push(`(${b.customerPhone})`);
  dCustomer.textContent = customerText.length > 0 ? customerText.join(' ') : '未记录';

  if (b.notes) {
    dNotesRow.style.display = 'flex';
    dNotes.textContent = b.notes;
  } else {
    dNotesRow.style.display = 'none';
  }

  detailModal.style.display = 'flex';
}

// 6. 取消占用操作（支持携带当前日期）
async function confirmCancelSeat(seat) {
  const seatName = seat.name;
  const stylist = seat.booking ? seat.booking.stylist : '';
  const dateTip = currentDate === todayDate ? '今天' : currentDate;
  const confirmMsg = `确定要取消【${dateTip} · ${seatName}】的占用并恢复为“未使用”吗？\n当前发型师：${stylist || '无'}`;

  if (confirm(confirmMsg)) {
    try {
      const res = await fetch(`/api/seats/${seat.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: currentDate })
      });
      const data = await res.json();
      if (data.success) {
        if (detailModal.style.display === 'flex') {
          detailModal.style.display = 'none';
        }
      } else {
        alert('取消失败: ' + data.message);
      }
    } catch (e) {
      alert('请求失败，请检查网络');
    }
  }
}

// 7. 提交预约表单
bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const seatId = formSeatId.value;
  const selectedSource = document.querySelector('input[name="source"]:checked')?.value || '大众点评';
  const bookingDate = formBookingDate ? formBookingDate.value : currentDate;

  const payload = {
    date: bookingDate,
    stylist: formStylist.value.trim(),
    assistant: formAssistant.value.trim() || '无',
    arrivalTime: formArrivalTime.value,
    endTime: formEndTime.value,
    serviceItem: formService.value.trim(),
    customerSource: selectedSource,
    customerName: formCustomerName.value.trim(),
    customerPhone: formCustomerPhone.value.trim(),
    notes: formNotes.value.trim()
  };

  try {
    const res = await fetch(`/api/seats/${seatId}/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      bookingModal.style.display = 'none';
      // 如果预约的不是当前查看的日期，自动切换到该日期
      if (bookingDate !== currentDate) {
        switchDate(bookingDate);
      }
    } else {
      alert('预约失败: ' + data.message);
    }
  } catch (err) {
    alert('网络异常，请重试');
  }
});

// 8. 快速项目与人员点击联动
function setupQuickTags() {
  document.getElementById('quick-stylists').addEventListener('click', (e) => {
    if (e.target.classList.contains('q-tag')) {
      formStylist.value = e.target.textContent;
    }
  });

  document.getElementById('quick-assistants').addEventListener('click', (e) => {
    if (e.target.classList.contains('q-tag')) {
      formAssistant.value = e.target.textContent;
    }
  });

  document.getElementById('quick-services').addEventListener('click', (e) => {
    const target = e.target.closest('.service-tag');
    if (target) {
      const mins = parseInt(target.dataset.mins, 10);
      const text = target.textContent.split(' (')[0];
      formService.value = text;

      if (formArrivalTime.value) {
        const [hh, mm] = formArrivalTime.value.split(':').map(Number);
        const date = new Date();
        date.setHours(hh, mm, 0, 0);
        date.setMinutes(date.getMinutes() + mins);
        const endHH = String(date.getHours()).padStart(2, '0');
        const endMM = String(date.getMinutes()).padStart(2, '0');
        formEndTime.value = `${endHH}:${endMM}`;
      }
    }
  });
}

// 9. 日期切换交互逻辑
function switchDate(targetDate) {
  currentDate = targetDate;
  if (customDatePicker) customDatePicker.value = targetDate;

  // 更新日期胶囊高亮
  if (dateChips) {
    dateChips.querySelectorAll('.date-chip').forEach(chip => {
      chip.classList.remove('active');
      const type = chip.dataset.type;
      if (type === 'today' && targetDate === todayDate) chip.classList.add('active');
      if (type === 'tomorrow' && targetDate === getFormattedDate(1)) chip.classList.add('active');
      if (type === 'afterTomorrow' && targetDate === getFormattedDate(2)) chip.classList.add('active');
    });
  }

  // 未来日期横幅提醒控制
  if (futureDateBanner) {
    if (currentDate !== todayDate) {
      futureDateBanner.style.display = 'flex';
      let dateDesc = currentDate;
      if (currentDate === getFormattedDate(1)) dateDesc += ' (明天)';
      else if (currentDate === getFormattedDate(2)) dateDesc += ' (后天)';
      bannerDateLabel.textContent = dateDesc;
    } else {
      futureDateBanner.style.display = 'none';
    }
  }

  fetchSeats(currentDate);
}

function setupDateSwitcher() {
  if (customDatePicker) {
    customDatePicker.value = currentDate;
    customDatePicker.min = todayDate;
    customDatePicker.addEventListener('change', (e) => {
      if (e.target.value) {
        switchDate(e.target.value);
      }
    });
  }

  if (dateChips) {
    dateChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.date-chip');
      if (chip) {
        const type = chip.dataset.type;
        if (type === 'today') switchDate(todayDate);
        else if (type === 'tomorrow') switchDate(getFormattedDate(1));
        else if (type === 'afterTomorrow') switchDate(getFormattedDate(2));
      }
    });
  }

  if (btnBackToToday) {
    btnBackToToday.onclick = () => switchDate(todayDate);
  }
}

// 10. 事件绑定
function setupEventListeners() {
  modalCloseBtn.onclick = () => bookingModal.style.display = 'none';
  modalCancelBtn.onclick = () => bookingModal.style.display = 'none';
  detailCloseBtn.onclick = () => detailModal.style.display = 'none';
  detailCloseBottomBtn.onclick = () => detailModal.style.display = 'none';

  detailCancelSeatBtn.onclick = () => {
    if (currentDetailSeat) {
      confirmCancelSeat(currentDetailSeat);
    }
  };

  window.onclick = (e) => {
    if (e.target === bookingModal) bookingModal.style.display = 'none';
    if (e.target === detailModal) detailModal.style.display = 'none';
    if (e.target === historyDrawer) historyDrawer.style.display = 'none';
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal && e.target === settingsModal) settingsModal.style.display = 'none';
  };

  if (areaFilters) {
    areaFilters.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (chip) {
        areaFilters.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeAreaFilter = chip.dataset.area;
        renderSeats();
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
      renderSeats();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.onclick = () => {
      searchInput.value = '';
      searchQuery = '';
      clearSearchBtn.style.display = 'none';
      renderSeats();
    };
  }

  if (historyBtn) historyBtn.onclick = openHistoryDrawer;
  if (historyCloseBtn) historyCloseBtn.onclick = () => historyDrawer.style.display = 'none';

  if (calibrateBtn) calibrateBtn.onclick = toggleCalibrationMode;
  if (saveCoordsBtn) saveCoordsBtn.onclick = saveCalibratedCoords;
  if (cancelCoordsBtn) cancelCoordsBtn.onclick = cancelCalibration;
}

// 11. 点位微调拖拽逻辑
function toggleCalibrationMode() {
  isCalibrating = !isCalibrating;
  if (isCalibrating) {
    calibrateBtn.classList.add('btn-primary');
    calibrateBtnText.textContent = '正在微调...';
    calibrationBar.style.display = 'flex';
    originalCoords = {};
    seats.forEach(s => {
      originalCoords[s.id] = { x: s.x, y: s.y };
    });
  } else {
    calibrateBtn.classList.remove('btn-primary');
    calibrateBtnText.textContent = '微调点位';
    calibrationBar.style.display = 'none';
  }
  renderSeats();
}

function setupDrag(node, seat) {
  let isDragging = false;

  node.onmousedown = (e) => {
    if (!isCalibrating) return;
    e.preventDefault();
    isDragging = true;
    draggedSeat = seat;

    const rect = floorplanContainer.getBoundingClientRect();

    const onMouseMove = (moveEvent) => {
      if (!isDragging) return;
      const xPx = moveEvent.clientX - rect.left;
      const yPx = moveEvent.clientY - rect.top;

      let xPercent = (xPx / rect.width) * 100;
      let yPercent = (yPx / rect.height) * 100;

      xPercent = Math.max(2, Math.min(98, xPercent));
      yPercent = Math.max(2, Math.min(98, yPercent));

      seat.x = Number(xPercent.toFixed(1));
      seat.y = Number(yPercent.toFixed(1));

      node.style.left = `${seat.x}%`;
      node.style.top = `${seat.y}%`;
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };
}

async function saveCalibratedCoords() {
  const coords = seats.map(s => ({ id: s.id, x: s.x, y: s.y }));
  try {
    const res = await fetch('/api/seats/coords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coords })
    });
    const data = await res.json();
    if (data.success) {
      alert('席位坐标全局保存成功！所有日期已同步更新。');
      toggleCalibrationMode();
    }
  } catch (err) {
    alert('保存坐标失败');
  }
}

function cancelCalibration() {
  seats.forEach(s => {
    if (originalCoords[s.id]) {
      s.x = originalCoords[s.id].x;
      s.y = originalCoords[s.id].y;
    }
  });
  toggleCalibrationMode();
}

// 12. 打开历史操作抽屉
async function openHistoryDrawer() {
  historyDrawer.style.display = 'flex';
  historyList.innerHTML = '<div class="loading-tip">正在加载日志...</div>';

  try {
    const res = await fetch('/api/history');
    const json = await res.json();
    if (json.success && json.data.length > 0) {
      historyList.innerHTML = json.data.map(item => {
        const timeStr = new Date(item.timestamp).toLocaleTimeString();
        let actionLabel = '预约';
        let actionClass = 'book';
        let desc = '';

        if (item.action === 'book') {
          actionLabel = '预约占用';
          actionClass = 'book';
          desc = `[${item.date || '今天'}] 发型师: ${item.details.stylist} | 项目: ${item.details.serviceItem} | 来源: ${item.details.customerSource}`;
        } else if (item.action === 'cancel') {
          actionLabel = '取消占用';
          actionClass = 'cancel';
          desc = `[${item.date || '今天'}] 释放为未使用 (原发型师: ${item.details.prevBooking?.stylist || '无'})`;
        }

        return `
          <div class="history-card">
            <div class="h-top">
              <span class="h-action ${actionClass}">[${actionLabel}] ${item.seatName}</span>
              <span class="h-time">${timeStr}</span>
            </div>
            <div class="h-desc">${desc}</div>
          </div>
        `;
      }).join('');
    } else {
      historyList.innerHTML = '<div class="loading-tip">暂无操作日志</div>';
    }
  } catch (e) {
    historyList.innerHTML = '<div class="loading-tip">获取日志失败</div>';
  }
}

// 13. 员工与项目管理设置弹窗
function setupSettingsModal() {
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const settingsCloseBtn = document.getElementById('settings-close-btn');
  const settingsCancelBtn = document.getElementById('settings-cancel-btn');
  const settingsSaveBtn = document.getElementById('settings-save-btn');
  const settingsCalibrateBtn = document.getElementById('settings-calibrate-btn');

  const stylistTagsBox = document.getElementById('stylist-tags-box');
  const newStylistInput = document.getElementById('new-stylist-input');
  const addStylistBtn = document.getElementById('add-stylist-btn');

  const assistantTagsBox = document.getElementById('assistant-tags-box');
  const newAssistantInput = document.getElementById('new-assistant-input');
  const addAssistantBtn = document.getElementById('add-assistant-btn');

  const servicesEditorList = document.getElementById('services-editor-list');
  const newServiceName = document.getElementById('new-service-name');
  const newServiceMins = document.getElementById('new-service-mins');
  const addServiceBtn = document.getElementById('add-service-btn');

  let editStylists = [];
  let editAssistants = [];
  let editServices = [];

  function openSettings() {
    editStylists = [...(salonSettings.stylists || [])];
    editAssistants = [...(salonSettings.assistants || [])];
    editServices = (salonSettings.services || []).map(s => ({ ...s }));

    renderEditLists();
    renderSeatsRenameList();
    settingsModal.style.display = 'flex';
  }

  function renderSeatsRenameList() {
    const seatsRenameList = document.getElementById('seats-rename-list');
    if (seatsRenameList && Array.isArray(seats)) {
      seatsRenameList.innerHTML = seats.map(s => `
        <div class="rename-seat-item-row" data-id="${s.id}">
          <span class="seat-area-label" title="${s.area}">${s.area}</span>
          <input type="text" class="seat-rename-input" data-id="${s.id}" value="${s.name}" placeholder="房间/工位名称">
        </div>
      `).join('');
    }
  }

  function renderEditLists() {
    stylistTagsBox.innerHTML = editStylists.map((name, idx) => `
      <span class="tag-pill">
        <span>${name}</span>
        <span class="remove-tag" data-type="stylist" data-idx="${idx}">&times;</span>
      </span>
    `).join('');

    assistantTagsBox.innerHTML = editAssistants.map((name, idx) => `
      <span class="tag-pill">
        <span>${name}</span>
        ${name !== '无' ? `<span class="remove-tag" data-type="assistant" data-idx="${idx}">&times;</span>` : ''}
      </span>
    `).join('');

    servicesEditorList.innerHTML = editServices.map((s, idx) => `
      <div class="service-item-row">
        <span class="svc-name">${s.name}</span>
        <div>
          <span class="svc-mins">+${s.mins}分钟</span>
          <span class="remove-svc" data-type="service" data-idx="${idx}">&times;</span>
        </div>
      </div>
    `).join('');
  }

  function addStylist() {
    const val = newStylistInput.value.trim();
    if (val && !editStylists.includes(val)) {
      editStylists.push(val);
      newStylistInput.value = '';
      renderEditLists();
    }
  }
  addStylistBtn.onclick = addStylist;
  newStylistInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addStylist(); } };

  function addAssistant() {
    const val = newAssistantInput.value.trim();
    if (val && !editAssistants.includes(val)) {
      editAssistants.push(val);
      newAssistantInput.value = '';
      renderEditLists();
    }
  }
  addAssistantBtn.onclick = addAssistant;
  newAssistantInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addAssistant(); } };

  function addService() {
    const name = newServiceName.value.trim();
    const mins = parseInt(newServiceMins.value, 10) || 45;
    if (name) {
      editServices.push({ name, mins });
      newServiceName.value = '';
      newServiceMins.value = '60';
      renderEditLists();
    }
  }
  addServiceBtn.onclick = addService;
  newServiceName.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addService(); } };

  stylistTagsBox.onclick = (e) => {
    if (e.target.classList.contains('remove-tag')) {
      const idx = parseInt(e.target.dataset.idx, 10);
      editStylists.splice(idx, 1);
      renderEditLists();
    }
  };

  assistantTagsBox.onclick = (e) => {
    if (e.target.classList.contains('remove-tag')) {
      const idx = parseInt(e.target.dataset.idx, 10);
      editAssistants.splice(idx, 1);
      renderEditLists();
    }
  };

  servicesEditorList.onclick = (e) => {
    if (e.target.classList.contains('remove-svc')) {
      const idx = parseInt(e.target.dataset.idx, 10);
      editServices.splice(idx, 1);
      renderEditLists();
    }
  };

  settingsSaveBtn.onclick = async () => {
    try {
      const renameInputs = document.querySelectorAll('.seat-rename-input');
      const updatedSeats = [];
      renameInputs.forEach(input => {
        const id = input.dataset.id;
        const name = input.value.trim();
        if (id && name) {
          updatedSeats.push({ id, name });
        }
      });

      const resSettings = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stylists: editStylists,
          assistants: editAssistants,
          services: editServices
        })
      });

      if (updatedSeats.length > 0) {
        await fetch('/api/seats/batch-rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seats: updatedSeats })
        });
      }

      const data = await resSettings.json();
      if (data.success) {
        salonSettings = data.data;
        renderBookingOptions();
        settingsModal.style.display = 'none';
        alert('沙龙人员、服务项目与房间名称已全部保存！');
      } else {
        alert('保存失败: ' + data.message);
      }
    } catch (e) {
      alert('保存失败，网络异常');
    }
  };

  settingsBtn.onclick = openSettings;
  settingsCloseBtn.onclick = () => settingsModal.style.display = 'none';
  settingsCancelBtn.onclick = () => settingsModal.style.display = 'none';
  settingsCalibrateBtn.onclick = () => {
    settingsModal.style.display = 'none';
    toggleCalibrationMode();
  };
}

// 14. 单工位快速重命名功能
function setupRenameFeature() {
  const modalRenameBtn = document.getElementById('modal-rename-btn');
  const detailRenameBtn = document.getElementById('detail-rename-btn');
  const renameModal = document.getElementById('rename-modal');
  const renameCloseBtn = document.getElementById('rename-close-btn');
  const renameCancelBtn = document.getElementById('rename-cancel-btn');
  const renameForm = document.getElementById('rename-form');
  const renameSeatId = document.getElementById('rename-seat-id');
  const renameSeatArea = document.getElementById('rename-seat-area');
  const renameSeatName = document.getElementById('rename-seat-name');

  function openRenameForSeat(seat) {
    if (!seat) return;
    renameSeatId.value = seat.id;
    renameSeatArea.value = seat.area;
    renameSeatName.value = seat.name;
    renameModal.style.display = 'flex';
    setTimeout(() => renameSeatName.focus(), 100);
  }

  if (modalRenameBtn) {
    modalRenameBtn.onclick = (e) => {
      e.stopPropagation();
      const currentId = formSeatId.value;
      const seat = seats.find(s => s.id === currentId);
      if (seat) openRenameForSeat(seat);
    };
  }

  if (detailRenameBtn) {
    detailRenameBtn.onclick = (e) => {
      e.stopPropagation();
      if (currentDetailSeat) openRenameForSeat(currentDetailSeat);
    };
  }

  if (renameForm) {
    renameForm.onsubmit = async (e) => {
      e.preventDefault();
      const id = renameSeatId.value;
      const name = renameSeatName.value.trim();
      const area = renameSeatArea.value.trim();

      if (!name) return alert('请输入名称');

      try {
        const res = await fetch(`/api/seats/${id}/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, area })
        });
        const data = await res.json();
        if (data.success) {
          renameModal.style.display = 'none';
          if (modalSeatTitle) modalSeatTitle.textContent = `预约席位：${name}`;
          if (modalSeatArea) modalSeatArea.textContent = area;
          if (detailSeatName) detailSeatName.textContent = `${name} (${area})`;
        } else {
          alert('修改失败: ' + data.message);
        }
      } catch (err) {
        alert('修改失败，网络异常');
      }
    };
  }

  if (renameCloseBtn) renameCloseBtn.onclick = () => renameModal.style.display = 'none';
  if (renameCancelBtn) renameCancelBtn.onclick = () => renameModal.style.display = 'none';
}

// 15. 平面图视口自适应缩放、拖拽平移与全屏控制系统
function setupZoomAndPan() {
  const viewportMain = document.querySelector('.viewport-main');
  const canvasWrapper = document.getElementById('canvas-wrapper');
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  const zoomFitBtn = document.getElementById('zoom-fit-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const zoomText = document.getElementById('zoom-text');

  let scale = 1.0;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let startX = 0;
  let startY = 0;

  function updateTransform() {
    canvasWrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    zoomText.textContent = `${Math.round(scale * 100)}%`;
  }

  if (zoomInBtn) {
    zoomInBtn.onclick = () => {
      scale = Math.min(3.0, Number((scale + 0.15).toFixed(2)));
      updateTransform();
    };
  }

  if (zoomOutBtn) {
    zoomOutBtn.onclick = () => {
      scale = Math.max(0.6, Number((scale - 0.15).toFixed(2)));
      updateTransform();
    };
  }

  if (zoomFitBtn) {
    zoomFitBtn.onclick = () => {
      scale = 1.0;
      panX = 0;
      panY = 0;
      updateTransform();
      zoomText.textContent = '自适应';
    };
  }

  if (fullscreenBtn) {
    fullscreenBtn.onclick = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        fullscreenBtn.textContent = '⛶ 退出全屏';
      } else {
        document.exitFullscreen().catch(() => {});
        fullscreenBtn.textContent = '⛶ 全屏模式';
      }
    };
  }

  document.addEventListener('fullscreenchange', () => {
    if (fullscreenBtn) {
      fullscreenBtn.textContent = document.fullscreenElement ? '⛶ 退出全屏' : '⛶ 全屏模式';
    }
  });

  if (viewportMain) {
    viewportMain.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 0.08 : -0.08;
      scale = Math.max(0.6, Math.min(3.0, Number((scale + zoomFactor).toFixed(2))));
      updateTransform();
    }, { passive: false });

    viewportMain.addEventListener('mousedown', (e) => {
      if (isCalibrating || e.target.closest('.seat-node') || e.target.closest('.viewport-controls') || e.target.closest('.calibration-bar')) {
        return;
      }
      isPanning = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;

      const onMouseMove = (moveEvent) => {
        if (!isPanning) return;
        panX = moveEvent.clientX - startX;
        panY = moveEvent.clientY - startY;
        canvasWrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
      };

      const onMouseUp = () => {
        isPanning = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
}
