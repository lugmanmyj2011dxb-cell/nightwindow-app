# 声库扩编 v3 · Wave A 任务清单

依 spec.md 执行，顺序如下（每步完成后勾选）：

- [ ] T1 voice creators：index.html createFireVoice 后插入 10 个新 creator + createRainVoice 加 echo 支路
- [ ] T2 buildSynthVoice 追加 10 行 kind 分发
- [ ] T3 SOUND_DEFS 尾部追加 56 款定义
- [ ] T4 HTML 插 6 个分组容器 div + ROW_CONTAINERS 加 6 条映射
- [ ] T5 canvas：6 个新场景函数 + 4 个新 helper + drawScene 别名改造
- [ ] T6 remote-scenes.js：validGroups + kind 分发 + 头注释
- [ ] T7 i18n：Python 脚本注入 62 键×25 语言（避开撇号）
- [ ] T8 全量验证（spec.md「验证」节 5 项）

验证命令：
- `node --check www/js/i18n.js && node --check www/js/remote-scenes.js`
- index.html 内联 script 提取 new Function 检查
- i18n 键计数：每键 25 次
- SOUND_DEFS id 去重计数 = 78
