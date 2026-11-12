const fs = require('fs')
const file = process.argv[2]
const keys = process.argv.slice(3)
const s = fs.readFileSync(file, 'utf8')
for (const k of keys) {
  const i = s.indexOf(k)
  console.log('===', k, i)
  if (i >= 0) console.log(s.slice(i, i + 1500))
}
