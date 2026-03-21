/**
 * 知识图谱 - UI交互控制器
 * 处理工具栏操作、弹窗、数据导入、右键菜单等
 */

(function() {
  'use strict';

  let engine = null;
  let isInitialized = false;
  const STORAGE_KEY = 'knowledgeGraphData';

  // ========== 初始化 ==========
  function initGraph() {
    if (isInitialized) return;

    const canvas = document.getElementById('graphCanvas');
    if (!canvas) return;

    engine = new KnowledgeGraphEngine(canvas);

    // 加载已保存的数据
    loadGraphData();

    // 绑定回调
    engine._onNodeHover = showTooltip;
    engine._onNodeUnhover = hideTooltip;
    engine._onNodeDblClick = openNodeEditModal;
    engine._onRightClick = showContextMenu;
    engine._onEdgeCreate = handleEdgeCreate;
    engine._onZoomChange = updateZoomDisplay;
    engine._onNodeSelect = () => { hideContextMenu(); };
    engine._onEdgeSelect = () => { hideContextMenu(); };
    engine._onSelect = () => { hideContextMenu(); };

    // 绑定工具栏
    bindToolbar();
    bindModal();
    bindEmptyState();

    // 初始渲染
    engine._requestRender();

    isInitialized = true;
  }

  // ========== 数据持久化 ==========
  function saveGraphData() {
    if (!engine) return;
    try {
      const data = engine.exportData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('保存图谱数据失败:', e);
    }
  }

  function loadGraphData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.nodes?.length > 0) {
          // 清理旧数据中的隐藏文件节点（如 .DS_Store）
          const hiddenNodeIds = new Set();
          data.nodes = data.nodes.filter(node => {
            const name = node.label || '';
            const fullName = node.metadata?.fullName || name;
            if (fullName.startsWith('.') && (node.type === 'document' || node.type === 'note' || node.type === 'custom')) {
              hiddenNodeIds.add(node.id);
              return false;
            }
            return true;
          });
          // 同时移除与隐藏节点关联的边
          if (hiddenNodeIds.size > 0) {
            data.edges = (data.edges || []).filter(edge => 
              !hiddenNodeIds.has(edge.source) && !hiddenNodeIds.has(edge.target)
            );
          }

          engine.importData(data);
          engine._hideEmptyState();
          engine.fitView();
        }
      }
    } catch (e) {
      console.warn('加载图谱数据失败:', e);
    }
  }

  // 定时保存（避免频繁IO）
  let saveTimer = null;
  function debouncedSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveGraphData, 1000);
  }

  // ========== 工具栏 ==========
  function bindToolbar() {
    // 添加节点
    const addNodeBtn = document.getElementById('graphAddNode');
    if (addNodeBtn) addNodeBtn.onclick = () => openAddNodeModal();

    // 添加连线
    const addEdgeBtn = document.getElementById('graphAddEdge');
    if (addEdgeBtn) addEdgeBtn.onclick = () => toggleEdgeMode(addEdgeBtn);

    // 删除
    const deleteBtn = document.getElementById('graphDelete');
    if (deleteBtn) deleteBtn.onclick = () => deleteSelected();

    // 自动布局（温和重启）
    const autoLayoutBtn = document.getElementById('graphAutoLayout');
    if (autoLayoutBtn) autoLayoutBtn.onclick = () => {
      engine.startSimulation(true);
      // 等布局稳定后自动保存
      setTimeout(() => debouncedSave(), 2500);
    };

    // 适应视图
    const fitViewBtn = document.getElementById('graphFitView');
    if (fitViewBtn) fitViewBtn.onclick = () => engine.fitView();

    // 导入知识库
    const importBtn = document.getElementById('graphImportData');
    if (importBtn) importBtn.onclick = () => importFromKnowledgeBase();

    // 缩放
    const zoomInBtn = document.getElementById('graphZoomIn');
    if (zoomInBtn) zoomInBtn.onclick = () => {
      engine.setZoom(engine.camera.zoom * 1.2);
      updateZoomDisplay(engine.camera.zoom);
    };

    const zoomOutBtn = document.getElementById('graphZoomOut');
    if (zoomOutBtn) zoomOutBtn.onclick = () => {
      engine.setZoom(engine.camera.zoom / 1.2);
      updateZoomDisplay(engine.camera.zoom);
    };

    // 连线取消
    const edgeCancelBtn = document.getElementById('graphEdgeCancelBtn');
    if (edgeCancelBtn) edgeCancelBtn.onclick = () => {
      engine.exitEdgeMode();
      const hint = document.getElementById('graphEdgeHint');
      if (hint) hint.style.display = 'none';
      const addEdge = document.getElementById('graphAddEdge');
      if (addEdge) addEdge.classList.remove('active');
    };
  }

  function updateZoomDisplay(zoom) {
    const el = document.getElementById('graphZoomLevel');
    if (el) el.textContent = Math.round((zoom || 1) * 100) + '%';
  }

  function toggleEdgeMode(btn) {
    if (engine._edgeMode) {
      engine.exitEdgeMode();
      btn.classList.remove('active');
      document.getElementById('graphEdgeHint').style.display = 'none';
    } else {
      engine.enterEdgeMode();
      btn.classList.add('active');
      document.getElementById('graphEdgeHint').style.display = 'flex';
    }
  }

  function deleteSelected() {
    if (engine.selectedNode) {
      const name = engine.selectedNode.label;
      if (confirm(`确定删除节点「${name}」及其所有连线吗？`)) {
        engine.removeNode(engine.selectedNode.id);
        debouncedSave();
      }
    } else if (engine.selectedEdge) {
      engine.removeEdge(engine.selectedEdge.id);
      debouncedSave();
    }
  }

  // ========== 弹窗 ==========
  let modalCallback = null;

  function bindModal() {
    const overlay = document.getElementById('graphModalOverlay');
    const closeBtn = document.getElementById('graphModalClose');
    const cancelBtn = document.getElementById('graphModalCancel');
    const confirmBtn = document.getElementById('graphModalConfirm');

    const closeModal = () => { overlay.style.display = 'none'; modalCallback = null; };
    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    if (confirmBtn) confirmBtn.onclick = () => {
      if (modalCallback) modalCallback();
    };
  }

  function openModal(title, bodyHtml, onConfirm) {
    const overlay = document.getElementById('graphModalOverlay');
    const titleEl = document.getElementById('graphModalTitle');
    const bodyEl = document.getElementById('graphModalBody');
    if (!overlay) return;
    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    overlay.style.display = 'flex';
    modalCallback = onConfirm;
  }

  function closeModal() {
    const overlay = document.getElementById('graphModalOverlay');
    if (overlay) overlay.style.display = 'none';
    modalCallback = null;
  }

  // ========== 添加节点弹窗 ==========
  function openAddNodeModal() {
    const typeOptions = Object.entries(engine.nodeTypes).map(
      ([key, val]) => `<option value="${key}">${val.label}</option>`
    ).join('');

    const colorOptions = ['#4ade80', '#60a5fa', '#f59e0b', '#c084fc', '#fb7185', '#38bdf8', '#f97316', '#14b8a6']
      .map(c => `<div class="graph-modal-color-option" data-color="${c}" style="background:${c}"></div>`)
      .join('');

    const html = `
      <div class="graph-modal-field">
        <label class="graph-modal-label">节点名称</label>
        <input class="graph-modal-input" id="nodeNameInput" placeholder="输入节点名称" autofocus />
      </div>
      <div class="graph-modal-field">
        <label class="graph-modal-label">节点类型</label>
        <select class="graph-modal-select" id="nodeTypeSelect">${typeOptions}</select>
      </div>
      <div class="graph-modal-field">
        <label class="graph-modal-label">描述（可选）</label>
        <textarea class="graph-modal-textarea" id="nodeDescInput" placeholder="输入描述信息"></textarea>
      </div>
      <div class="graph-modal-field">
        <label class="graph-modal-label">颜色（可选，留空使用默认）</label>
        <div class="graph-modal-color-row" id="nodeColorRow">${colorOptions}</div>
      </div>
    `;

    openModal('添加节点', html, () => {
      const name = document.getElementById('nodeNameInput')?.value?.trim();
      const type = document.getElementById('nodeTypeSelect')?.value;
      const desc = document.getElementById('nodeDescInput')?.value?.trim();
      const selectedColor = document.querySelector('.graph-modal-color-option.selected');
      const color = selectedColor?.dataset.color;

      if (!name) { alert('请输入节点名称'); return; }

      engine.addNode({ label: name, type, description: desc, color });
      engine.startSimulation(true);
      closeModal();
      debouncedSave();
    });

    // 颜色选择
    setTimeout(() => {
      document.querySelectorAll('.graph-modal-color-option').forEach(el => {
        el.onclick = () => {
          document.querySelectorAll('.graph-modal-color-option').forEach(o => o.classList.remove('selected'));
          el.classList.toggle('selected');
        };
      });
    }, 50);
  }

  // ========== 编辑节点弹窗 ==========
  function openNodeEditModal(node) {
    const html = `
      <div class="graph-modal-field">
        <label class="graph-modal-label">节点名称</label>
        <input class="graph-modal-input" id="editNodeName" value="${node.label}" />
      </div>
      <div class="graph-modal-field">
        <label class="graph-modal-label">描述</label>
        <textarea class="graph-modal-textarea" id="editNodeDesc">${node.description || ''}</textarea>
      </div>
    `;

    openModal('编辑节点', html, () => {
      const name = document.getElementById('editNodeName')?.value?.trim();
      if (!name) { alert('请输入节点名称'); return; }
      node.label = name;
      node.description = document.getElementById('editNodeDesc')?.value?.trim() || '';
      engine._requestRender();
      closeModal();
      debouncedSave();
    });
  }

  // ========== 连线创建 ==========
  function handleEdgeCreate(sourceNode, targetNode) {
    const typeOptions = Object.entries(engine.edgeTypes).map(
      ([key, val]) => `<option value="${key}">${val.label}</option>`
    ).join('');

    const html = `
      <div class="graph-modal-field">
        <label class="graph-modal-label">连线: ${sourceNode.label} → ${targetNode.label}</label>
      </div>
      <div class="graph-modal-field">
        <label class="graph-modal-label">关系类型</label>
        <select class="graph-modal-select" id="edgeTypeSelect">${typeOptions}</select>
      </div>
      <div class="graph-modal-field">
        <label class="graph-modal-label">标签（可选）</label>
        <input class="graph-modal-input" id="edgeLabelInput" placeholder="自定义关系描述" />
      </div>
    `;

    openModal('创建连线', html, () => {
      const type = document.getElementById('edgeTypeSelect')?.value;
      const label = document.getElementById('edgeLabelInput')?.value?.trim();
      const edgeType = engine.edgeTypes[type];
      engine.addEdge({
        source: sourceNode.id,
        target: targetNode.id,
        type,
        label: label || edgeType?.label || '关联',
      });
      closeModal();
      debouncedSave();

      // 退出连线模式
      engine.exitEdgeMode();
      document.getElementById('graphEdgeHint').style.display = 'none';
      document.getElementById('graphAddEdge')?.classList.remove('active');
    });
  }

  // ========== 悬浮卡片 ==========
  function showTooltip(node, clientX, clientY) {
    const tooltip = document.getElementById('graphTooltip');
    if (!tooltip) return;

    // 标题
    document.getElementById('tooltipTitle').textContent = node.label;
    
    // 元信息：类型 + 连接数
    const typeLabel = engine.nodeTypes[node.type]?.label || '自定义';
    const connectedEdges = engine.edges.filter(e => e.source === node.id || e.target === node.id);
    let metaText = `类型: ${typeLabel}`;
    if (connectedEdges.length > 0) {
      metaText += ` | 连接: ${connectedEdges.length} 条关系`;
    }
    document.getElementById('tooltipMeta').textContent = metaText;

    // 详细信息
    const descParts = [];
    if (node.description) descParts.push(node.description);
    
    // 显示文件路径（如果有）
    if (node.metadata?.filePath) {
      descParts.push(`📁 ${node.metadata.filePath}`);
    }
    // 显示修改时间（如果有）
    if (node.metadata?.modifiedTime) {
      const d = new Date(node.metadata.modifiedTime);
      descParts.push(`修改: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`);
    }
    // 显示添加时间
    if (node.metadata?.addedTime) {
      const d = new Date(node.metadata.addedTime);
      descParts.push(`添加: ${d.toLocaleDateString()}`);
    }
    // 显示关联节点名称
    if (connectedEdges.length > 0 && connectedEdges.length <= 5) {
      const neighbors = connectedEdges.map(e => {
        const otherId = e.source === node.id ? e.target : e.source;
        const otherNode = engine.getNodeById(otherId);
        return otherNode ? `${e.label}→${otherNode.label}` : null;
      }).filter(Boolean);
      if (neighbors.length > 0) {
        descParts.push(`关系: ${neighbors.join(', ')}`);
      }
    }
    
    document.getElementById('tooltipDesc').textContent = descParts.join('\n') || '暂无描述';

    const container = engine.canvas.parentElement.getBoundingClientRect();
    let x = clientX - container.left + 16;
    let y = clientY - container.top + 16;

    // 边界检测
    if (x + 280 > container.width) x = clientX - container.left - 296;
    if (y + 100 > container.height) y = clientY - container.top - 100;

    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    tooltip.style.display = 'block';
  }

  function hideTooltip() {
    const tooltip = document.getElementById('graphTooltip');
    if (tooltip) tooltip.style.display = 'none';
  }

  // ========== 右键菜单 ==========
  function showContextMenu(node, edge, clientX, clientY) {
    hideContextMenu();

    const container = engine.canvas.parentElement;
    const containerRect = container.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'graph-context-menu';
    menu.id = 'graphContextMenu';

    let items = '';

    if (node) {
      engine.selectedNode = node;
      engine._requestRender();
      items = `
        <div class="graph-context-item" data-action="edit">✏️ 编辑节点</div>
        <div class="graph-context-item" data-action="connect">🔗 从此节点连线</div>
        ${node.metadata?.filePath ? '<div class="graph-context-item" data-action="goto-file">📂 跳转到文件</div>' : ''}
        ${node.metadata?.filePath ? '<div class="graph-context-item" data-action="goto-category">📚 跳转到分类</div>' : ''}
        <div class="graph-context-divider"></div>
        <div class="graph-context-item danger" data-action="delete-node">🗑️ 删除节点</div>
      `;
    } else if (edge) {
      engine.selectedEdge = edge;
      engine._requestRender();
      items = `
        <div class="graph-context-item danger" data-action="delete-edge">🗑️ 删除连线</div>
      `;
    } else {
      const wp = engine.screenToWorld(
        clientX - containerRect.left,
        clientY - containerRect.top
      );
      items = `
        <div class="graph-context-item" data-action="add-node" data-x="${wp.x}" data-y="${wp.y}">➕ 在此添加节点</div>
        <div class="graph-context-item" data-action="fit-view">📐 适应视图</div>
        <div class="graph-context-item" data-action="auto-layout">⚡ 自动布局</div>
      `;
    }

    menu.innerHTML = items;
    menu.style.left = (clientX - containerRect.left) + 'px';
    menu.style.top = (clientY - containerRect.top) + 'px';
    container.appendChild(menu);

    // 边界修正
    setTimeout(() => {
      const menuRect = menu.getBoundingClientRect();
      if (menuRect.right > containerRect.right) {
        menu.style.left = (clientX - containerRect.left - menuRect.width) + 'px';
      }
      if (menuRect.bottom > containerRect.bottom) {
        menu.style.top = (clientY - containerRect.top - menuRect.height) + 'px';
      }
    }, 10);

    // 事件代理
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.graph-context-item');
      if (!item) return;
      const action = item.dataset.action;

      switch (action) {
        case 'edit':
          openNodeEditModal(node);
          break;
        case 'connect':
          engine.enterEdgeMode();
          engine._edgeModeSource = node;
          engine.selectedNode = node;
          document.getElementById('graphEdgeHint').style.display = 'flex';
          document.getElementById('graphAddEdge')?.classList.add('active');
          engine._requestRender();
          break;
        case 'delete-node':
          if (confirm(`确定删除节点「${node.label}」？`)) {
            engine.removeNode(node.id);
            debouncedSave();
          }
          break;
        case 'goto-file':
          if (node.metadata?.filePath) {
            // 在系统文件管理器中定位文件
            try {
              if (window.electronAPI?.shell?.showItemInFolder) {
                window.electronAPI.shell.showItemInFolder(node.metadata.filePath);
              } else if (window.electronAPI?.shell?.openPath) {
                window.electronAPI.shell.openPath(node.metadata.filePath);
              } else {
                alert(`文件路径: ${node.metadata.filePath}`);
              }
            } catch (e) {
              alert(`文件路径: ${node.metadata.filePath}`);
            }
          }
          break;
        case 'goto-category':
          if (node.metadata?.category) {
            // 切换到知识条目 tab 并展示对应分类
            const catName = node.metadata.category;
            const itemsTabBtn = document.querySelector('.tab-btn[data-tab="items"]');
            if (itemsTabBtn) {
              itemsTabBtn.click();
              // 等待tab切换完成后给一个提示
              setTimeout(() => {
                alert(`已切换到知识条目页面，请在左侧选择分类「${catName}」查看详情`);
              }, 300);
            }
          }
          break;
        case 'delete-edge':
          engine.removeEdge(edge.id);
          debouncedSave();
          break;
        case 'add-node':
          const x = parseFloat(item.dataset.x);
          const y = parseFloat(item.dataset.y);
          openAddNodeModalAt(x, y);
          break;
        case 'fit-view':
          engine.fitView();
          break;
        case 'auto-layout':
          engine.startSimulation(true);
          setTimeout(() => debouncedSave(), 2500);
          break;
      }
      hideContextMenu();
    });

    // 点击其他区域关闭
    setTimeout(() => {
      const handler = (e) => {
        if (!menu.contains(e.target)) {
          hideContextMenu();
          document.removeEventListener('mousedown', handler);
        }
      };
      document.addEventListener('mousedown', handler);
    }, 50);
  }

  function hideContextMenu() {
    const menu = document.getElementById('graphContextMenu');
    if (menu) menu.remove();
  }

  function openAddNodeModalAt(x, y) {
    openAddNodeModal();
    // 覆写确认回调，加入坐标
    const origCallback = modalCallback;
    modalCallback = () => {
      const name = document.getElementById('nodeNameInput')?.value?.trim();
      const type = document.getElementById('nodeTypeSelect')?.value;
      const desc = document.getElementById('nodeDescInput')?.value?.trim();
      const selectedColor = document.querySelector('.graph-modal-color-option.selected');
      const color = selectedColor?.dataset.color;

      if (!name) { alert('请输入节点名称'); return; }

      engine.addNode({ label: name, type, description: desc, color, x, y });
      closeModal();
      debouncedSave();
    };
  }

  // ========== 导入知识库 ==========
  async function importFromKnowledgeBase() {
    try {
      if (!window.electronAPI?.workspace?.getStats) {
        alert('需要先在主界面打开一个工作区文件夹');
        return;
      }

      const result = await window.electronAPI.workspace.getStats();
      if (!result.success) {
        alert('请先在主界面打开一个文件夹作为工作区');
        return;
      }

      const stats = result.stats;
      if (!stats.folders || stats.folders.length === 0) {
        alert('工作区中未发现任何分类文件夹');
        return;
      }

      // 创建中心"知识库"节点
      const centerNode = engine.addNode({
        label: '知识库',
        type: 'concept',
        description: `共 ${stats.totalFiles || 0} 个文件，${stats.folderCount || 0} 个分类`,
        x: 0, y: 0,
      });

      // 为每个分类创建节点
      for (let i = 0; i < stats.folders.length; i++) {
        const folder = stats.folders[i];
        const angle = (2 * Math.PI * i) / stats.folders.length;
        const dist = 200;

        const catNode = engine.addNode({
          label: folder.name,
          type: 'category',
          description: `${folder.fileCount || 0} 个文件`,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
        });

        // 连接到中心
        engine.addEdge({
          source: centerNode.id,
          target: catNode.id,
          type: 'belongs-to',
          label: '包含',
        });

        // 获取分类下的文件
        try {
          const detail = await window.electronAPI.workspace.getCategoryDetail(folder.detailFile || folder.name);
          if (detail.success && detail.files) {
            // 过滤隐藏文件和系统文件
            const validFiles = detail.files.filter(file => {
              const name = file.name || '';
              return !name.startsWith('.');
            });

            // 限制每个分类下最多显示8个文件节点，防止过多节点造成卡顿
            const filesToShow = validFiles.slice(0, 8);
            for (let j = 0; j < filesToShow.length; j++) {
              const file = filesToShow[j];
              const ext = (file.format || '').toLowerCase();
              let type = 'document';
              if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) type = 'image';
              else if (['md', 'txt'].includes(ext)) type = 'note';

              const fileAngle = angle + ((j - filesToShow.length / 2) * 0.3);
              const fileDist = dist + 140;

              // 构建丰富的描述信息
              const descParts = [];
              descParts.push(`格式: ${ext.toUpperCase() || '未知'}`);
              descParts.push(`大小: ${formatSize(file.size)}`);
              if (file.modifiedTime) {
                const d = new Date(file.modifiedTime);
                descParts.push(`修改: ${d.toLocaleDateString()}`);
              }
              if (file.addedTime) {
                const d = new Date(file.addedTime);
                descParts.push(`添加: ${d.toLocaleDateString()}`);
              }

              // 构建完整文件路径
              const filePath = detail.folderPath ? `${detail.folderPath}/${file.path || file.name}` : (file.path || file.name);

              const fileNode = engine.addNode({
                label: file.name.length > 20 ? file.name.slice(0, 20) + '…' : file.name,
                type,
                description: descParts.join(' | '),
                x: Math.cos(fileAngle) * fileDist,
                y: Math.sin(fileAngle) * fileDist,
                metadata: {
                  fullName: file.name,
                  filePath: filePath,
                  category: folder.name,
                  format: ext,
                  size: file.size,
                  addedTime: file.addedTime || null,
                  modifiedTime: file.modifiedTime || null,
                },
              });

              engine.addEdge({
                source: catNode.id,
                target: fileNode.id,
                type: 'belongs-to',
                label: '包含',
              });
            }

            // 如果有更多文件
            if (validFiles.length > 8) {
              const moreNode = engine.addNode({
                label: `还有 ${validFiles.length - 8} 项...`,
                type: 'custom',
                description: `分类「${folder.name}」中还有 ${validFiles.length - 8} 个文件未在图谱中显示`,
                x: Math.cos(angle + Math.PI * 0.15) * (dist + 140),
                y: Math.sin(angle + Math.PI * 0.15) * (dist + 140),
                metadata: { category: folder.name },
              });
              engine.addEdge({
                source: catNode.id,
                target: moreNode.id,
                type: 'related',
                label: '更多',
              });
            }
          }
        } catch (e) {
          console.warn(`获取分类 ${folder.name} 详情失败:`, e);
        }
      }

      // 启动力导向布局（首次导入用完整模拟）
      engine.startSimulation(false);
      // 布局稳定后自动适应视图
      setTimeout(() => {
        engine.fitView();
        debouncedSave();
      }, 2500);

    } catch (e) {
      console.error('导入知识库失败:', e);
      alert('导入失败: ' + e.message);
    }
  }

  function formatSize(bytes) {
    if (!bytes) return '未知';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // ========== 空状态 ==========
  function bindEmptyState() {
    const importBtn = document.getElementById('graphEmptyImport');
    if (importBtn) importBtn.onclick = () => importFromKnowledgeBase();

    const createBtn = document.getElementById('graphEmptyCreate');
    if (createBtn) createBtn.onclick = () => openAddNodeModal();
  }

  // ========== Tab切换时初始化 ==========
  // 监听tab切换
  const observer = new MutationObserver(() => {
    const graphTab = document.getElementById('graphTab');
    if (graphTab && graphTab.classList.contains('active')) {
      if (!isInitialized) {
        // 等一帧确保布局完成
        requestAnimationFrame(() => {
          initGraph();
        });
      } else if (engine) {
        // 重新计算画布大小
        engine._resizeCanvas();
        engine._requestRender();
      }
    }
  });

  const graphTab = document.getElementById('graphTab');
  if (graphTab) {
    observer.observe(graphTab, { attributes: true, attributeFilter: ['class'] });
  }

  // 也在 DOMContentLoaded 时检查
  document.addEventListener('DOMContentLoaded', () => {
    const gTab = document.getElementById('graphTab');
    if (gTab) {
      observer.observe(gTab, { attributes: true, attributeFilter: ['class'] });
    }
  });

})();
