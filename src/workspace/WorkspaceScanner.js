/**
 * 工作区扫描器
 * 每120秒执行一次工作区扫描，检查文件结构变化
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const metadataManager = require('../utils/MetadataManager');

class WorkspaceScanner {
    constructor(dataDir) {
        this.dataDir = dataDir;  // data 文件夹路径
        this.workspacesRoot = path.join(dataDir, 'workspaces');
        this.indexFile = path.join(this.workspacesRoot, 'index.json');
        this.currentWorkspace = null;
        this.structureFile = null;
        this.summaryFile = null;
        this.scanInterval = null;
        this.isScanning = false;
    }

    /**
     * 激活当前工作区，确保同一路径复用已有 workspaceId
     * @param {string} workspacePath - 用户打开的工作区路径
     * @returns {{workspaceId: string, workspaceDataDir: string, normalizedPath: string}}
     */
    setActiveWorkspace(workspacePath) {
        const resolved = this.resolveWorkspace(workspacePath);
        this.currentWorkspace = resolved;
        this.structureFile = path.join(resolved.dataDir, 'folder_structure.json');
        this.summaryFile = path.join(resolved.dataDir, 'summary.json');
        console.log(`[WorkspaceScanner] 当前工作区: ${resolved.workspaceId}`);
        return {
            workspaceId: resolved.workspaceId,
            workspaceDataDir: resolved.dataDir,
            normalizedPath: resolved.normalizedPath,
        };
    }

    /**
     * 清空当前工作区
     */
    clearActiveWorkspace() {
        this.stop();
        this.currentWorkspace = null;
        this.structureFile = null;
        this.summaryFile = null;
        this.isScanning = false;
    }

    /**
     * 启动定时扫描
     * @param {number} intervalMs - 扫描间隔（毫秒），默认120秒
     */
    start(intervalMs = 120000) {
        if (!this.currentWorkspace) {
            console.log('[WorkspaceScanner] 未激活工作区，跳过启动');
            return;
        }

        if (this.scanInterval) {
            console.log('[WorkspaceScanner] 扫描器已在运行中');
            return;
        }

        // 立即执行一次扫描
        this.scan().catch(err => {
            console.error('[WorkspaceScanner] 初始扫描失败:', err.message);
        });

        // 设置定时扫描
        this.scanInterval = setInterval(() => {
            this.scan().catch(err => {
                console.error('[WorkspaceScanner] 定时扫描失败:', err.message);
            });
        }, intervalMs);

        console.log(`[WorkspaceScanner] 已启动，扫描间隔: ${intervalMs / 1000}秒`);
    }

    /**
     * 停止扫描
     */
    stop() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
            console.log('[WorkspaceScanner] 已停止');
        }
    }

    /**
     * 执行一次扫描
     */
    async scan() {
        if (this.isScanning) {
            console.log('[WorkspaceScanner] 扫描进行中，跳过本次');
            return;
        }

        this.isScanning = true;

        try {
            if (!this.currentWorkspace) {
                return;
            }

            console.log(`[WorkspaceScanner] 开始扫描工作区: ${this.currentWorkspace.workspacePath}`);

            // 确保工作区数据目录存在
            if (!fs.existsSync(this.currentWorkspace.dataDir)) {
                fs.mkdirSync(this.currentWorkspace.dataDir, { recursive: true });
            }

            // 获取实际文件夹结构
            const actualFolders = this.getActualFolders();

            // 对比并更新 folder_structure.json
            await this.updateFolderStructure(actualFolders);

            // 为每个子文件夹生成详细 JSON
            for (const folder of actualFolders) {
                this.generateFolderDetailJson(folder.path);
            }

            // 生成 summary.json
            await this.generateSummary();

            console.log('[WorkspaceScanner] 扫描完成');
        } catch (err) {
            console.error('[WorkspaceScanner] 扫描出错:', err.message);
        } finally {
            this.isScanning = false;
        }
    }

    /**
     * 获取实际文件夹结构
     * @returns {Array} 文件夹列表
     */
    getActualFolders() {
        const folders = [];

        if (!this.currentWorkspace || !fs.existsSync(this.currentWorkspace.workspacePath)) {
            return folders;
        }

        const items = fs.readdirSync(this.currentWorkspace.workspacePath, { withFileTypes: true });

        for (const item of items) {
            if (item.isDirectory()) {
                // 过滤隐藏文件夹（以 . 开头的文件夹，如 .git, .DS_Store 等）
                if (item.name.startsWith('.')) continue;
                const folderPath = path.join(this.currentWorkspace.workspacePath, item.name);
                folders.push({
                    name: item.name,
                    path: folderPath,
                    description: ''
                });
            }
        }

        return folders;
    }

    /**
     * 对比并更新 folder_structure.json
     * @param {Array} actualFolders - 实际文件夹列表
     */
    async updateFolderStructure(actualFolders) {
        let existingConfig = { folders: [], lastUpdated: null };

        // 读取现有配置
        if (fs.existsSync(this.structureFile)) {
            try {
                const data = fs.readFileSync(this.structureFile, 'utf-8');
                existingConfig = JSON.parse(data);
            } catch (err) {
                console.warn('[WorkspaceScanner] 读取现有配置失败，将创建新配置');
            }
        }

        const existingFolderNames = new Set(
            (existingConfig.folders || []).map(f => f.name)
        );
        const actualFolderNames = new Set(actualFolders.map(f => f.name));

        // 检查新增的文件夹
        const newFolders = [];
        for (const folder of actualFolders) {
            if (!existingFolderNames.has(folder.name)) {
                // 新文件夹，使用 AI 生成描述
                try {
                    folder.description = await this.generateFolderDescription(folder.name);
                    newFolders.push(folder);
                    console.log(`[WorkspaceScanner] 新增文件夹: ${folder.name}`);
                } catch (err) {
                    console.warn(`[WorkspaceScanner] 生成描述失败: ${folder.name}`, err.message);
                    folder.description = '';
                    newFolders.push(folder);
                }
            }
        }

        // 检查删除的文件夹
        const removedFolders = [];
        for (const name of existingFolderNames) {
            if (!actualFolderNames.has(name)) {
                removedFolders.push(name);
                console.log(`[WorkspaceScanner] 删除文件夹: ${name}`);
            }
        }

        // 更新配置
        if (newFolders.length > 0 || removedFolders.length > 0) {
            // 保留现有文件夹的描述
            const updatedFolders = actualFolders.map(folder => {
                const existing = (existingConfig.folders || []).find(f => f.name === folder.name);
                if (existing) {
                    return { ...folder, description: existing.description || folder.description };
                }
                return folder;
            });

            const newConfig = {
                folders: updatedFolders,
                lastUpdated: new Date().toISOString(),
                addedFolders: newFolders.map(f => f.name),
                removedFolders: removedFolders
            };

            fs.writeFileSync(this.structureFile, JSON.stringify(newConfig, null, 2), 'utf-8');
            console.log(`[WorkspaceScanner] 已更新 folder_structure.json`);
        } else {
            // 无变化，只更新扫描时间
            existingConfig.lastUpdated = new Date().toISOString();
            fs.writeFileSync(this.structureFile, JSON.stringify(existingConfig, null, 2), 'utf-8');
        }
    }

    /**
     * 为文件夹生成详细 JSON（递归扫描所有子目录并保持树状结构）
     * @param {string} folderPath - 文件夹路径
     */
    /**
     * 获取文件夹对应的详情文件名（路径哈希）
     */
    getFolderDetailFilename(folderPath) {
        if (!this.currentWorkspace) return null;
        const relative = path.relative(this.currentWorkspace.workspacePath, folderPath);
        if (relative === '') return 'root.json';
        const hash = crypto.createHash('md5').update(relative).digest('hex').substring(0, 8);
        return `${path.basename(folderPath)}_${hash}.json`;
    }

    generateFolderDetailJson(folderPath) {
        const folderName = path.basename(folderPath);
        if (!this.currentWorkspace) {
            return;
        }

        const detailFilename = this.getFolderDetailFilename(folderPath);
        const detailFile = path.join(this.currentWorkspace.dataDir, detailFilename);

        try {
            const buildTree = (currentPath, relativePath = '') => {
                let items = [];

                try {
                    items = fs.readdirSync(currentPath, { withFileTypes: true });
                } catch (err) {
                    // 某个子目录无权限时不中断整个扫描
                    console.warn(`[WorkspaceScanner] 读取目录失败: ${currentPath}`, err.message);
                    return { files: [], children: [] };
                }

                const files = [];
                const folders = [];

                for (const item of items) {
                    // 过滤隐藏文件和隐藏文件夹（以 . 开头，如 .DS_Store, .git 等）
                    if (item.name.startsWith('.')) continue;

                    const itemPath = path.join(currentPath, item.name);
                    const itemRelativePath = path.join(relativePath, item.name).replace(/\\/g, '/');

                    if (item.isDirectory()) {
                        const subTree = buildTree(itemPath, itemRelativePath);
                        if (subTree.files.length > 0 || subTree.children.length > 0) {
                            folders.push({
                                name: item.name,
                                type: 'folder',
                                path: itemRelativePath,
                                ...subTree,
                            });
                        }
                        continue;
                    }

                    if (!item.isFile()) {
                        continue;
                    }

                    // 跳过 Sidecar 元数据文件以及任何 JSON 配置文件 (系统缓存等)
                    if (item.name.toLowerCase().endsWith('.meta.json') || item.name.toLowerCase().endsWith('.json')) {
                        continue;
                    }

                    try {
                        const stats = fs.statSync(itemPath);
                        const ext = path.extname(item.name).toLowerCase().replace('.', '');

                        files.push({
                            name: item.name,
                            type: 'file',
                            path: itemRelativePath,
                            format: ext || 'unknown',
                            addedTime: stats.birthtime.toISOString(),
                            modifiedTime: stats.mtime.toISOString(),
                            size: stats.size,
                        });

                        // 尝试合并 Sidecar 元数据
                        if (ext === 'pdf') {
                            const lastFile = files[files.length - 1];
                            const meta = metadataManager.loadMetadata(itemPath);
                            if (meta) {
                                lastFile.meta = meta;
                                // 将关键字段提升到顶级以方便 UI 访问
                                lastFile.arxivId = meta.arxivId || meta.id;
                                lastFile.sourceUrl = meta.pdfUrl || meta.url;
                                lastFile.authors = meta.authors;
                                lastFile.abstract = meta.abstract || meta.summary;
                            }
                        }
                    } catch (err) {
                        console.warn(`[WorkspaceScanner] 读取文件信息失败: ${itemPath}`, err.message);
                    }
                }

                // 同级文件按添加时间排序
                files.sort((a, b) => new Date(b.addedTime) - new Date(a.addedTime));

                return {
                    files,
                    children: folders,
                };
            };

            const collectAllFiles = (node) => {
                const currentFiles = [...(node.files || [])];
                for (const child of node.children || []) {
                    currentFiles.push(...collectAllFiles(child));
                }
                return currentFiles;
            };

            const tree = buildTree(folderPath);
            const allFiles = collectAllFiles(tree);

            const detailData = {
                folderName: folderName,
                path: folderPath,
                workspaceId: this.currentWorkspace.workspaceId,
                scanTime: new Date().toISOString(),
                ...tree
            };

            // 向后兼容 + 明确暴露递归统计结果
            detailData.totalFileCount = allFiles.length;
            detailData.fileCount = allFiles.length;
            detailData.allFiles = allFiles;

            fs.writeFileSync(detailFile, JSON.stringify(detailData, null, 2), 'utf-8');
        } catch (err) {
            console.warn(`[WorkspaceScanner] 生成详细 JSON 失败: ${folderName}`, err.message);
        }
    }

    /**
     * 生成 summary.json（递归统计所有子目录）
     */
    async generateSummary() {
        const now = new Date();
        const oneMonthAgo = new Date(now.getFullYear(), now.getMonth(), 1); // 本月第一天
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30天前
        
        const summary = {
            lastScanTime: now.toISOString(),
            totalFiles: 0,
            folderCount: 0,
            mdFileCount: 0,
            pdfFileCount: 0,
            imageCount: 0,
            otherCount: 0,
            // 本月新增统计
            monthlyNewFiles: 0,
            monthlyNewNotes: 0,
            monthlyNewImages: 0,
            recentFiles: [],
            recentMonthFiles: [], // 最近一个月的文件
            folders: [],
            // 临时变量，写入文件前会删除
            _oneMonthAgo: oneMonthAgo,
            _thirtyDaysAgo: thirtyDaysAgo
        };

        try {
            console.log(`[WorkspaceScanner] 开始生成summary，工作区路径: ${this.currentWorkspace?.workspacePath}`);

            const topFolders = this.getActualFolders();
            summary.folderCount = topFolders.length;

            console.log(`[WorkspaceScanner] 发现 ${topFolders.length} 个顶级文件夹:`, topFolders.map(f => f.name));

            const allFilesAcrossWorkspace = [];

            // 首先统计工作区根目录下的文件
            console.log(`[WorkspaceScanner] 统计工作区根目录: ${this.currentWorkspace.workspacePath}`);
            const rootFiles = this.countFilesInDirectory(this.currentWorkspace.workspacePath, summary, allFilesAcrossWorkspace, 'root');
            console.log(`[WorkspaceScanner] 根目录文件统计完成: ${rootFiles} 个文件`);

            for (const folder of topFolders) {
                const folderPath = folder.path;
                const folderInfo = {
                    name: folder.name,
                    fileCount: 0,
                    totalSize: 0,
                    detailFile: this.getFolderDetailFilename(folderPath)
                };

                console.log(`[WorkspaceScanner] 统计文件夹: ${folder.name} (${folderPath})`);

                if (fs.existsSync(folderPath)) {
                    console.log(`[WorkspaceScanner] 文件夹存在，开始递归统计`);
                    // 递归统计该顶级文件夹下的所有文件
                    const countRecursive = (currentPath) => {
                        let items = [];

                        try {
                            items = fs.readdirSync(currentPath, { withFileTypes: true });
                        } catch (err) {
                            console.warn(`[WorkspaceScanner] 读取目录失败: ${currentPath}`, err.message);
                            return;
                        }

                        for (const item of items) {
                            // 过滤隐藏文件和隐藏文件夹
                            if (item.name.startsWith('.')) continue;

                            if (item.isDirectory()) {
                                countRecursive(path.join(currentPath, item.name));
                            } else if (item.isFile()) {
                                // 跳过可能残留的旧版详细 JSON 文件以及 Sidecar 元数据文件
                                if (item.name.endsWith('.json') && item.name === `${folder.name}.json`) continue;
                                if (item.name.toLowerCase().endsWith('.meta.json')) continue;

                                const filePath = path.join(currentPath, item.name);
                                let stats;

                                try {
                                    stats = fs.statSync(filePath);
                                } catch (err) {
                                    console.warn(`[WorkspaceScanner] 读取文件信息失败: ${filePath}`, err.message);
                                    continue;
                                }

                                const ext = path.extname(item.name).toLowerCase().replace('.', '');

                                summary.totalFiles++;
                                folderInfo.fileCount++;
                                folderInfo.totalSize += stats.size;

                                // 统计文件类型
                                if (['md', 'txt'].includes(ext)) {
                                    summary.mdFileCount++;
                                } else if (ext === 'pdf') {
                                    summary.pdfFileCount++;
                                } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
                                    summary.imageCount++;
                                } else {
                                    summary.otherCount++;
                                }

                                allFilesAcrossWorkspace.push({
                                    name: item.name,
                                    path: filePath,
                                    folder: folder.name,
                                    addedTime: stats.birthtime.toISOString(),
                                    size: stats.size
                                });
                            }
                        }
                    };

                    countRecursive(folderPath);
                } else {
                    console.warn(`[WorkspaceScanner] 文件夹不存在: ${folderPath}`);
                }

                summary.folders.push(folderInfo);
                console.log(`[WorkspaceScanner] 文件夹 ${folder.name} 统计完成: ${folderInfo.fileCount} 个文件`);
            }

            // 全局按添加时间排序，取整个工作区最近5个文件
            allFilesAcrossWorkspace.sort((a, b) => new Date(b.addedTime) - new Date(a.addedTime));
            summary.recentFiles = allFilesAcrossWorkspace.slice(0, 5);
            
            // 筛选最近30天内的文件
            summary.recentMonthFiles = allFilesAcrossWorkspace.filter(file => {
                const fileDate = new Date(file.addedTime);
                return fileDate >= summary._thirtyDaysAgo;
            });

            console.log(`[WorkspaceScanner] 最终统计结果:`, {
                totalFiles: summary.totalFiles,
                folderCount: summary.folderCount,
                mdFileCount: summary.mdFileCount,
                pdfFileCount: summary.pdfFileCount,
                imageCount: summary.imageCount,
                monthlyNewFiles: summary.monthlyNewFiles,
                monthlyNewNotes: summary.monthlyNewNotes,
                recentMonthFilesCount: summary.recentMonthFiles.length
            });
            
            // 删除临时字段
            delete summary._oneMonthAgo;
            delete summary._thirtyDaysAgo;

            fs.writeFileSync(this.summaryFile, JSON.stringify(summary, null, 2), 'utf-8');
            console.log(`[WorkspaceScanner] 已生成 summary.json: ${this.summaryFile}`);
        } catch (err) {
            console.error('[WorkspaceScanner] 生成 summary 失败:', err.message);
        }
    }

    /**
     * 统计指定目录下的文件（不包含子文件夹）
     * @param {string} dirPath - 目录路径
     * @param {Object} summary - 统计对象
     * @param {Array} allFilesAcrossWorkspace - 所有文件列表
     * @param {string} folderName - 文件夹名称
     * @returns {number} 文件数量
     */
    countFilesInDirectory(dirPath, summary, allFilesAcrossWorkspace, folderName) {
        let fileCount = 0;

        try {
            const items = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const item of items) {
                // 过滤隐藏文件
                if (item.name.startsWith('.')) continue;

                if (item.isFile()) {
                    // 跳过JSON配置文件
                    if (item.name.endsWith('.json')) continue;

                    const filePath = path.join(dirPath, item.name);
                    let stats;

                    try {
                        stats = fs.statSync(filePath);
                    } catch (err) {
                        console.warn(`[WorkspaceScanner] 读取文件信息失败: ${filePath}`, err.message);
                        continue;
                    }

                    const ext = path.extname(item.name).toLowerCase().replace('.', '');

                    summary.totalFiles++;
                    fileCount++;

                    // 统计文件类型
                    if (['md', 'txt'].includes(ext)) {
                        summary.mdFileCount++;
                    } else if (ext === 'pdf') {
                        summary.pdfFileCount++;
                    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
                        summary.imageCount++;
                    } else {
                        summary.otherCount++;
                    }

                    const fileInfo = {
                        name: item.name,
                        path: filePath,
                        folder: folderName,
                        addedTime: stats.birthtime.toISOString(),
                        size: stats.size,
                        ext: ext
                    };
                    
                    allFilesAcrossWorkspace.push(fileInfo);
                    
                    // 检查是否为本月新增
                    const fileDate = new Date(stats.birthtime);
                    if (fileDate >= summary._oneMonthAgo) {
                        summary.monthlyNewFiles++;
                        if (['md', 'txt'].includes(ext)) {
                            summary.monthlyNewNotes++;
                        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
                            summary.monthlyNewImages++;
                        }
                    }
                }
                // 注意：这里不递归处理子文件夹，因为子文件夹会在后面的循环中单独处理
            }
        } catch (err) {
            console.warn(`[WorkspaceScanner] 读取目录失败: ${dirPath}`, err.message);
        }

        return fileCount;
    }

    /**
     * 使用 AI 生成文件夹描述
     * @param {string} folderName - 文件夹名称
     * @returns {Promise<string>} 描述文本
     */
    async generateFolderDescription(folderName) {
        try {
            const client = getAIClient('你是一个文件夹分类助手，请根据文件夹名称生成简短的描述。');
            const prompt = `请为名为"${folderName}"的文件夹生成一个简短描述（一句话，不超过50字），说明这个文件夹可能存放什么内容。只返回描述文字，不要其他内容。`;

            const response = await client.ask(prompt, null, 0.3, 100);
            return response.trim();
        } catch (err) {
            console.warn('[WorkspaceScanner] AI 生成描述失败:', err.message);
            return '';
        }
    }

    resolveWorkspace(workspacePath) {
        const normalizedPath = this.normalizeWorkspacePath(workspacePath);
        this.ensureDir(this.workspacesRoot);

        const indexData = this.readJsonSafe(this.indexFile, { version: 1, pathToWorkspaceId: {} });
        const map = indexData.pathToWorkspaceId || {};

        let workspaceId = map[normalizedPath];
        if (workspaceId && !fs.existsSync(path.join(this.workspacesRoot, workspaceId))) {
            workspaceId = null;
        }

        if (!workspaceId) {
            workspaceId = this.findWorkspaceIdByMetadata(normalizedPath);
        }

        if (!workspaceId) {
            workspaceId = this.buildWorkspaceId(workspacePath, normalizedPath);
        }

        map[normalizedPath] = workspaceId;
        this.writeJsonSafe(this.indexFile, {
            version: 1,
            updatedAt: new Date().toISOString(),
            pathToWorkspaceId: map,
        });

        const workspaceDataDir = path.join(this.workspacesRoot, workspaceId);
        this.ensureDir(workspaceDataDir);

        this.writeJsonSafe(path.join(workspaceDataDir, 'workspace.json'), {
            workspaceId,
            workspaceName: path.basename(workspacePath),
            workspacePath,
            normalizedPath,
            updatedAt: new Date().toISOString(),
        });

        return {
            workspaceId,
            normalizedPath,
            workspacePath,
            dataDir: workspaceDataDir,
        };
    }

    findWorkspaceIdByMetadata(normalizedPath) {
        if (!fs.existsSync(this.workspacesRoot)) {
            return null;
        }

        const entries = fs.readdirSync(this.workspacesRoot, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }

            const workspaceId = entry.name;
            const metadataFile = path.join(this.workspacesRoot, workspaceId, 'workspace.json');
            const metadata = this.readJsonSafe(metadataFile, null);

            if (!metadata || !metadata.normalizedPath) {
                continue;
            }

            if (metadata.normalizedPath === normalizedPath) {
                return workspaceId;
            }
        }

        return null;
    }

    buildWorkspaceId(workspacePath, normalizedPath) {
        const baseName = path.basename(workspacePath) || 'workspace';
        const sanitizedBase = baseName
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 40) || 'workspace';

        const hash8 = crypto
            .createHash('sha1')
            .update(normalizedPath)
            .digest('hex')
            .slice(0, 8);

        return `${sanitizedBase}__${hash8}`;
    }

    normalizeWorkspacePath(workspacePath) {
        let normalized = workspacePath;

        try {
            normalized = fs.realpathSync.native(workspacePath);
        } catch (_err) {
            normalized = path.resolve(workspacePath);
        }

        normalized = normalized.replace(/\\+/g, '/');
        normalized = normalized.replace(/\/+$/, '');

        if (process.platform === 'win32') {
            normalized = normalized.toLowerCase();
        }

        return normalized;
    }

    ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    readJsonSafe(filePath, fallback) {
        if (!fs.existsSync(filePath)) {
            return fallback;
        }

        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (err) {
            console.warn(`[WorkspaceScanner] 读取 JSON 失败: ${filePath}`, err.message);
            return fallback;
        }
    }

    writeJsonSafe(filePath, data) {
        this.ensureDir(path.dirname(filePath));
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }
}

module.exports = WorkspaceScanner;