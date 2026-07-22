function normalizeGatewayPrefix(prefix) {
  const value = String(prefix || '').trim();
  if (!value || value === '/') return '';
  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

function stripGatewayPrefix(pathname, gatewayPrefix) {
  const path = pathname || '/';
  if (!gatewayPrefix) return path;
  if (path === gatewayPrefix) return '/';
  if (path.startsWith(`${gatewayPrefix}/`)) {
    return path.slice(gatewayPrefix.length) || '/';
  }
  return path;
}

function getPublicBasePath(gatewayPrefix) {
  return gatewayPrefix ? `${gatewayPrefix}/` : '/';
}

module.exports = {
  getPublicBasePath,
  normalizeGatewayPrefix,
  stripGatewayPrefix,
};
