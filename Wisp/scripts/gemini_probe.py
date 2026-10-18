"""Explicit synthetic live probe. Configuration contents are never printed."""
import argparse
import asyncio
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'apps'/'api'))
from app.config import load_settings
from app.main import create_app
import httpx

async def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--config',required=True)
    parser.add_argument('--live',action='store_true')
    args=parser.parse_args()
    settings=load_settings({'WISP_ENV_FILE':args.config})
    safe={'configured':settings.configured,'key_present':bool(settings.api_key),'model':settings.model,'api_version':settings.api_version,'timeout_seconds':settings.timeout}
    if not args.live:
        print(json.dumps(safe,ensure_ascii=False));return
    text='书店活动提案（合成测试材料）\n活动于11月8日开放。海报于11月10日定稿，随后开放报名。\n预算为8000元，场地、印刷与物料报价合计6500元。'
    now=datetime.now(timezone.utc).isoformat()
    request={'snapshot':{'id':str(uuid.uuid4()),'materialId':'synthetic-gemini-probe','materialVersion':1,'title':'合成书店提案','text':text,'start':0,'end':len(text.encode('utf-16-le'))//2,'capturedAt':now,'source':'virtual_document'},'instruction':'请核对时间安排疑点，区分原文有依据的问题与待补充信息，并给出修改建议。'}
    diagnostics={}
    class DiagnosticTransport(httpx.AsyncBaseTransport):
        def __init__(self): self.inner=httpx.AsyncHTTPTransport()
        async def handle_async_request(self, request):
            response=await self.inner.handle_async_request(request)
            diagnostics['provider_http_status']=response.status_code
            body=await response.aread()
            try:
                data=json.loads(body)
                diagnostics['response_keys']=list(data.keys()) if isinstance(data,dict) else []
                if isinstance(data,dict) and isinstance(data.get('error'),dict):
                    err=data['error']
                    diagnostics['provider_error_code']=err.get('code')
                    diagnostics['provider_error_status']=err.get('status')
                    message=str(err.get('message','')).replace(settings.api_key,'[REDACTED]')
                    diagnostics['provider_error_message']=message[:700]
                elif isinstance(data,dict):
                    diagnostics['completion_status']=data.get('status')
                    diagnostics['model_present']=bool(data.get('model'))
            except Exception: diagnostics['json_response']=False
            return response
        async def aclose(self): await self.inner.aclose()
    api=create_app(settings,transport=DiagnosticTransport())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=api),base_url='http://wisp-probe') as client:
        response=await client.post('/api/check',json=request,timeout=195)
        result=response.json()
        report={'sample_kind':'synthetic, not user research data','started_at_utc':now,'configuration':safe,'http_status':response.status_code,'diagnostics':diagnostics,'request':request,'response':result}
        out=ROOT/'docs'/('gemini-live-probe-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
        out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'http_status':response.status_code,'saved_report':str(out),'metadata':result.get('metadata'),'outcome':result.get('outcome'),'error_code':result.get('error',{}).get('code'),'diagnostics':diagnostics},ensure_ascii=False))
    if response.status_code!=200:sys.exit(1)

if __name__=='__main__':
    try: asyncio.run(main())
    except Exception:
        print('Probe failed; no configuration or exception details printed.');sys.exit(1)
