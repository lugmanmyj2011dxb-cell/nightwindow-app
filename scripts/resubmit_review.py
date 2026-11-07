"""Build 到位后重新提交 1.0 审核（App Store Connect API）。

背景：2026-11-07 发现付费墙价格与商店实际扣款不一致（年付 $46.99 vs $49.99，
中国区 ¥168 vs ¥328），已撤回审核、修好代码，等新构建上传后用它一键重新提交。

用法：
    python3 scripts/resubmit_review.py          # 自动取最新 VALID 构建
    python3 scripts/resubmit_review.py 11       # 指定构建号

依赖：/tmp/asc_lib.py 里的 req()（ES256 JWT + ASC API key）。
"""
import sys

from asc_lib import req

APP_ID = '6831017938'
VERSION_ID = '5f19676b-092d-4e77-97a8-da9dd9708c48'

# 商品 ID 和"版本 ID"不是一个东西，这几个是 GET .../versions 拿到的版本 ID
IAP_VERSIONS = [
    '81102ec6-880e-47b9-b0b1-42ecb65ae3ff',   # nightwindow_lifetime
    'a2886c2c-00ba-401d-93bc-b37d3a21145e',   # nightwindow_diamond
    'efdd30a1-eb19-4316-ae64-8b97e64c57d1',   # nightwindow_lifetime_upgrade_from_yearly
]
SUB_VERSIONS = [
    'fe66a4a8-a1a5-4fec-a579-8033a0849c77',   # nightwindow_monthly
    '9bb547f5-eccf-4c5c-8787-15c8559ae6b3',   # nightwindow_yearly
]
# 订阅组还没有已批准版本时必须随组版本一起提交，否则报
# "SubscriptionVersion must be submitted with its subscription group version"
GROUP_VERSION = 'ca29f368-0ae9-4ad0-8e6f-021f6d23e690'


def find_build(want=None):
    if want:
        s, d = req('GET', '/v1/builds?filter[app]=%s&filter[version]=%s&limit=10' % (APP_ID, want))
        for b in d.get('data', []):
            if b['attributes'].get('processingState') == 'VALID':
                return b['id'], want
        raise SystemExit('构建 %s 还没处理完或不存在' % want)

    s, d = req('GET', '/v1/builds?filter[app]=%s&limit=20&sort=-uploadedDate' % APP_ID)
    if s != 200:
        raise SystemExit('读取构建失败: %s %s' % (s, d))
    for b in d.get('data', []):
        if b['attributes'].get('processingState') == 'VALID':
            return b['id'], b['attributes'].get('version')
    raise SystemExit('没有可用的 VALID 构建')


def main():
    build_id, build_no = find_build(sys.argv[1] if len(sys.argv) > 1 else None)

    s, d = req('PATCH', '/v1/appStoreVersions/%s/relationships/build' % VERSION_ID,
               {'data': {'type': 'builds', 'id': build_id}})
    print('绑定构建 %s: %s' % (build_no, s))
    if s >= 400:
        raise SystemExit(d)

    s, d = req('POST', '/v1/reviewSubmissions', {'data': {
        'type': 'reviewSubmissions',
        'attributes': {'platform': 'IOS'},
        'relationships': {'app': {'data': {'type': 'apps', 'id': APP_ID}}},
    }})
    if s >= 400:
        raise SystemExit('创建提交失败: %s %s' % (s, d))
    sub_id = d['data']['id']
    print('reviewSubmission', sub_id)

    items = [({'type': 'appStoreVersions', 'id': VERSION_ID}, 'appStoreVersion')]
    items += [({'type': 'inAppPurchaseVersions', 'id': i}, 'inAppPurchaseVersion') for i in IAP_VERSIONS]
    items += [({'type': 'subscriptionVersions', 'id': i}, 'subscriptionVersion') for i in SUB_VERSIONS]
    items += [({'type': 'subscriptionGroupVersions', 'id': GROUP_VERSION}, 'subscriptionGroupVersion')]

    for data_item, rel in items:
        s, d = req('POST', '/v1/reviewSubmissionItems', {'data': {
            'type': 'reviewSubmissionItems',
            'relationships': {
                'reviewSubmission': {'data': {'type': 'reviewSubmissions', 'id': sub_id}},
                rel: {'data': data_item},
            },
        }})
        print('  条目 %-26s %s' % (rel, s if s < 400 else str(d)[:200]))

    s, d = req('PATCH', '/v1/reviewSubmissions/%s' % sub_id,
               {'data': {'type': 'reviewSubmissions', 'id': sub_id, 'attributes': {'submitted': True}}})
    print('提交:', s, d.get('data', {}).get('attributes') if s == 200 else str(d)[:300])

    s, d = req('GET', '/v1/appStoreVersions/%s?fields[appStoreVersions]=appStoreState' % VERSION_ID)
    print('版本状态:', d.get('data', {}).get('attributes'))


if __name__ == '__main__':
    main()
