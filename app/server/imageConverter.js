/**
 * 图片转换模块 - 支持 HEIC/HEIF 转换为 JPEG
 * 使用 heic-convert 库进行转换（更可靠）
 */

const convert = require('heic-convert');
const { promisify } = require('util');

/**
 * 检查 heic-convert 是否可用
 */
async function checkHeicConvert() {
  try {
    // 尝试加载 heic-convert 模块
    return typeof convert === 'function';
  } catch (error) {
    return false;
  }
}

/**
 * 检查转换工具状态
 */
async function getConverterStatus() {
  const heicConvertAvailable = await checkHeicConvert();
  
  return {
    ok: true,
    available: heicConvertAvailable,
    tools: {
      heicConvert: heicConvertAvailable
    },
    recommended: heicConvertAvailable ? 'heic-convert' : null
  };
}

/**
 * 使用 heic-convert 转换图片
 * @param {Buffer} inputBuffer - 输入图片的 Buffer
 * @param {Object} options - 转换选项
 * @returns {Promise<Buffer>} 转换后的图片 Buffer
 */
async function convertWithHeicConvert(inputBuffer, options = {}) {
  try {
    console.log('使用 heic-convert 进行转换...');
    
    const outputBuffer = await convert({
      buffer: inputBuffer,
      format: (options.format || 'JPEG').toUpperCase(),  // 转换为大写
      quality: (options.quality || 85) / 100  // heic-convert 使用 0-1 的质量值
    });
    
    console.log('heic-convert 转换成功');
    return outputBuffer;
  } catch (error) {
    throw new Error(`heic-convert 转换失败: ${error.message}`);
  }
}

/**
 * 转换图片
 * @param {Buffer} inputBuffer - 输入图片的 Buffer
 * @param {string} originalFilename - 原始文件名
 * @param {Object} options - 转换选项
 * @param {string} options.format - 输出格式，默认 'jpeg'
 * @param {number} options.quality - 质量 (1-100)，默认 85
 * @returns {Promise<Object>} 转换结果
 */
async function convertImage(inputBuffer, originalFilename, options = {}) {
  const path = require('path');
  const ext = path.extname(originalFilename).toLowerCase();
  const inputFormat = ext.replace('.', '');
  
  // 检查是否需要转换
  if (!['.heic', '.heif'].includes(ext)) {
    throw new Error(`不支持的格式: ${ext}`);
  }
  
  // 检查 heic-convert 是否可用
  const heicConvertAvailable = await checkHeicConvert();
  
  if (!heicConvertAvailable) {
    throw new Error('heic-convert 未安装。请运行: npm install heic-convert');
  }
  
  // 设置默认选项
  const convertOptions = {
    format: options.format || 'jpeg',
    quality: options.quality || 85
  };
  
  console.log(`开始转换 ${originalFilename} (${inputFormat} -> ${convertOptions.format})`);
  console.log(`输入大小: ${inputBuffer.length} bytes`);
  
  // 使用 heic-convert 转换
  const outputBuffer = await convertWithHeicConvert(inputBuffer, convertOptions);
  
  console.log(`转换完成: ${inputBuffer.length} bytes -> ${outputBuffer.length} bytes`);
  
  // 计算压缩率
  const compressionRatio = ((1 - outputBuffer.length / inputBuffer.length) * 100).toFixed(2);
  
  return {
    buffer: outputBuffer,
    originalSize: inputBuffer.length,
    convertedSize: outputBuffer.length,
    compressionRatio: `${compressionRatio}%`,
    originalFormat: inputFormat,
    convertedFormat: convertOptions.format
  };
}

module.exports = {
  convertImage,
  getConverterStatus,
  checkHeicConvert
};
