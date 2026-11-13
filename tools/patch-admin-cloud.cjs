const fs = require('fs')
const path = require('path')

const root = path.resolve('admin/unpackage/dist/build/web')
const dir = path.join(root, 'assets')

for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const file = path.join(dir, name)
  let s = fs.readFileSync(file, 'utf8')
  const before = s
  s = s.split('https://env-00jy72ju8b4z.api-hz.cloudbasefunction.cn').join('/admin/cloud')
  s = s.replace(
    'if(!/^https:\\/\\//.test(e.endpoint)&&!/^\\/admin\\/cloud/.test(e.endpoint))throw new Error("endpoint must start with https://")',
    'if(false)throw new Error("endpoint must start with https://")'
  )
  s = s.replace(
    'if(!/^https:\\/\\//.test(e.endpoint))throw new Error("endpoint must start with https://")',
    'if(false)throw new Error("endpoint must start with https://")'
  )
  if (s !== before) {
    fs.writeFileSync(file, s)
    console.log('patched', name)
  }
}

const htmlFile = path.join(root, 'index.html')
let html = fs.readFileSync(htmlFile, 'utf8')
if (!html.includes('__xyyxAdminPatch')) {
  const script = `<script id="__xyyxAdminPatch">
(function(){
  function install(){
    if (!window.uni || !uni.showModal) return setTimeout(install, 50);
    if (uni.showModal.__xyyxPatched) return;
    var orig = uni.showModal;
    uni.showModal = function(opts){
      var text = opts && opts.content ? String(opts.content) : '';
      if (text.indexOf('用户函数代码语法或逻辑异常') >= 0) {
        return Promise.resolve({ confirm: false, cancel: true });
      }
      return orig.call(this, opts);
    };
    uni.showModal.__xyyxPatched = true;
  }
  install();
})();
</script>`
  html = html.replace('</body>', script + '\n</body>')
  fs.writeFileSync(htmlFile, html)
  console.log('injected modal guard')
}
