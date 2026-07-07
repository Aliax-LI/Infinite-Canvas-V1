const PYTHON_VERSION = '3.12.8';

const PIP_MIRRORS = [
  {
    index: 'https://pypi.tuna.tsinghua.edu.cn/simple',
    host: 'pypi.tuna.tsinghua.edu.cn'
  },
  {
    index: 'https://mirrors.aliyun.com/pypi/simple',
    host: 'mirrors.aliyun.com'
  }
];

function WINDOWS_PYTHON_URLS(arch) {
  const zip = `python-${PYTHON_VERSION}-embed-${arch}.zip`;
  return [
    `https://npmmirror.com/mirrors/python/${PYTHON_VERSION}/${zip}`,
    `https://www.python.org/ftp/python/${PYTHON_VERSION}/${zip}`
  ];
}

function MAC_MINIFORGE_URLS(arch) {
  const file = `Miniforge3-MacOSX-${arch}.sh`;
  return [
    `https://mirrors.tuna.tsinghua.edu.cn/github-release/conda-forge/miniforge/LatestRelease/${file}`,
    `https://github.com/conda-forge/miniforge/releases/latest/download/${file}`
  ];
}

const NPM_REGISTRY = 'https://registry.npmmirror.com';

module.exports = {
  PYTHON_VERSION,
  PIP_MIRRORS,
  NPM_REGISTRY,
  WINDOWS_PYTHON_URLS,
  MAC_MINIFORGE_URLS
};
