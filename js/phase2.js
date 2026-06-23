// ============================================================
// phase2.js — 游戏阶段：地图渲染 + 路径记录 + 目击输入
// ============================================================

const Phase2 = (() => {

  let _popoverTargetRoom = null;
  let _voiceRecognition = null;
  let _voiceListening = false;
  let _voiceSilenceTimer = null;
  let _voiceBufferText = '';

  function init() {
    document.getElementById('btn-clear-path').addEventListener('click', () => {
      State.clearPath();
      render();
    });

    _bindVoiceSighting();
    _initToast();
    _initMapPan();

    document.getElementById('btn-enter-meeting').addEventListener('click', () => {
      if (window.AI && typeof window.AI.clearResult === 'function') {
        window.AI.clearResult();
      } else if (typeof AI !== 'undefined' && AI && typeof AI.clearResult === 'function') {
        AI.clearResult();
      }
      const { round } = State.get();
      if (typeof umami !== 'undefined') umami.track('enter_meeting', { round });
      State.commitRound();
      App.switchPhase('meeting');
    });

    // 浮层关闭
    document.getElementById('popover-close').addEventListener('click', _closePopover);
    document.getElementById('popover-save').addEventListener('click', _savePopover);
    document.getElementById('popover-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') _savePopover();
      if (e.key === 'Escape') _closePopover();
    });

    // 点击空白关闭浮层
    document.addEventListener('click', e => {
      const popover = document.getElementById('sighting-popover');
      if (!popover.classList.contains('hidden') &&
          !popover.contains(e.target) &&
          !e.target.classList.contains('map-node')) {
        _closePopover();
      }
    });
  }

  function _bindVoiceSighting() {
    const btn = document.getElementById('btn-voice-sighting');
    if (!btn) return;

    function getSR() {
      return window.SpeechRecognition || window.webkitSpeechRecognition || null;
    }

    function parseNums(text) {
      const nums = [];
      const t = (text || '').replace(/\s+/g, '');

      // 阿拉伯数字
      (t.match(/\d+/g) || []).forEach(s => {
        const n = parseInt(s, 10);
        if (!isNaN(n)) nums.push(n);
      });

      // 常见中文数字（1-16）
      const cnMap = {
        '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
        '十': 10, '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15, '十六': 16,
      };
      Object.entries(cnMap).forEach(([k, v]) => {
        const re = new RegExp(k + '号?', 'g');
        if (re.test(t)) nums.push(v);
      });

      return [...new Set(nums)].filter(n => n > 0);
    }

    function pickRoomId(text, mapDef) {
      const t = (text || '').replace(/\s+/g, '');
      let best = null;
      let bestLen = 0;
      mapDef.nodes.forEach(node => {
        if (!node || !node.label) return;
        // 先匹配 label
        if (t.includes(node.label) && node.label.length > bestLen) {
          best = node;
          bestLen = node.label.length;
        }
        // 再匹配 aliases
        if (node.aliases) {
          node.aliases.forEach(alias => {
            if (t.includes(alias) && alias.length > bestLen) {
              best = node;
              bestLen = alias.length;
            }
          });
        }
      });
      return best ? best.id : null;
    }

    function applySighting(roomId, nums) {
      if (!roomId) {
        alert('未识别到地点，请按“号码 + 地点”说法，例如：3号 食堂');
        return;
      }
      if (!nums || nums.length === 0) {
        alert('未识别到玩家编号，请按“号码 + 地点”说法，例如：3号 食堂');
        return;
      }

      // 加入路径
      State.addToPath(roomId);

      // 合并目击
      const existing = State.get().currentSightings[roomId] || [];
      const merged = [...new Set([...(existing || []), ...nums])].sort((a, b) => a - b);
      State.setSighting(roomId, merged);
      render();
    }

    // ── 核心：启动/停止识别 ───────────────────────────────────

    function _startRecognition(onResult, onEnd) {
      const aliConfig = AI.getAliyunConfig();
      const { round, phase } = State.get();
      if (typeof umami !== 'undefined') umami.track('voice_start', { service: aliConfig.service, page: phase });
      const hotWords = _getHotWords();
      if (aliConfig.service === 'aliyun' && aliConfig.appKey && aliConfig.akId && aliConfig.akSecret) {
        AliyunASR.start(
          aliConfig,
          hotWords,
          onResult,
          onEnd,
          (err) => {
            console.error('[voice] aliyun error:', err);
            _showToast('阿里云语音连接失败，切换为内置识别');
            _startChromeRecognition(onResult, onEnd);
          }
        );
      } else {
        _startChromeRecognition(onResult, onEnd);
      }
    }

    function _startChromeRecognition(onResult, onEnd) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        _showToast('浏览器不支持语音识别');
        return;
      }
      _voiceRecognition = new SR();
      _voiceRecognition.lang = 'zh-CN';
      _voiceRecognition.continuous = true;
      _voiceRecognition.interimResults = false;
      _voiceRecognition.onresult = ev => {
        let chunk = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0].transcript;
          if (t) chunk += t;
        }
        if (chunk) onResult(chunk);
      };
      _voiceRecognition.onend = onEnd;
      _voiceRecognition.start();
    }

    function _stopRecognition() {
      const aliConfig = AI.getAliyunConfig();
      if (aliConfig.service === 'aliyun') {
        AliyunASR.stop();
      } else if (_voiceRecognition) {
        _voiceRecognition.stop();
      }
    }

    function _getHotWords() {
      const { config } = State.get();
      const mapDef = MAPS[config.map];
      const roomNames = mapDef.nodes.map(n => n.label);
      mapDef.nodes.forEach(n => { if(n.aliases) roomNames.push(...n.aliases); });
      const roleNames = ROLES.map(r => r.name);
      ROLES.forEach(r => { if(r.aliases) roleNames.push(...r.aliases); });
      return [
        ...Array.from({length: 16}, (_, i) => `${i + 1}号`),
        ...roomNames,
        ...roleNames,
        "可疑", "有问题", "怀疑", "信任", "没问题", "好人", "是鸭", "鸭子", "锁了"
      ];
    }

    function parseVoiceResult(text) {
      const t = (text || '').replace(/\s+/g, '');
      const playerMatch = t.match(/(\d+)号?/);
      const playerNum = playerMatch ? parseInt(playerMatch[1]) : null;

      const isSus = /(可疑|有问题|怀疑)/.test(t);
      const isTrust = /(信任|没问题|好人)/.test(t);
      const isDuck = /(是鸭|鸭子|锁了)/.test(t);

      const { config } = State.get();
      const mapDef = MAPS[config.map];
      const roomId = pickRoomId(t, mapDef);

      if (playerNum && (isSus || isTrust || isDuck)) {
        const trustLevel = isDuck ? 'confirmed_duck' : isSus ? 'suspicious' : 'trusted';
        State.updatePlayerTrust(playerNum, trustLevel);
        _showToast(`${playerNum}号 → 标记为「${TRUST_LABELS[trustLevel]}」`);
        _flashNode(playerNum, trustLevel);
      } else if (playerNum && roomId) {
        const node = mapDef.nodes.find(n => n.id === roomId);
        applySighting(roomId, [playerNum]);
        _showToast(`${playerNum}号 → ${node.label}`);
      } else if (playerNum) {
        _showToast(`识别到${playerNum}号，未匹配到地点或指令`);
      } else {
        _showToast('未识别到有效内容');
      }
    }

    function startListening() {
      if (_voiceListening) return;
      _voiceBufferText = '';
      _startRecognition(
        (text) => {
          _voiceBufferText += text;
          console.log('[voice-map] chunk:', text);
        },
        () => {
          _voiceListening = false;
          btn.classList.remove('listening');
          btn.textContent = '🎙 语音(空格)';
          if (_voiceBufferText) parseVoiceResult(_voiceBufferText);
          _voiceBufferText = '';
        }
      );
      _voiceListening = true;
      btn.classList.add('listening');
      btn.textContent = '🛑 正在听…';
    }

    function stopListening() {
      if (!_voiceListening) return;
      _stopRecognition();
    }

    // ── 按钮点击：切换开始/停止 ──────────────────────────────

    btn.textContent = '🎙 语音(空格)';
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      // HTTP 非 localhost 环境下麦克风权限会被浏览器拒绝
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        _showToast('语音识别需要 HTTPS 环境，请使用部署版本');
        return;
      }
      if (_voiceListening) { stopListening(); } else { startListening(); }
    });

    // ── 空格键：按住开始，松开停止 ───────────────────────────
    // 只在游戏阶段（phase-game 可见）且焦点不在输入框时响应

    document.addEventListener('keydown', e => {
      if (e.code !== 'Space') return;
      const gameSection = document.getElementById('phase-game');
      if (!gameSection || !gameSection.classList.contains('active')) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.repeat) return;
      e.preventDefault();
      startListening();
    });

    document.addEventListener('keyup', e => {
      if (e.code !== 'Space') return;
      const gameSection = document.getElementById('phase-game');
      if (!gameSection || !gameSection.classList.contains('active')) return;
      stopListening();
    });
  }

  function render() {
    const { config } = State.get();
    const mapDef = MAPS[config.map];
    document.getElementById('map-title').textContent = mapDef.name;
    _renderMap(mapDef);
    _renderSightingList();
    _renderHistoryList();
    _renderPathSummary();
  }

  // ── 地图渲染 ──────────────────────────────────────────────

  function _renderMap(mapDef) {
    const wrapper   = document.querySelector('.map-wrapper');
    const canvasEl  = document.getElementById('map-canvas');
    const svgEl     = document.getElementById('map-svg');
    const nodesEl   = document.getElementById('map-nodes');
    const { currentPath, currentSightings } = State.get();

    // 设置容器尺寸 & 地图主题 class
    const W = mapDef.width + 40;
    const H = mapDef.height + 40;
    // map-canvas 撑开 wrapper 的可滚动区域
    canvasEl.style.width  = W + 'px';
    canvasEl.style.height = H + 'px';
    nodesEl.style.width   = W + 'px';
    nodesEl.style.height  = H + 'px';
    wrapper.className = wrapper.className.replace(/\bmap-theme-\S+/g, '').trim();
    wrapper.classList.add(`map-theme-${mapDef.id}`);
    svgEl.setAttribute('width',  W);
    svgEl.setAttribute('height', H);
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const OFFSET = 20; // 边距偏移

    // 清空
    svgEl.innerHTML = '';
    nodesEl.innerHTML = '';

    // 画边
    mapDef.edges.forEach(([a, b]) => {
      const na = mapDef.nodes.find(n => n.id === a);
      const nb = mapDef.nodes.find(n => n.id === b);
      if (!na || !nb) return;

      // 判断这条边是否在当前路径中
      const idxA = currentPath.indexOf(a);
      const idxB = currentPath.indexOf(b);
      const isPathEdge = idxA >= 0 && idxB >= 0 && Math.abs(idxA - idxB) === 1;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', na.x + OFFSET);
      line.setAttribute('y1', na.y + OFFSET);
      line.setAttribute('x2', nb.x + OFFSET);
      line.setAttribute('y2', nb.y + OFFSET);
      line.setAttribute('class', isPathEdge ? 'map-edge-path' : 'map-edge');
      svgEl.appendChild(line);
    });

    // 画节点
    mapDef.nodes.forEach(node => {
      const isSelected   = currentPath.includes(node.id);
      const hasSighting  = !!currentSightings[node.id];
      const orderIdx     = currentPath.indexOf(node.id);

      const el = document.createElement('div');
      el.className = 'map-node' +
        (isSelected  ? ' selected'     : '') +
        (hasSighting ? ' has-sighting' : '');
      el.style.left = (node.x + OFFSET) + 'px';
      el.style.top  = (node.y + OFFSET) + 'px';
      el.dataset.id  = node.id;

      const labelEl = document.createElement('span');
      labelEl.className = 'node-label-text';
      labelEl.textContent = node.label;
      el.appendChild(labelEl);

      // 目击玩家色点
      const sightedNums = currentSightings[node.id] || [];
      if (sightedNums.length > 0) {
        const { players } = State.get();
        const dotsEl = document.createElement('div');
        dotsEl.className = 'node-sighting-dots';
        sightedNums.forEach(num => {
          const wrapper = document.createElement('div');
          wrapper.className = 'node-player-dot-wrapper';
          const dot = document.createElement('div');
          dot.className = 'node-player-dot';
          const color = PLAYER_COLORS[num] || '#888';
          dot.style.borderColor = color;
          dot.style.color = color;
          dot.textContent = num;
          const isDead = players[num] && players[num].alive === false;
          if (isDead) {
            dot.style.opacity = '0.5';
            const skull = document.createElement('span');
            skull.className = 'node-player-dead-icon';
            skull.textContent = '🍗';
            wrapper.appendChild(dot);
            wrapper.appendChild(skull);
          } else {
            wrapper.appendChild(dot);
          }
          dotsEl.appendChild(wrapper);
        });
        el.appendChild(dotsEl);
      }

      // 顺序徽章
      if (isSelected && orderIdx >= 0) {
        const badge = document.createElement('div');
        badge.className = 'node-order-badge';
        badge.textContent = orderIdx + 1;
        el.appendChild(badge);
      }

      el.addEventListener('click', e => {
        e.stopPropagation();
        _onNodeClick(node, el);
      });

      nodesEl.appendChild(el);
    });
  }

  function _onNodeClick(node, el) {
    const { currentPath } = State.get();

    if (currentPath.includes(node.id)) {
      // 已选中：打开目击输入浮层
      _openPopover(node, el);
    } else {
      // 未选中：加入路径
      State.addToPath(node.id);
      render();
      // 加入后立即打开浮层
      const newEl = document.querySelector(`.map-node[data-id="${node.id}"]`);
      if (newEl) _openPopover(node, newEl);
    }
  }

  // ── UI 反馈 (Toast & Flash) ─────────────────────────────

  function _initToast() {
    if (!document.getElementById('toast-container')) {
      const container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
  }

  // ── 地图右键拖动平移 ──────────────────────────────────────

  function _initMapPan() {
    const wrapper = document.querySelector('.map-wrapper');
    if (!wrapper) return;
    let panning = false, startX, startY, scrollLeft, scrollTop;

    wrapper.addEventListener('contextmenu', e => e.preventDefault());

    wrapper.addEventListener('mousedown', e => {
      if (e.button !== 2) return;
      e.preventDefault();
      panning = true;
      startX = e.clientX;
      startY = e.clientY;
      scrollLeft = wrapper.scrollLeft;
      scrollTop = wrapper.scrollTop;
      wrapper.classList.add('panning');
    });

    window.addEventListener('mousemove', e => {
      if (!panning) return;
      wrapper.scrollLeft = scrollLeft - (e.clientX - startX);
      wrapper.scrollTop  = scrollTop  - (e.clientY - startY);
    });

    window.addEventListener('mouseup', () => {
      if (!panning) return;
      panning = false;
      wrapper.classList.remove('panning');
    });
  }

  function _showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  function _flashNode(playerNum, trustType) {
    // 这里简单实现：找到所有包含该玩家目击的节点闪烁，或者如果玩家在当前路径最后一个点目击，闪烁该点
    // 需求描述为“对应玩家编号的节点旁”，地图上目前节点是地点。
    // 我们让地图上所有标记了该玩家目击的节点闪烁一下。
    const nodes = document.querySelectorAll('.map-node');
    nodes.forEach(nodeEl => {
      const roomId = nodeEl.dataset.id;
      const sightings = State.get().currentSightings[roomId] || [];
      if (sightings.includes(Number(playerNum))) {
        nodeEl.classList.add('trust-flash', `flash-${trustType}`);
        setTimeout(() => {
          nodeEl.classList.remove('trust-flash', `flash-${trustType}`);
        }, 600);
      }
    });
  }

  // ── 目击浮层 ──────────────────────────────────────────────

  function _openPopover(node, anchorEl) {
    _popoverTargetRoom = node.id;
    const popover = document.getElementById('sighting-popover');
    document.getElementById('popover-room-name').textContent = node.label;

    // 填入已有值
    const existing = State.get().currentSightings[node.id] || [];
    document.getElementById('popover-input').value = existing.join(', ');

    // 定位
    const rect = anchorEl.getBoundingClientRect();
    popover.style.left = Math.min(rect.right + 8, window.innerWidth - 260) + 'px';
    popover.style.top  = Math.max(rect.top - 10, 10) + 'px';

    popover.classList.remove('hidden');
    document.getElementById('popover-input').focus();
  }

  function _closePopover() {
    document.getElementById('sighting-popover').classList.add('hidden');
    _popoverTargetRoom = null;
  }

  function _savePopover() {
    if (!_popoverTargetRoom) return;
    const raw = document.getElementById('popover-input').value;
    const nums = raw.split(/[,，\s]+/)
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n > 0);
    State.setSighting(_popoverTargetRoom, nums);
    _closePopover();
    render();
  }

  // ── 目击列表拖拽状态 ──────────────────────────────────────

  let _dragSrcIndex = null;

  function _onDragStart(e) {
    _dragSrcIndex = parseInt(this.dataset.index);
    this.classList.add('sighting-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.roomId);
  }

  function _onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function _onDragEnter(e) {
    e.preventDefault();
    this.classList.add('sighting-drag-over');
  }

  function _onDragLeave() {
    this.classList.remove('sighting-drag-over');
  }

  function _onDrop(e) {
    e.preventDefault();
    this.classList.remove('sighting-drag-over');
    const fromIndex = _dragSrcIndex;
    const toIndex = parseInt(this.dataset.index);
    if (fromIndex !== null && fromIndex !== toIndex && !isNaN(fromIndex) && !isNaN(toIndex)) {
      State.reorderPath(fromIndex, toIndex);
      render();
    }
    _dragSrcIndex = null;
  }

  function _onDragEnd() {
    this.classList.remove('sighting-dragging');
    document.querySelectorAll('.sighting-item').forEach(el => el.classList.remove('sighting-drag-over'));
    _dragSrcIndex = null;
  }

  // ── 右侧面板 ──────────────────────────────────────────────

  function _renderSightingList() {
    const { currentPath, currentSightings, config } = State.get();
    const mapDef = MAPS[config.map];
    const container = document.getElementById('sighting-list');

    if (currentPath.length === 0) {
      container.innerHTML = '<p class="hint-text">点击地图节点后，可在此输入遇到的玩家编号</p>';
      return;
    }

    container.innerHTML = '';
    currentPath.forEach((roomId, index) => {
      const node = mapDef.nodes.find(n => n.id === roomId);
      const nums = currentSightings[roomId] || [];
      const seq = index + 1;

      const item = document.createElement('div');
      item.className = 'sighting-item';
      item.draggable = true;
      item.dataset.roomId = roomId;
      item.dataset.index = index;

      item.innerHTML =
        `<div class="sighting-item-row">
          <span class="sighting-seq">${seq}</span>
          <div class="sighting-info">
            <div class="sighting-room">${node ? node.label : roomId}</div>
            <div class="sighting-nums">${nums.length > 0 ? '遇到：' + nums.map(n => n + '号').join('、') : '（无目击）'}</div>
          </div>
          <div class="sighting-actions">
            <button class="sighting-action-btn sighting-modify-btn" title="修改目击">✎</button>
            <button class="sighting-action-btn sighting-delete-btn" title="删除此条">✕</button>
          </div>
        </div>`;

      // 修改按钮
      item.querySelector('.sighting-modify-btn').addEventListener('click', e => {
        e.stopPropagation();
        const el = document.querySelector(`.map-node[data-id="${roomId}"]`);
        if (el) _openPopover(node, el);
      });

      // 删除按钮
      item.querySelector('.sighting-delete-btn').addEventListener('click', e => {
        e.stopPropagation();
        State.removeFromPath(roomId);
        render();
      });

      // 点击条目主体打开浮层
      item.addEventListener('click', e => {
        if (e.target.closest('.sighting-action-btn')) return;
        const el = document.querySelector(`.map-node[data-id="${roomId}"]`);
        if (el) _openPopover(node, el);
      });

      // 拖拽排序
      item.addEventListener('dragstart', _onDragStart);
      item.addEventListener('dragover',  _onDragOver);
      item.addEventListener('dragenter', _onDragEnter);
      item.addEventListener('dragleave', _onDragLeave);
      item.addEventListener('drop',      _onDrop);
      item.addEventListener('dragend',   _onDragEnd);

      container.appendChild(item);
    });
  }

  function _renderHistoryList() {
    const { rounds, config } = State.get();
    const mapDef = MAPS[config.map];
    const container = document.getElementById('history-list');
    const roundKeys = Object.keys(rounds).sort((a, b) => Number(a) - Number(b));

    if (roundKeys.length === 0) {
      container.innerHTML = '<p class="hint-text">暂无历史记录</p>';
      return;
    }

    container.innerHTML = '';
    roundKeys.forEach(r => {
      const data = rounds[r];
      const pathLabels = data.path.map(id => {
        const node = mapDef.nodes.find(n => n.id === id);
        return node ? node.label : id;
      });
      // 收集目击摘要
      const sightSummary = Object.entries(data.sightings || {})
        .filter(([, nums]) => nums.length > 0)
        .map(([roomId, nums]) => {
          const node = mapDef.nodes.find(n => n.id === roomId);
          return `${node ? node.label : roomId}遇${nums.map(n => n + '号').join('/')}`;
        }).join('；');

      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `<strong>第${r}轮：</strong>${pathLabels.join(' → ')}${sightSummary ? '<br><span style="color:var(--trust-suspicious);font-size:0.75rem">👁 ' + sightSummary + '</span>' : ''}`;
      container.appendChild(item);
    });
  }

  function _renderPathSummary() {
    const { currentPath, currentSightings, config } = State.get();
    const mapDef = MAPS[config.map];
    const el = document.getElementById('path-summary');

    if (currentPath.length === 0) {
      el.textContent = '（尚未选择房间）';
      return;
    }

    const parts = currentPath.map(id => {
      const node = mapDef.nodes.find(n => n.id === id);
      const label = node ? node.label : id;
      const nums  = currentSightings[id] || [];
      return nums.length > 0 ? `${label}（遇到：${nums.map(n => n + '号').join('、')}）` : label;
    });
    el.textContent = parts.join(' → ');
  }

  return { init, render };
})();
