"""Bounded Gemini Interactions request. Supplier output is always untrusted."""
import asyncio
import json
import logging
from time import perf_counter
import httpx

# Never allow the transport's DEBUG log to print authentication headers.
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('httpcore').setLevel(logging.WARNING)

class ModelFailure(Exception):
    def __init__(self, code, status=502):
        self.code, self.status = code, status
        super().__init__(code)

USAGE_KEYS=('total_input_tokens','total_output_tokens','total_thought_tokens','total_cached_tokens','total_tool_use_tokens','total_tokens')


def strict_json(raw):
    def pairs(items):
        result={}
        for key,value in items:
            if key in result: raise ValueError('Duplicate key')
            result[key]=value
        return result
    def constant(value): raise ValueError('Invalid JSON constant')
    return json.loads(raw,object_pairs_hook=pairs,parse_constant=constant)


async def generate(settings, transport, source_input, system, schema, prompt_version):
    cfg=settings
    if not cfg.configured: raise ModelFailure('MODEL_NOT_CONFIGURED',503)
    started=perf_counter()
    payload={'model':cfg.model,'store':False,
        'input':json.dumps(source_input,ensure_ascii=False),
        'system_instruction':system,
        'response_format':{'type':'text','mime_type':'application/json','schema':schema},
        'generation_config':{'max_output_tokens':16384}}
    try:
        async with asyncio.timeout(cfg.timeout):
            async with httpx.AsyncClient(timeout=cfg.timeout,transport=transport,follow_redirects=False,trust_env=False) as client:
                async with client.stream('POST',f'https://generativelanguage.googleapis.com/{cfg.api_version}/interactions',
                        headers={'x-goog-api-key':cfg.api_key},json=payload) as response:
                    status=response.status_code
                    if status in (401,403): raise ModelFailure('MODEL_AUTH_FAILED')
                    if status==404: raise ModelFailure('MODEL_NOT_FOUND')
                    if status==429: raise ModelFailure('MODEL_QUOTA_EXCEEDED',503)
                    if status>=500: raise ModelFailure('MODEL_UNAVAILABLE',503)
                    if status!=200: raise ModelFailure('MODEL_OUTPUT_INVALID')
                    body=bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(body)+len(chunk)>1024*1024: raise ModelFailure('MODEL_OUTPUT_INVALID')
                        body.extend(chunk)
        data=strict_json(body)
        if data.get('status')!='completed': raise ValueError('Incomplete')
        model=data.get('model')
        if not isinstance(model,str) or not model.strip() or len(model)>200: raise ValueError('Missing model')
        if 'steps' in data and 'outputs' in data: raise ValueError('Ambiguous output')
        if 'steps' in data:
            steps=data['steps']
            if not isinstance(steps,list) or not steps: raise ValueError('Missing steps')
            parts=[]
            for step in steps:
                if step.get('type')=='model_output': parts.extend(step['content'])
                elif step.get('type')!='thought': raise ValueError('Unexpected tool step')
        else: parts=data['outputs']
        if not isinstance(parts,list) or not parts or any(part.get('type')!='text' for part in parts): raise ValueError('Invalid text')
        metadata={'modelId':model,'promptVersion':prompt_version,'validatorVersion':'quote-occurrence-utf16-1',
                  'durationMs':round((perf_counter()-started)*1000,3)}
        if 'usage' in data:
            if not isinstance(data['usage'],dict): raise ValueError('Invalid usage')
            usage={key:value for key,value in data['usage'].items() if key in USAGE_KEYS}
            if any(type(value) is not int or not 0 <= value <= 9007199254740991 for value in usage.values()): raise ValueError('Invalid usage')
            if usage: metadata['usage']=usage
        return strict_json(''.join(part['text'] for part in parts)), metadata
    except ModelFailure: raise
    except (TimeoutError,httpx.TimeoutException): raise ModelFailure('MODEL_TIMEOUT',504) from None
    except httpx.TransportError: raise ModelFailure('MODEL_CONNECTION_CLOSED',503) from None
    except (ValueError,KeyError,TypeError,AttributeError,UnicodeError): raise ModelFailure('MODEL_OUTPUT_INVALID') from None


