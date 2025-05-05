#!/usr/bin/env node

/**
 * 批量导入文档脚本
 * 使用方法: node bulk-import.js <projectId> <documentsDir> [fileExtensions]
 * 
 * 示例: 
 * - 导入所有支持的文件: node bulk-import.js 1679012345678 ./my-docs
 * - 仅导入指定类型: node bulk-import.js 1679012345678 ./my-docs md,txt
 * - 强制使用特定后缀: node bulk-import.js 1679012345678 ./my-docs txt=md
 *   (将.txt文件作为.md文件上传，解决API仅接受.md文件的限制)
 */

const fs = require('fs').promises;
const path = require('path');
const { readFile } = require('fs').promises;
const { statSync } = require('fs');

// 检查命令行参数
if (process.argv.length < 4) {
  console.error('使用方法: node bulk-import.js <projectId> <documentsDir> [fileExtensions]');
  process.exit(1);
}

const projectId = process.argv[2];
const documentsDir = process.argv[3];
const fileExtParam = process.argv[4];

// 默认支持的文件类型
let SUPPORTED_EXTENSIONS = ['.md', '.txt', '.docx', '.pdf'];
let EXTENSION_MAPPING = {}; // 后缀映射，例如 {'.txt': '.md'} 将txt作为md上传

// 解析用户指定的文件类型
if (fileExtParam) {
  // 解析后缀参数
  const extensions = fileExtParam.split(',');
  
  // 处理普通后缀和映射后缀（如 txt=md）
  SUPPORTED_EXTENSIONS = extensions.map(ext => {
    // 检查是否有映射关系
    if (ext.includes('=')) {
      const [from, to] = ext.split('=');
      const fromExt = from.startsWith('.') ? from : `.${from}`;
      const toExt = to.startsWith('.') ? to : `.${to}`;
      EXTENSION_MAPPING[fromExt] = toExt;
      return fromExt;
    }
    // 普通后缀，添加.前缀如果没有
    return ext.startsWith('.') ? ext : `.${ext}`;
  });
}

console.log('支持的文件类型:', SUPPORTED_EXTENSIONS);
if (Object.keys(EXTENSION_MAPPING).length > 0) {
  console.log('文件类型映射:', EXTENSION_MAPPING);
}

// 递归扫描目录
async function scanDirectory(dirPath) {
  const allFiles = [];
  
  // 读取目录内容
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      // 递归处理子目录
      const subDirFiles = await scanDirectory(fullPath);
      allFiles.push(...subDirFiles);
    } else if (entry.isFile()) {
      // 添加文件
      allFiles.push(fullPath);
    }
  }
  
  return allFiles;
}

// 上传单个文件
async function uploadFile(filePath, projectId) {
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();
  let uploadFileName = fileName;
  
  // 检查是否需要重新映射文件扩展名
  if (EXTENSION_MAPPING[ext]) {
    const baseName = path.basename(fileName, ext);
    uploadFileName = `${baseName}${EXTENSION_MAPPING[ext]}`;
    console.log(`映射文件: ${fileName} -> ${uploadFileName}`);
  }
  
  const fileContent = await readFile(filePath);
  
  console.log(`正在上传: ${fileName} (${(fileContent.length/1024).toFixed(2)} KB)`);
  
  try {
    const response = await fetch(`http://localhost:1717/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-file-name': encodeURIComponent(uploadFileName)
      },
      body: fileContent
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`上传失败: ${errorData.error || response.statusText}`);
    }
    
    const result = await response.json();
    console.log(`✅ 上传成功: ${fileName}`);
    return result;
  } catch (error) {
    console.error(`❌ 上传失败 ${fileName}: ${error.message}`);
    return null;
  }
}

// 主函数
async function main() {
  try {
    // 检查目录是否存在
    await fs.access(documentsDir);
    
    console.log(`开始扫描目录: ${documentsDir}`);
    
    // 递归扫描所有文件
    const allFiles = await scanDirectory(documentsDir);
    
    // 过滤出支持的文件类型
    const supportedFiles = allFiles.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return SUPPORTED_EXTENSIONS.includes(ext);
    });
    
    if (supportedFiles.length === 0) {
      console.log(`没有找到支持的文件类型。当前支持: ${SUPPORTED_EXTENSIONS.join(', ')}`);
      process.exit(0);
    }
    
    console.log(`找到 ${supportedFiles.length} 个支持的文件 (共 ${allFiles.length} 个文件)`);
    
    // 批量上传文件
    const results = [];
    for (const filePath of supportedFiles) {
      const result = await uploadFile(filePath, projectId);
      if (result) results.push(result);
    }
    
    console.log(`\n批量导入完成: ${results.length}/${supportedFiles.length} 文件上传成功`);
  } catch (error) {
    console.error('批量导入失败:', error.message);
    process.exit(1);
  }
}

main(); 