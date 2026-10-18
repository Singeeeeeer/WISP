"""Explicit, bounded synthetic compatibility probe; never prints response text or secrets."""
import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps' / 'api'))
from app.config import load_settings
from app.check_contract import supplier_schema
import httpx

logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('httpcore').setLevel(logging.WARNING)
LIMIT = 1024 * 1024
STATUSES = {'completed', 'in_progress', 'incomplete', 'failed', 'cancelled', 'requires_action'}
STEP_TYPES = {'model_output', 'thought', 'function_call', 'function_result'}
CONTENT_TYPES = {'text', 'image', 'audio', 'video', 'document', 'thought'}
ERROR_CODES = {'invalid_request', 'INVALID_ARGUMENT', 'NOT_FOUND', 'UNAUTHENTICATED',
               'PERMISSION_DENIED', 'RESOURCE_EXHAUSTED', 'INTERNAL', 'UNAVAILABLE'}


def typed_counts(items, allowed):
    counts = {}
    if not isinstance(items, list):
        return counts
    for item in items:
        kind = item.get('type') if isinstance(item, dict) else None
        kind = kind if isinstance(kind, str) and kind in allowed else 'other'
        counts[kind] = counts.get(kind, 0) + 1
    return counts


def safe_shape(data):
    if not isinstance(data, dict):
        return {'json_object': False}
    steps = data.get('steps')
    outputs = data.get('outputs')
    parts = []
    if isinstance(steps, list):
        for step in steps:
            if isinstance(step, dict) and step.get('type') == 'model_output' and isinstance(step.get('content'), list):
                parts.extend(step['content'])
    if isinstance(outputs, list):
        parts.extend(outputs)
    status = data.get('status')
    report = {
        'json_object': True,
        'interaction_status': status if isinstance(status, str) and status in STATUSES else 'other',
        'has_model': isinstance(data.get('model'), str) and bool(data['model'].strip()),
        'has_steps': isinstance(steps, list),
        'has_outputs': isinstance(outputs, list),
        'step_types': typed_counts(steps, STEP_TYPES),
        'content_types': typed_counts(parts, CONTENT_TYPES),
        'has_text': any(isinstance(p, dict) and p.get('type') == 'text' and isinstance(p.get('text'), str) for p in parts),
        'has_usage': isinstance(data.get('usage'), dict),
    }
    err = data.get('error')
    if isinstance(err, dict):
        code = err.get('code')
        report['error_code'] = code if type(code) is int and 0 <= code <= 999 else (code if isinstance(code, str) and code in ERROR_CODES else 'other')
        status = err.get('status')
        report['error_status'] = status if isinstance(status, str) and status in ERROR_CODES else 'other'
    return report


async def probe(settings, stage, schema=False, full_schema=False):
    payload = {
        'model': settings.model,
        'input': '合成测试：请回复一个简短问候。' if not schema else '合成测试：请返回一个包含简短问候的 JSON 对象，字段为 message。',
        'store': False,
        'generation_config': {'thinking_level': 'low', 'max_output_tokens': 1024},
    }
    if schema:
        payload['response_format'] = {'type': 'text', 'mime_type': 'application/json',
            'schema': {'type': 'object', 'properties': {'message': {'type': 'string'}}, 'required': ['message']}}
    if full_schema:
        payload['response_format']['schema'] = supplier_schema()
    report = {'stage': stage}
    try:
        async with asyncio.timeout(settings.timeout):
            async with httpx.AsyncClient(timeout=settings.timeout, follow_redirects=False, trust_env=False) as client:
                async with client.stream('POST', 'https://generativelanguage.googleapis.com/v1beta/interactions',
                        headers={'x-goog-api-key': settings.api_key}, json=payload) as response:
                    report['http_status'] = response.status_code
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(body) + len(chunk) > LIMIT:
                            report['response_oversized'] = True
                            print(json.dumps(report))
                            return False
                        body.extend(chunk)
        report['response_bytes'] = len(body)
        try:
            data = json.loads(body)
        except (ValueError, UnicodeError):
            report['json_valid'] = False
            print(json.dumps(report))
            return False
        report['json_valid'] = True
        report.update(safe_shape(data))
        success = report.get('http_status') == 200 and report.get('interaction_status') == 'completed' and report.get('has_text', False)
        report['protocol_success'] = success
        print(json.dumps(report))
        return success
    except (TimeoutError, httpx.TimeoutException):
        report['failure'] = 'timeout'
    except httpx.TransportError:
        report['failure'] = 'network'
    except Exception:
        report['failure'] = 'probe_failure'
    print(json.dumps(report))
    return False


async def main():
    parser = argparse.ArgumentParser(description='Explicit synthetic Gemini protocol compatibility probe')
    parser.add_argument('--config', required=True)
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--full-schema', action='store_true', help='Run only one full-contract schema probe')
    args = parser.parse_args()
    settings = load_settings({'WISP_ENV_FILE': args.config})
    print(json.dumps({'configured': settings.configured, 'live': args.live,
                      'probe_api_version': 'v1beta', 'maximum_requests': 1 if args.full_schema else 2}))
    if not args.live:
        return 0
    if not settings.configured:
        return 1
    if args.full_schema:
        return 0 if await probe(settings, 'full_json_schema', schema=True, full_schema=True) else 1
    if not await probe(settings, 'minimal_text'):
        return 1
    return 0 if await probe(settings, 'minimal_json_schema', schema=True) else 1


if __name__ == '__main__':
    try:
        sys.exit(asyncio.run(main()))
    except Exception:
        print('{"failure":"probe_failure"}')
        sys.exit(1)


