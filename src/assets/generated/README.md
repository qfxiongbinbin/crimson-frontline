# Generated game assets

这些透明 PNG 由 `design/asset-concepts/` 中的概念板生成，并通过
`scripts/process-assets.py` 统一拆分、缩放和生成敌方紫色版本。

- `units/`：玩家与敌方的 6 类单位
- `buildings/`：玩家与敌方的全部建筑、共享的中立维修工厂主体，以及可独立旋转的防御塔炮头
- `terrain/`：4 个地面变体、岩石和金晶矿
- `props/`：沙袋、拒马、弹坑、残骸、补给箱、防御墙和警示灯
- `manifest.ts`：Phaser 加载清单

重新生成：

```bash
python3 scripts/process-assets.py
```

维修工厂主体由 Codex Image 生成并裁成 384×256 透明 PNG，阵营通过运行时维修光效区分。程序化绘制代码仍保留；当外部 PNG 缺失时会自动作为回退贴图使用。
