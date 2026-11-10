// 자가 점검: DB와 직원 명부가 정상인지 확인한다.
import { db } from './db.js';
const n = db.prepare('SELECT COUNT(*) AS n FROM employees').get().n;
const names = db.prepare('SELECT name, title FROM employees ORDER BY rowid').all();
console.log(`직원 ${n}명 등록됨:`);
for (const e of names) console.log(`  - ${e.name} (${e.title})`);
console.log(n === 8 ? '\n점검 통과: 정상입니다.' : '\n주의: 직원 수가 예상(8명)과 다릅니다.');
process.exit(n === 8 ? 0 : 1);
