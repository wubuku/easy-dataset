// 最佳实践配置示例
module.exports = {
    experimental: {
      serverComponentsExternalPackages: ['@opendocsg/pdf2md','pdfjs-dist'],
    },
    webpack: (config, { isServer }) => {
      if (!isServer) {
        config.externals.push({
          'unpdf': 'window.unpdf',
          'pdfjs-dist': 'window.pdfjsLib'
        })
      }
      
      if (isServer) {
        config.externals.push({
          'canvas': 'commonjs canvas',
          'canvas-prebuilt': 'commonjs canvas-prebuilt'
        });
      }
      
      return config
    }
  }