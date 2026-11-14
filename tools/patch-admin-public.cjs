#!/usr/bin/env node
/**
 * 把 admin 的 H5 产物复制成「公网版」（web-public），供 uniCloud 前端网页托管上传。
 *
 * 为什么需要单独一份：
 * 本地 5180 走 tools/admin-server.cjs 的反向代理（把云地址改成 /admin/cloud），
 * 静态托管没有这个代理，必须直连 https://<spaceId>.api-hz.cloudbasefunction.cn，
 * 并且 uniCloud 只认「前端网页托管默认域名」跨域，所以两份产物不能混用。
 *
 * 用法：
 *   node tools/patch-admin-public.cjs          # 从 dist/build/web 复制并打补丁
 *   node tools/patch-admin-public.cjs --zip    # 顺手压成 admin-hosting.zip
 */
const fs = require('fs')
const path = require('path')

const SPACE_HOST = 'env-00jy72ju8b4z.api-hz.cloudbasefunction.cn'
const SRC = path.resolve('admin/unpackage/dist/build/web')
const OUT = path.resolve('admin/unpackage/dist/build/web-public')

function copyDir(from, to) {
	fs.mkdirSync(to, { recursive: true })
	for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
		const s = path.join(from, entry.name)
		const d = path.join(to, entry.name)
		if (entry.isDirectory()) copyDir(s, d)
		else fs.copyFileSync(s, d)
	}
}

const GUARD = `<script id="__xyyxAdminPatch">
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

if (!fs.existsSync(path.join(SRC, 'index.html'))) {
	console.error('找不到 ' + SRC + '，先跑：cli publish --platform h5 --project F:\\xiaodida\\admin')
	process.exit(1)
}

if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true })
copyDir(SRC, OUT)

let patched = 0
const assets = path.join(OUT, 'assets')
for (const name of fs.readdirSync(assets).filter((f) => f.endsWith('.js'))) {
	const file = path.join(assets, name)
	const before = fs.readFileSync(file, 'utf8')
	const after = before.split('/admin/cloud').join('https://' + SPACE_HOST)
	if (after !== before) {
		fs.writeFileSync(file, after)
		patched++
	}
}

const htmlFile = path.join(OUT, 'index.html')
let html = fs.readFileSync(htmlFile, 'utf8')
html = html.split('/admin/cloud').join('https://' + SPACE_HOST)
if (!html.includes('__xyyxAdminPatch')) html = html.replace('</body>', GUARD + '\n</body>')
fs.writeFileSync(htmlFile, html)

// 自检：静态托管里绝不能残留 /admin/cloud（没有代理会 404）
const leftovers = []
for (const dir of [assets, OUT]) {
	for (const name of fs.readdirSync(dir)) {
		const f = path.join(dir, name)
		if (!fs.statSync(f).isFile()) continue
		if (!/\.(js|html)$/.test(name)) continue
		if (fs.readFileSync(f, 'utf8').includes('/admin/cloud')) leftovers.push(f)
	}
}
if (leftovers.length) {
	console.error('仍有 /admin/cloud 引用：', leftovers)
	process.exit(1)
}

console.log('公网版产物：' + OUT)
console.log('  云函数地址：https://' + SPACE_HOST + '（直连，走前端网页托管默认域名的跨域白名单）')
console.log('  页面基础路径：/admin/（上传到托管根目录下的 admin/ 即可）')
console.log('  替换代理地址的文件数：' + patched)

if (process.argv.includes('--zip')) {
	const zip = path.resolve('admin/unpackage/dist/build/admin-hosting.zip')
	fs.rmSync(zip, { force: true })
	const { execFileSync } = require('child_process')
	execFileSync('powershell.exe', ['-NoProfile', '-Command',
		`Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zip}' -Force`], { stdio: 'inherit' })
	console.log('已打包：' + zip)
}
