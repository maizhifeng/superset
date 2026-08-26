#!/usr/bin/env python3
"""字体镜像可加载性验证（L4 固定流程的脚本形态）。

    python3 verify_font.py "Noto Sans SC" [--wght "400;500;600;700"] [--repeat 2]

对 https://miaoda.feishu.cn/fonts/css2 请求 N 次（镜像多字重响应不稳定，默认复测 2 次），
解析每次返回的 @font-face font-weight 集合，输出：

  run 1: 400,500,600,700
  run 2: 400
  verdict: usable=400  unstable=500,600,700

usable = 每次都返回的字重（可放心用）；unstable = 时有时无（按浏览器合成加粗处理并记 gaps）；
全部请求失败 = 该族不可加载，走 font-fallback.yaml 降级。exit 0 = 至少一档 usable。
"""
import argparse
import re
import sys
import urllib.parse
import urllib.request

MIRROR = "https://miaoda.feishu.cn/fonts/css2"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")


def fetch_weights(family, wght):
    spec = family.replace(" ", "+") + (":wght@" + wght if wght else "")
    url = "%s?%s&display=swap" % (MIRROR, urllib.parse.quote("family=" + spec, safe="=+&:;@"))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as r:
        css = r.read().decode("utf-8", "replace")
    if "@font-face" not in css:
        return None
    return sorted(set(re.findall(r"font-weight:\s*(\d+)", css)), key=int)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("family")
    ap.add_argument("--wght", default="400;500;600;700")
    ap.add_argument("--repeat", type=int, default=2)
    a = ap.parse_args()

    runs = []
    for i in range(a.repeat):
        try:
            w = fetch_weights(a.family, a.wght)
        except Exception as exc:
            w = None
            print("run %d: 请求失败（%s）" % (i + 1, exc.__class__.__name__))
            runs.append(set())
            continue
        print("run %d: %s" % (i + 1, ",".join(w) if w else "无 @font-face"))
        runs.append(set(w or []))

    usable = set.intersection(*runs) if runs else set()
    unstable = set.union(*runs) - usable if runs else set()
    if usable:
        print("verdict: usable=%s%s" % (",".join(sorted(usable, key=int)),
              "  unstable=" + ",".join(sorted(unstable, key=int)) if unstable else ""))
        return 0
    print("verdict: 不可加载 —— 查 font-fallback.yaml 降级，原始名留栈首 + 记 gaps")
    return 1


if __name__ == "__main__":
    sys.exit(main())
