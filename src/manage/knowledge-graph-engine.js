/**
 * 知识图谱 - 力导向布局引擎（电影感升级版）
 * 使用 Canvas 进行高性能渲染，内置力导向算法
 * 视觉风格：深空星尘 + 多彩光晕 + 流光粒子
 */

// roundRect polyfill（兼容旧版 Electron/Chromium）
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
    const r = typeof radii === 'number' ? radii : (radii?.[0] || 0);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
  };
}

class KnowledgeGraphEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = [];
    this.edges = [];
    this.selectedNode = null;
    this.selectedEdge = null;
    this.hoveredNode = null;
    this.hoveredEdge = null;
    this.dragNode = null;
    this.dragOffset = { x: 0, y: 0 };

    // 视图变换
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };

    // 力导向参数
    this.simulation = {
      running: false,
      alpha: 1,
      alphaDecay: 0.028,
      alphaMin: 0.001,
      velocityDecay: 0.35,
      repulsionForce: 600,
      attractionForce: 0.008,
      centerForce: 0.008,
      linkDistance: 120,
      minDistance: 40,
    };

    // 节点类型配置
    this.nodeTypes = {
      category: { radius: 22, color: '#2fe08d', borderColor: '#22c55e', label: '分类' },
      document: { radius: 14, color: '#4da3ff', borderColor: '#3b82f6', label: '文档' },
      note:     { radius: 13, color: '#ffae57', borderColor: '#d97706', label: '笔记' },
      image:    { radius: 13, color: '#d26cff', borderColor: '#a855f7', label: '图片' },
      concept:  { radius: 18, color: '#fb7185', borderColor: '#e11d48', label: '概念' },
      custom:   { radius: 16, color: '#5ab8ff', borderColor: '#0284c7', label: '自定义' },
    };

    // 边类型
    this.edgeTypes = {
      'belongs-to': { color: '#2fe08d', label: '归属', dash: [] },
      'related':    { color: '#4da3ff', label: '相关', dash: [6, 4] },
      'references': { color: '#ffae57', label: '引用', dash: [4, 4] },
      'derived':    { color: '#d26cff', label: '派生', dash: [8, 4] },
      'custom':     { color: '#8fb6ff', label: '自定义', dash: [] },
    };

    this._animFrameId = null;
    this._nodeIdCounter = 1;
    this._edgeIdCounter = 1;

    // 动画时间
    this._time = 0;
    this._lastFrameTime = 0;

    // 背景星尘粒子
    this._bgStars = [];
    this._bgLinks = [];
    this._initBgParticles();

    this._resizeCanvas();
    this._bindEvents();

    // 持续渲染以支持动画（低频）
    this._startAnimLoop();
  }

  // ========== 背景粒子初始化 ==========
  _initBgParticles() {
    const count = 80;
    for (let i = 0; i < count; i++) {
      this._bgStars.push({
        x: (Math.random() - 0.5) * 4000,
        y: (Math.random() - 0.5) * 3000,
        r: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.3 + 0.05,
        twinkleSpeed: Math.random() * 2 + 1,
        twinkleOffset: Math.random() * Math.PI * 2,
      });
    }
    // 星尘间连线
    for (let i = 0; i < 50; i++) {
      const a = Math.floor(Math.random() * count);
      const b = Math.floor(Math.random() * count);
      if (a !== b) {
        this._bgLinks.push({ a, b, alpha: Math.random() * 0.06 + 0.02 });
      }
    }
  }

  // ========== 持续动画循环 ==========
  _startAnimLoop() {
    const loop = () => {
      this._renderPending = false;
      this._render();
      this._animLoopId = requestAnimationFrame(loop);
    };
    // 降频到约30fps以减少CPU占用
    this._animLoopId = requestAnimationFrame(loop);
  }

  // ========== 画布尺寸 ==========
  _resizeCanvas() {
    const container = this.canvas.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const toolbarHeight = 48;
    const dpr = window.devicePixelRatio || 1;
    const canvasW = rect.width;
    const canvasH = Math.max(rect.height - toolbarHeight, 200);
    this.canvas.width = canvasW * dpr;
    this.canvas.height = canvasH * dpr;
    this.canvas.style.width = canvasW + 'px';
    this.canvas.style.height = canvasH + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = canvasW;
    this.height = canvasH;
  }

  // ========== 坐标转换 ==========
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.width / 2) / this.camera.zoom - this.camera.x,
      y: (sy - this.height / 2) / this.camera.zoom - this.camera.y,
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: (wx + this.camera.x) * this.camera.zoom + this.width / 2,
      y: (wy + this.camera.y) * this.camera.zoom + this.height / 2,
    };
  }

  // ========== 节点/边管理 ==========
  addNode(data) {
    const type = this.nodeTypes[data.type] || this.nodeTypes.custom;
    const node = {
      id: this._nodeIdCounter++,
      label: data.label || '新节点',
      type: data.type || 'custom',
      description: data.description || '',
      color: data.color || type.color,
      radius: type.radius,
      x: data.x ?? (Math.random() - 0.5) * 300,
      y: data.y ?? (Math.random() - 0.5) * 300,
      vx: 0, vy: 0,
      fx: null, fy: null,
      metadata: data.metadata || {},
    };
    this.nodes.push(node);
    this._hideEmptyState();
    return node;
  }

  removeNode(nodeId) {
    this.edges = this.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    this.nodes = this.nodes.filter(n => n.id !== nodeId);
    if (this.selectedNode?.id === nodeId) this.selectedNode = null;
    if (this.hoveredNode?.id === nodeId) this.hoveredNode = null;
    if (this.nodes.length === 0) this._showEmptyState();
  }

  addEdge(data) {
    if (data.source === data.target) return null;
    const exists = this.edges.find(
      e => (e.source === data.source && e.target === data.target) ||
           (e.source === data.target && e.target === data.source)
    );
    if (exists) return null;

    const edgeType = this.edgeTypes[data.type] || this.edgeTypes.custom;
    const edge = {
      id: this._edgeIdCounter++,
      source: data.source,
      target: data.target,
      type: data.type || 'related',
      label: data.label || edgeType.label,
      color: data.color || edgeType.color,
      dash: edgeType.dash,
    };
    this.edges.push(edge);
    return edge;
  }

  removeEdge(edgeId) {
    this.edges = this.edges.filter(e => e.id !== edgeId);
    if (this.selectedEdge?.id === edgeId) this.selectedEdge = null;
  }

  getNodeById(id) {
    return this.nodes.find(n => n.id === id);
  }

  // ========== 力导向模拟 ==========
  startSimulation(softRestart = false) {
    if (softRestart && this.simulation.running) {
      this.simulation.alpha = Math.max(this.simulation.alpha, 0.3);
      return;
    }
    this.simulation.running = true;
    this.simulation.alpha = softRestart ? 0.3 : 0.8;
    for (const node of this.nodes) {
      node.vx = 0;
      node.vy = 0;
    }
    this._simulationLoop();
  }

  stopSimulation() {
    this.simulation.running = false;
  }

  _simulationLoop() {
    if (!this.simulation.running) return;
    if (this.simulation.alpha < this.simulation.alphaMin) {
      this.simulation.running = false;
      return;
    }
    this._applyForces();
    this.simulation.alpha *= (1 - this.simulation.alphaDecay);
    this._animFrameId = requestAnimationFrame(() => this._simulationLoop());
  }

  _applyForces() {
    const nodes = this.nodes;
    const edges = this.edges;
    const alpha = this.simulation.alpha;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) {
          dx = (Math.random() - 0.5) * 2;
          dy = (Math.random() - 0.5) * 2;
          dist = Math.sqrt(dx * dx + dy * dy);
        }
        const combinedRadius = a.radius + b.radius + 10;
        let force;
        if (dist < combinedRadius) {
          force = this.simulation.repulsionForce * alpha * 2 / (dist * dist);
        } else {
          force = this.simulation.repulsionForce * alpha / (dist * dist);
        }
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }

    for (const edge of edges) {
      const a = this.getNodeById(edge.source);
      const b = this.getNodeById(edge.target);
      if (!a || !b) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - this.simulation.linkDistance) * this.simulation.attractionForce * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    for (const node of nodes) {
      node.vx -= node.x * this.simulation.centerForce * alpha;
      node.vy -= node.y * this.simulation.centerForce * alpha;
    }

    const maxVelocity = 30;
    for (const node of nodes) {
      if (node.fx !== null) { node.x = node.fx; node.vx = 0; }
      else {
        node.vx *= this.simulation.velocityDecay;
        node.vx = Math.max(-maxVelocity, Math.min(maxVelocity, node.vx));
        node.x += node.vx;
      }
      if (node.fy !== null) { node.y = node.fy; node.vy = 0; }
      else {
        node.vy *= this.simulation.velocityDecay;
        node.vy = Math.max(-maxVelocity, Math.min(maxVelocity, node.vy));
        node.y += node.vy;
      }
    }
  }

  // ========== 渲染 ==========
  _requestRender() {
    // 动画循环已在运行，不需要额外请求
  }

  _render() {
    const ctx = this.ctx;
    const w = this.width, h = this.height;
    if (!w || !h) return;

    const now = performance.now();
    this._time = now * 0.001;

    // ---- 背景层 ----
    this._drawBackground(ctx, w, h);
    this._drawBgStars(ctx, w, h);
    this._drawGrid(ctx, w, h);
    this._drawScanline(ctx, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(this.camera.x, this.camera.y);

    // 关联高亮光路
    this._drawConnectionGlow(ctx);

    // 边
    for (const edge of this.edges) {
      this._drawEdge(ctx, edge);
    }

    // 节点阴影层
    for (const node of this.nodes) {
      this._drawNodeShadow(ctx, node);
    }
    // 节点主体层
    for (const node of this.nodes) {
      this._drawNode(ctx, node);
    }

    ctx.restore();
  }

  // ======= 深空背景 =======
  _drawBackground(ctx, w, h) {
    // 多层径向渐变（深蓝-紫-黑）
    const bg1 = ctx.createRadialGradient(w * 0.15, h * 0.2, 0, w * 0.15, h * 0.2, w * 0.5);
    bg1.addColorStop(0, 'rgba(58, 102, 255, 0.08)');
    bg1.addColorStop(1, 'rgba(0, 0, 0, 0)');

    const bg2 = ctx.createRadialGradient(w * 0.8, h * 0.18, 0, w * 0.8, h * 0.18, w * 0.45);
    bg2.addColorStop(0, 'rgba(124, 82, 255, 0.06)');
    bg2.addColorStop(1, 'rgba(0, 0, 0, 0)');

    const bg3 = ctx.createRadialGradient(w * 0.68, h * 0.72, 0, w * 0.68, h * 0.72, w * 0.4);
    bg3.addColorStop(0, 'rgba(0, 219, 146, 0.04)');
    bg3.addColorStop(1, 'rgba(0, 0, 0, 0)');

    // 基底渐变
    const bgBase = ctx.createLinearGradient(0, 0, w, h);
    bgBase.addColorStop(0, '#0b0f19');
    bgBase.addColorStop(0.46, '#10182a');
    bgBase.addColorStop(1, '#18233a');

    ctx.fillStyle = bgBase;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = bg1;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = bg2;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = bg3;
    ctx.fillRect(0, 0, w, h);
  }

  // ======= 星尘粒子 =======
  _drawBgStars(ctx, w, h) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.camera.zoom * 0.15, this.camera.zoom * 0.15); // 星尘几乎不跟随缩放

    // 星尘连线
    for (const link of this._bgLinks) {
      const sa = this._bgStars[link.a];
      const sb = this._bgStars[link.b];
      ctx.strokeStyle = `rgba(125, 155, 255, ${link.alpha})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
      ctx.stroke();
    }

    // 星尘点
    for (const star of this._bgStars) {
      const twinkle = Math.sin(this._time * star.twinkleSpeed + star.twinkleOffset) * 0.5 + 0.5;
      const alpha = star.alpha * (0.5 + twinkle * 0.5);
      ctx.fillStyle = `rgba(150, 180, 255, ${alpha})`;
      ctx.shadowBlur = 6;
      ctx.shadowColor = `rgba(150, 180, 255, ${alpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ======= 网格 =======
  _drawGrid(ctx, w, h) {
    const gridSize = 40 * this.camera.zoom;
    const offsetX = (this.camera.x * this.camera.zoom + w / 2) % gridSize;
    const offsetY = (this.camera.y * this.camera.zoom + h / 2) % gridSize;

    ctx.strokeStyle = 'rgba(90, 140, 255, 0.02)';
    ctx.lineWidth = 1;
    for (let x = offsetX; x < w; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = offsetY; y < h; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const lgSize = gridSize * 5;
    const lgOX = (this.camera.x * this.camera.zoom + w / 2) % lgSize;
    const lgOY = (this.camera.y * this.camera.zoom + h / 2) % lgSize;
    ctx.strokeStyle = 'rgba(90, 140, 255, 0.04)';
    for (let x = lgOX; x < w; x += lgSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = lgOY; y < h; y += lgSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // 交叉点微光
    ctx.fillStyle = 'rgba(130, 170, 255, 0.04)';
    for (let x = lgOX; x < w; x += lgSize) {
      for (let y = lgOY; y < h; y += lgSize) {
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ======= 扫描线叠加效果 =======
  _drawScanline(ctx, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.03;
    const lineHeight = 3;
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    for (let y = 0; y < h; y += lineHeight * 2) {
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
  }

  // ======= 关联高亮光路 =======
  _drawConnectionGlow(ctx) {
    const activeNode = this.hoveredNode || this.selectedNode;
    if (!activeNode) return;

    const connEdges = this.edges.filter(e => e.source === activeNode.id || e.target === activeNode.id);
    if (connEdges.length === 0) return;

    ctx.save();
    for (const edge of connEdges) {
      const a = this.getNodeById(edge.source);
      const b = this.getNodeById(edge.target);
      if (!a || !b) continue;
      const cpX = (a.x + b.x) / 2 + (b.y - a.y) * 0.12;
      const cpY = (a.y + b.y) / 2 - (b.x - a.x) * 0.12;

      // 宽光路
      ctx.strokeStyle = edge.color;
      ctx.globalAlpha = 0.06;
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(cpX, cpY, b.x, b.y);
      ctx.stroke();

      // 内层光路
      ctx.globalAlpha = 0.1;
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    ctx.restore();
  }

  // ======= 边渲染 =======
  _drawEdge(ctx, edge) {
    const a = this.getNodeById(edge.source);
    const b = this.getNodeById(edge.target);
    if (!a || !b) return;

    const isSelected = this.selectedEdge?.id === edge.id;
    const isHovered = this.hoveredEdge?.id === edge.id;
    const activeNode = this.hoveredNode || this.selectedNode;
    const isConnected = activeNode && (edge.source === activeNode.id || edge.target === activeNode.id);
    const alpha = isSelected || isHovered ? 1 : (isConnected ? 0.85 : 0.3);

    ctx.save();

    const dx = b.x - a.x, dy = b.y - a.y;
    const curvature = 0.08;
    const cpX = (a.x + b.x) / 2 + dy * curvature;
    const cpY = (a.y + b.y) / 2 - dx * curvature;

    // 边发光
    if (isSelected || isHovered) {
      ctx.strokeStyle = edge.color;
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 20;
      ctx.shadowColor = edge.color;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(cpX, cpY, b.x, b.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 渐变主连线
    const lineGrad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    lineGrad.addColorStop(0, this._colorWithAlpha(a.color || edge.color, alpha));
    lineGrad.addColorStop(1, this._colorWithAlpha(b.color || edge.color, alpha));
    ctx.strokeStyle = lineGrad;
    ctx.globalAlpha = 1;
    ctx.lineWidth = isSelected ? 2.5 : (isHovered ? 2 : 1.3);
    ctx.lineCap = 'round';
    if (edge.dash?.length) ctx.setLineDash(edge.dash);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cpX, cpY, b.x, b.y);
    ctx.stroke();

    // 流光粒子
    if (isConnected || isSelected || isHovered || alpha > 0.2) {
      this._drawEdgeParticle(ctx, a, b, cpX, cpY, edge.color, Math.max(alpha, 0.4));
    }

    // 箭头
    ctx.setLineDash([]);
    const bRadius = (this.nodeTypes[b.type]?.radius || 14) + 4;
    const t = 0.95;
    const tAngleX = 2 * (1 - t) * (cpX - a.x) + 2 * t * (b.x - cpX);
    const tAngleY = 2 * (1 - t) * (cpY - a.y) + 2 * t * (b.y - cpY);
    const angle = Math.atan2(tAngleY, tAngleX);
    const arrowX = b.x - Math.cos(angle) * bRadius;
    const arrowY = b.y - Math.sin(angle) * bRadius;
    const arrowSize = isSelected ? 9 : 7;

    ctx.fillStyle = edge.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(
      arrowX - arrowSize * Math.cos(angle - Math.PI / 7),
      arrowY - arrowSize * Math.sin(angle - Math.PI / 7)
    );
    ctx.lineTo(
      arrowX - arrowSize * 0.4 * Math.cos(angle),
      arrowY - arrowSize * 0.4 * Math.sin(angle)
    );
    ctx.lineTo(
      arrowX - arrowSize * Math.cos(angle + Math.PI / 7),
      arrowY - arrowSize * Math.sin(angle + Math.PI / 7)
    );
    ctx.closePath();
    ctx.fill();

    // 边标签
    if (edge.label && (isHovered || isSelected || isConnected)) {
      const mx = 0.25 * a.x + 0.5 * cpX + 0.25 * b.x;
      const my = 0.25 * a.y + 0.5 * cpY + 0.25 * b.y;
      ctx.font = '10px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(edge.label).width + 14;
      const tlh = 20;
      ctx.globalAlpha = (isHovered || isSelected) ? 0.95 : 0.7;
      ctx.fillStyle = 'rgba(11, 15, 25, 0.92)';
      ctx.beginPath();
      ctx.roundRect(mx - tw / 2, my - 10, tw, tlh, 6);
      ctx.fill();
      ctx.strokeStyle = this._colorWithAlpha(edge.color, 0.25);
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.globalAlpha = (isHovered || isSelected) ? 1 : 0.8;
      ctx.fillStyle = edge.color;
      ctx.fillText(edge.label, mx, my);
    }

    ctx.restore();
  }

  // ======= 流光粒子 =======
  _drawEdgeParticle(ctx, a, b, cpX, cpY, color, alpha) {
    // 双粒子，错开时间
    for (let offset = 0; offset < 2; offset++) {
      const t = ((this._time * 0.4 + offset * 0.5) % 1);
      const invT = 1 - t;
      const px = invT * invT * a.x + 2 * invT * t * cpX + t * t * b.x;
      const py = invT * invT * a.y + 2 * invT * t * cpY + t * t * b.y;

      ctx.save();
      ctx.globalAlpha = alpha * (0.5 + offset * 0.15);
      const pgr = ctx.createRadialGradient(px, py, 0, px, py, 5 + offset * 2);
      pgr.addColorStop(0, color);
      pgr.addColorStop(0.5, this._colorWithAlpha(color, 0.3));
      pgr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pgr;
      ctx.beginPath();
      ctx.arc(px, py, 5 + offset * 2, 0, Math.PI * 2);
      ctx.fill();

      // 亮心
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(px, py, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ======= 节点阴影层 =======
  _drawNodeShadow(ctx, node) {
    const isSelected = this.selectedNode?.id === node.id;
    const isHovered = this.hoveredNode?.id === node.id;
    const activeNode = this.hoveredNode || this.selectedNode;
    const isConnected = activeNode && this.edges.some(
      e => (e.source === activeNode.id && e.target === node.id) ||
           (e.target === activeNode.id && e.source === node.id)
    );
    const r = node.radius;

    ctx.save();

    // 底部投影
    const shadowGrad = ctx.createRadialGradient(node.x, node.y + r * 0.3, r * 0.2, node.x, node.y + r * 0.3, r * 2.5);
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.arc(node.x, node.y + r * 0.3, r * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 常驻光晕（更明显的同色辐射）
    const ambientSize = r + 10;
    const ambientGrad = ctx.createRadialGradient(node.x, node.y, r * 0.3, node.x, node.y, ambientSize);
    ambientGrad.addColorStop(0, this._colorWithAlpha(node.color, 0.12));
    ambientGrad.addColorStop(0.6, this._colorWithAlpha(node.color, 0.04));
    ambientGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ambientGrad;
    ctx.beginPath();
    ctx.arc(node.x, node.y, ambientSize, 0, Math.PI * 2);
    ctx.fill();

    // 选中/悬浮时的脉冲光晕
    if (isSelected || isHovered) {
      const breathe = Math.sin(this._time * 3) * 0.15 + 0.85;
      const glowSize = r + 18 + Math.sin(this._time * 2.5) * 4;
      const glowGrad = ctx.createRadialGradient(node.x, node.y, r * 0.4, node.x, node.y, glowSize);
      glowGrad.addColorStop(0, this._colorWithAlpha(node.color, 0.4 * breathe));
      glowGrad.addColorStop(0.4, this._colorWithAlpha(node.color, 0.15 * breathe));
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(node.x, node.y, glowSize, 0, Math.PI * 2);
      ctx.fill();
    } else if (isConnected) {
      const glowGrad = ctx.createRadialGradient(node.x, node.y, r * 0.4, node.x, node.y, r + 12);
      glowGrad.addColorStop(0, this._colorWithAlpha(node.color, 0.25));
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 12, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // ======= 节点主体 =======
  _drawNode(ctx, node) {
    const isSelected = this.selectedNode?.id === node.id;
    const isHovered = this.hoveredNode?.id === node.id;
    const activeNode = this.hoveredNode || this.selectedNode;
    const isConnected = activeNode && activeNode.id !== node.id && this.edges.some(
      e => (e.source === activeNode.id && e.target === node.id) ||
           (e.target === activeNode.id && e.source === node.id)
    );
    const isDimmed = activeNode && !isSelected && !isHovered && !isConnected;
    const r = node.radius;

    ctx.save();

    if (isDimmed) {
      ctx.globalAlpha = 0.18;
    }

    // 选中脉冲环
    if (isSelected) {
      const pulseR = r + 6 + Math.sin(this._time * 4) * 2.5;
      ctx.strokeStyle = node.color;
      ctx.globalAlpha = isDimmed ? 0.08 : (0.4 + Math.sin(this._time * 4) * 0.15);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(node.x, node.y, pulseR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = isDimmed ? 0.18 : 1;
    }

    // 外层半透明环（柔和过渡）
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = this._colorWithAlpha(node.color, 0.05);
    ctx.fill();

    // 节点主体（3D球体渐变 — 更鲜艳）
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(
      node.x - r * 0.35, node.y - r * 0.35, r * 0.05,
      node.x + r * 0.15, node.y + r * 0.15, r
    );
    grad.addColorStop(0, this._lightenColor(node.color, 80));
    grad.addColorStop(0.2, this._lightenColor(node.color, 40));
    grad.addColorStop(0.55, node.color);
    grad.addColorStop(1, this._darkenColor(node.color, 50));
    ctx.fillStyle = grad;
    ctx.fill();

    // 顶部月牙高光
    ctx.beginPath();
    ctx.ellipse(node.x - r * 0.1, node.y - r * 0.28, r * 0.5, r * 0.36, -0.3, 0, Math.PI * 2);
    const hlGrad = ctx.createRadialGradient(
      node.x - r * 0.2, node.y - r * 0.38, 0,
      node.x - r * 0.1, node.y - r * 0.28, r * 0.5
    );
    hlGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
    hlGrad.addColorStop(0.35, 'rgba(255,255,255,0.1)');
    hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hlGrad;
    ctx.fill();

    // 底部环境光
    ctx.beginPath();
    ctx.ellipse(node.x, node.y + r * 0.5, r * 0.45, r * 0.15, 0, 0, Math.PI * 2);
    const btmGrad = ctx.createRadialGradient(
      node.x, node.y + r * 0.5, 0,
      node.x, node.y + r * 0.5, r * 0.45
    );
    btmGrad.addColorStop(0, 'rgba(255,255,255,0.07)');
    btmGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = btmGrad;
    ctx.fill();

    // 边框
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    if (isSelected) {
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = node.color;
    } else if (isHovered) {
      ctx.strokeStyle = this._colorWithAlpha(this._lightenColor(node.color, 50), 0.7);
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 8;
      ctx.shadowColor = node.color;
    } else {
      ctx.strokeStyle = this._colorWithAlpha(this._lightenColor(node.color, 30), 0.2);
      ctx.lineWidth = 0.5;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 节点标签
    const labelText = node.label.length > 14 ? node.label.slice(0, 14) + '…' : node.label;
    ctx.font = `${isHovered || isSelected ? 11 : 10}px -apple-system, "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const lw = ctx.measureText(labelText).width + 16;
    const lh = 20;
    const lx = node.x - lw / 2;
    const ly = node.y + r + 7;

    // 标签背景
    ctx.fillStyle = 'rgba(11, 15, 25, 0.88)';
    ctx.beginPath();
    ctx.roundRect(lx, ly, lw, lh, 6);
    ctx.fill();
    ctx.strokeStyle = this._colorWithAlpha(node.color, 0.12);
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // 左侧色条
    ctx.fillStyle = node.color;
    ctx.globalAlpha = isDimmed ? 0.1 : 0.8;
    ctx.beginPath();
    ctx.roundRect(lx, ly, 2.5, lh, [6, 0, 0, 6]);
    ctx.fill();
    ctx.globalAlpha = isDimmed ? 0.18 : 1;

    // 文字
    ctx.fillStyle = isHovered || isSelected ? '#fff' : 'rgba(210, 220, 240, 0.88)';
    ctx.fillText(labelText, node.x + 1.5, ly + 4.5);

    ctx.restore();
  }

  // ========== 颜色工具 ==========
  _lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + percent);
    const g = Math.min(255, ((num >> 8) & 0x00FF) + percent);
    const b = Math.min(255, (num & 0x0000FF) + percent);
    return `rgb(${r},${g},${b})`;
  }

  _darkenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (num >> 16) - percent);
    const g = Math.max(0, ((num >> 8) & 0x00FF) - percent);
    const b = Math.max(0, (num & 0x0000FF) - percent);
    return `rgb(${r},${g},${b})`;
  }

  _colorWithAlpha(colorStr, alpha) {
    if (colorStr.startsWith('#')) {
      const num = parseInt(colorStr.replace('#', ''), 16);
      const r = (num >> 16) & 0xFF;
      const g = (num >> 8) & 0xFF;
      const b = num & 0xFF;
      return `rgba(${r},${g},${b},${alpha})`;
    }
    if (colorStr.startsWith('rgb(')) {
      return colorStr.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
    }
    return colorStr;
  }

  // ========== 碰撞检测 ==========
  getNodeAt(sx, sy) {
    const { x, y } = this.screenToWorld(sx, sy);
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const dx = n.x - x, dy = n.y - y;
      if (dx * dx + dy * dy <= (n.radius + 4) * (n.radius + 4)) return n;
    }
    return null;
  }

  getEdgeAt(sx, sy) {
    const { x, y } = this.screenToWorld(sx, sy);
    const threshold = 8 / this.camera.zoom;
    for (const edge of this.edges) {
      const a = this.getNodeById(edge.source);
      const b = this.getNodeById(edge.target);
      if (!a || !b) continue;
      const dist = this._pointToSegmentDist(x, y, a.x, a.y, b.x, b.y);
      if (dist < threshold) return edge;
    }
    return null;
  }

  _pointToSegmentDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  // ========== 视图控制 ==========
  setZoom(zoom) {
    this.camera.zoom = Math.max(0.1, Math.min(3, zoom));
  }

  fitView() {
    if (this.nodes.length === 0) {
      this.camera = { x: 0, y: 0, zoom: 1 };
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of this.nodes) {
      minX = Math.min(minX, n.x - n.radius);
      maxX = Math.max(maxX, n.x + n.radius);
      minY = Math.min(minY, n.y - n.radius);
      maxY = Math.max(maxY, n.y + n.radius);
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const bw = maxX - minX + 100, bh = maxY - minY + 100;
    const zoom = Math.min(this.width / bw, this.height / bh, 2);
    this.camera.x = -cx;
    this.camera.y = -cy;
    this.camera.zoom = zoom;
  }

  // ========== 事件绑定 ==========
  _bindEvents() {
    const canvas = this.canvas;

    canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
    canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    canvas.addEventListener('dblclick', (e) => this._onDblClick(e));
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._onContextMenu(e);
    });

    window.addEventListener('resize', () => {
      this._resizeCanvas();
    });
  }

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _onMouseDown(e) {
    const pos = this._getCanvasPos(e);
    const node = this.getNodeAt(pos.x, pos.y);

    if (e.button === 0) {
      if (this._edgeMode && node) {
        this._handleEdgeModeClick(node);
        return;
      }

      if (node) {
        this.dragNode = node;
        const wp = this.screenToWorld(pos.x, pos.y);
        this.dragOffset = { x: node.x - wp.x, y: node.y - wp.y };
        node.fx = node.x;
        node.fy = node.y;
        this.selectedNode = node;
        this.selectedEdge = null;
        this._onNodeSelect?.(node);
      } else {
        const edge = this.getEdgeAt(pos.x, pos.y);
        if (edge) {
          this.selectedEdge = edge;
          this.selectedNode = null;
          this._onEdgeSelect?.(edge);
        } else {
          this.selectedNode = null;
          this.selectedEdge = null;
          this.isPanning = true;
          this.panStart = { x: pos.x, y: pos.y };
          this._onSelect?.(null);
        }
      }
    }
  }

  _onMouseMove(e) {
    const pos = this._getCanvasPos(e);

    if (this.dragNode) {
      const wp = this.screenToWorld(pos.x, pos.y);
      this.dragNode.fx = wp.x + this.dragOffset.x;
      this.dragNode.fy = wp.y + this.dragOffset.y;
      this.dragNode.x = this.dragNode.fx;
      this.dragNode.y = this.dragNode.fy;
      return;
    }

    if (this.isPanning) {
      const dx = (pos.x - this.panStart.x) / this.camera.zoom;
      const dy = (pos.y - this.panStart.y) / this.camera.zoom;
      this.camera.x += dx;
      this.camera.y += dy;
      this.panStart = { x: pos.x, y: pos.y };
      return;
    }

    const node = this.getNodeAt(pos.x, pos.y);
    const prevHovered = this.hoveredNode;
    this.hoveredNode = node;

    if (!node) {
      const edge = this.getEdgeAt(pos.x, pos.y);
      this.hoveredEdge = edge;
    } else {
      this.hoveredEdge = null;
    }

    if (node !== prevHovered) {
      if (node) {
        this._onNodeHover?.(node, e.clientX, e.clientY);
      } else {
        this._onNodeUnhover?.();
      }
    }

    this.canvas.style.cursor = node ? 'pointer' : (this.hoveredEdge ? 'pointer' : 'grab');
  }

  _onMouseUp(e) {
    if (this.dragNode) {
      this.dragNode.fx = null;
      this.dragNode.fy = null;
      this.dragNode = null;
    }
    this.isPanning = false;
  }

  _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    const newZoom = this.camera.zoom * delta;
    this.setZoom(newZoom);
    this._onZoomChange?.(this.camera.zoom);
  }

  _onDblClick(e) {
    const pos = this._getCanvasPos(e);
    const node = this.getNodeAt(pos.x, pos.y);
    if (node) {
      this._onNodeDblClick?.(node);
    }
  }

  _onContextMenu(e) {
    const pos = this._getCanvasPos(e);
    const node = this.getNodeAt(pos.x, pos.y);
    const edge = node ? null : this.getEdgeAt(pos.x, pos.y);
    this._onRightClick?.(node, edge, e.clientX, e.clientY);
  }

  // ========== 连线模式 ==========
  _edgeMode = false;
  _edgeModeSource = null;

  enterEdgeMode() {
    this._edgeMode = true;
    this._edgeModeSource = null;
    this.canvas.style.cursor = 'crosshair';
  }

  exitEdgeMode() {
    this._edgeMode = false;
    this._edgeModeSource = null;
    this.canvas.style.cursor = 'grab';
  }

  _handleEdgeModeClick(node) {
    if (!this._edgeModeSource) {
      this._edgeModeSource = node;
      this.selectedNode = node;
    } else {
      if (node.id !== this._edgeModeSource.id) {
        this._onEdgeCreate?.(this._edgeModeSource, node);
      }
      this._edgeModeSource = null;
    }
  }

  // ========== 序列化 ==========
  exportData() {
    return {
      nodes: this.nodes.map(n => ({
        id: n.id, label: n.label, type: n.type,
        description: n.description, color: n.color,
        x: n.x, y: n.y, metadata: n.metadata,
      })),
      edges: this.edges.map(e => ({
        id: e.id, source: e.source, target: e.target,
        type: e.type, label: e.label, color: e.color,
      })),
    };
  }

  importData(data) {
    this.nodes = [];
    this.edges = [];
    this._nodeIdCounter = 1;
    this._edgeIdCounter = 1;

    if (data.nodes) {
      for (const nd of data.nodes) {
        const added = this.addNode(nd);
        if (nd.id) added.id = nd.id;
        if (nd.x !== undefined) { added.x = nd.x; added.y = nd.y; }
      }
      this._nodeIdCounter = Math.max(...this.nodes.map(n => n.id), 0) + 1;
    }
    if (data.edges) {
      for (const ed of data.edges) {
        const added = this.addEdge(ed);
        if (added && ed.id) added.id = ed.id;
      }
      this._edgeIdCounter = Math.max(...this.edges.map(e => e.id), 0) + 1;
    }
  }

  // ========== 空状态控制 ==========
  _hideEmptyState() {
    const el = document.getElementById('graphEmptyState');
    if (el) el.style.display = 'none';
    const legend = document.getElementById('graphLegend');
    if (legend) legend.style.display = 'flex';
  }

  _showEmptyState() {
    const el = document.getElementById('graphEmptyState');
    if (el) el.style.display = 'flex';
    const legend = document.getElementById('graphLegend');
    if (legend) legend.style.display = 'none';
  }

  destroy() {
    this.stopSimulation();
    if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
    if (this._animLoopId) cancelAnimationFrame(this._animLoopId);
  }
}

window.KnowledgeGraphEngine = KnowledgeGraphEngine;
