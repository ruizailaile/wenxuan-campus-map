"""
校园底图构建脚本（v5 · 旧版线稿原图版）
=============================================
底图 = 校园总平面渲染图（1642×958）整幅。
原图自带完整导视标注（红色楼栋编号/场所名称圆牌、蓝线社会车辆通道、
红虚线师生通道、图例），因此不再叠加任何绘制，仅做裁剪与压缩。

数据坐标映射（校准基准，1 单位 ≈ 1 米）：
  裁剪原点 zip(600, 50)，比例 data_x = px*1000/1642, data_y = py*583/958
  即整幅 1642×958 ↔ 数据 1000×583
  campus-data.js 中全部 48 个地点坐标即按此标定（50 单位网格逐栋核对）
"""
from PIL import Image
import os

SRC = os.path.join(os.path.dirname(__file__), 'masterplan_render_src.png')
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'campus-map.jpg')

im = Image.open(SRC).convert('RGB')
print(f'旧版线稿原图: {im.size[0]}x{im.size[1]}')
im.save(OUT, 'JPEG', quality=85, optimize=True, progressive=True)
print(f'输出: {os.path.normpath(OUT)}  {os.path.getsize(OUT)//1024}KB')
