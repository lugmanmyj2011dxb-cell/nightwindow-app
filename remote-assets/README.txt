本次更新内容：
1. scenes-manifest.json —— 替换 remote-assets/scenes-manifest.json（新增17个场景，共87个）
2. new-videos/ —— 17个新场景视频，放入 remote-assets/ 目录即可（与 manifest 中的 video 字段对应）

本批次处理：上传25个视频，接受17个，拒绝8个（4个AI/CG合成内容，4个明亮白天且人物密集不符合助眠氛围）。
所有接受视频已：压缩(854px/yuv420p/crf30)、亮度核查（统一在适合助眠的暗度范围内）、冷色调夜间调色、
按内容分配到现有分组(travelRows/moreRows/cabinRows/glimmerRows/starryRows/moreSnowRows)、
配置了与助眠主题匹配的合成音效参数（wind/rain/fire三种现有类型）、补全16种语言场景名称。
