from __future__ import annotations

import re
from typing import Any

PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    ("phone", re.compile(r"(?<!\d)(?:1[3-9]\d{9}|(?:\+|00)\d[\d -]{7,18}\d)(?!\d)"), "[手机号]"),
    ("email", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[邮箱]"),
    ("id_card", re.compile(r"(?<![0-9Xx])[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9Xx](?![0-9Xx])"), "[身份证]"),
    ("wechat", re.compile(r"(?i)(?:微信|wechat)[:：\s_-]*[a-z][-_a-z0-9]{5,19}"), "[微信号]"),
    ("qq", re.compile(r"(?i)(?:qq)[:：\s_-]*[1-9]\d{4,11}"), "[QQ号]"),
    ("bank_card", re.compile(r"(?<!\d)(?:\d[ -]?){15,19}(?!\d)"), "[银行卡]"),
    ("address", re.compile(r"[^，。,.\s]{2,12}(?:省|市|区|县|路|街|号)[^，。,.]{0,20}"), "[详细地址]"),
    ("name", re.compile(r"(?<![\u4e00-\u9fff])[张王李赵刘陈杨黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文][\u4e00-\u9fff]{1,2}(?![\u4e00-\u9fff])"), "[姓名]"),
]


def redact_text(text: str, custom_words: list[str] | None = None) -> tuple[str, list[str]]:
    flags: list[str] = []
    value = text or ""
    for name, pattern, replacement in PATTERNS:
        value, count = pattern.subn(replacement, value)
        if count:
            flags.extend([name] * count)
    for word in custom_words or []:
        if word and word in value:
            value = value.replace(word, "[自定义敏感词]")
            flags.append("custom")
    return value, flags


def redact_records(records: list[dict[str, Any]], custom_words: list[str] | None = None) -> tuple[list[dict[str, Any]], int]:
    output: list[dict[str, Any]] = []
    count = 0
    aliases: dict[str, str] = {}
    for record in records:
        role = record.get("sender_role")
        name = str(record.get("sender_name") or "").strip()
        if name:
            aliases[name] = "[销售姓名]" if role == "salesperson" else "[客户姓名]"
    for record in records:
        item = dict(record)
        content, flags = redact_text(str(item.get("content") or ""), custom_words)
        for name, alias in aliases.items():
            if name and name in content:
                content = content.replace(name, alias)
                flags.append("name")
        item["content"] = content
        item["sender_name"] = None
        item["sender_alias"] = "[销售姓名]" if record.get("sender_role") == "salesperson" else "[客户姓名]"
        item["redaction_flags"] = list(dict.fromkeys(flags))
        count += len(flags)
        output.append(item)
    return output, count
