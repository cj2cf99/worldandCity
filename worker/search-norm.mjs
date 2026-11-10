// 检索规范化（设计 §4.2「搜索」；S1 结论见 docs/decisions/0001）。
// 全半角、大小写、去空白与标点（含 % 和 _，因此规范化后的词不会成为 LIKE 通配符）。
export function normalize(s) {
  return String(s).normalize('NFKC').toLowerCase().replace(/[\s\p{P}]+/gu, '');
}
