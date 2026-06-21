/**
 * 图床模块导出
 */

const ImageBedAdapter = require('./ImageBedAdapter');
const LocalAdapter = require('./LocalAdapter');
const GitHubAdapter = require('./GitHubAdapter');
const QiniuAdapter = require('./QiniuAdapter');
const AliyunOSSAdapter = require('./AliyunOSSAdapter');
const TencentCOSAdapter = require('./TencentCOSAdapter');
const CustomAdapter = require('./CustomAdapter');
const ImageBedManager = require('./ImageBedManager');

module.exports = {
  ImageBedAdapter,
  LocalAdapter,
  GitHubAdapter,
  QiniuAdapter,
  AliyunOSSAdapter,
  TencentCOSAdapter,
  CustomAdapter,
  ImageBedManager,
};
