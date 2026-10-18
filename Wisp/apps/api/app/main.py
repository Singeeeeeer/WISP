"""Wisp text API; no persistent task queue and no Watch model execution."""
import hashlib
import logging
import os
import time
import uuid
from collections import OrderedDict
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from .config import load_settings
from .check_contract import CheckRequest
from .text_contract import UnderstandRequest, CreateRequest
from .connection_contract import ConnectionRequest
from .batch_contract import BatchRequest, BatchUnderstandRequest
from .batch_gemini import run_batch
from .import_text import install_import_route
from .gemini import Gemini, ModelFailure, strict_json

logger=logging.getLogger('wisp')
MESSAGES={
    'MODEL_NOT_CONFIGURED':'Model service is not configured', 'MODEL_AUTH_FAILED':'Model service authentication failed',
    'MODEL_NOT_FOUND':'Configured model is unavailable', 'MODEL_QUOTA_EXCEEDED':'Model service quota exceeded. Try again later.',
    'MODEL_UNAVAILABLE':'Model service is temporarily unavailable', 'MODEL_TIMEOUT':'Model request timed out. Try again later.',
    'MODEL_CONNECTION_CLOSED':'Unable to connect to the model service. Try again later.', 'MODEL_OUTPUT_INVALID':'Model output failed validation. Try again.',
    'INVALID_REQUEST':'Request format or material scope is invalid', 'REQUEST_TOO_LARGE':'Request content exceeds the size limit',
    'REQUEST_CONFLICT':'This snapshot identifier was used for a different request', 'REQUEST_IN_PROGRESS':'This request is already being processed',
    'SERVER_BUSY':'Service is busy. Try again later.', 'NOT_IMPLEMENTED':'Background task service is not enabled',
    'HTTP_ERROR':'The request could not be processed', 'INTERNAL_ERROR':'Service is temporarily unavailable'}


def create_app(settings=None, *, transport=None):
    api=FastAPI(title='Wisp API',version='0.2.0')
    install_import_route(api)
    engine=Gemini(settings if settings is not None else load_settings(),transport)
    api.state.engine=engine
    completed=OrderedDict()
    inflight={}
    cache_ttl=300
    cache_limit=32

    def error(request,code,status):
        return JSONResponse(status_code=status,content={'error':{'code':code,'message':MESSAGES[code],
            'request_id':getattr(request.state,'request_id','unavailable')}})

    @api.middleware('http')
    async def request_identity(request:Request,call_next):
        request.state.request_id=str(uuid.uuid4())
        # Bound decoded request bytes before FastAPI/Pydantic allocate the object graph.
        if request.url.path in ('/api/check','/api/understand','/api/create','/api/connections',
                               '/api/batch/check','/api/batch/understand','/api/batch/create'):
            body=bytearray()
            try:
                async for chunk in request.stream():
                    if len(body)+len(chunk)>400000:
                        response=error(request,'REQUEST_TOO_LARGE',413)
                        response.headers['X-Request-ID']=request.state.request_id
                        return response
                    body.extend(chunk)
                request._body=bytes(body)
            except Exception:
                return error(request,'INVALID_REQUEST',422)
        response=await call_next(request)
        response.headers['X-Request-ID']=request.state.request_id
        logger.info('request=%s method=%s status=%s',request.state.request_id,request.method,response.status_code)
        return response

    @api.exception_handler(HTTPException)
    async def http_error(request,exc):
        return error(request,'NOT_IMPLEMENTED' if exc.status_code==501 else 'HTTP_ERROR',exc.status_code)

    @api.exception_handler(RequestValidationError)
    async def validation_error(request,exc): return error(request,'INVALID_REQUEST',422)

    @api.exception_handler(ModelFailure)
    async def model_error(request,exc): return error(request,exc.code,exc.status)

    @api.exception_handler(Exception)
    async def unexpected_error(request,exc): return error(request,'INTERNAL_ERROR',500)

    @api.get('/api/health')
    async def health():
        return {'status':'ok','service':'wisp','environment':os.environ.get('WISP_ENVIRONMENT','local'),
            'model_connected':engine.verified,
            'model_status':'verified' if engine.verified else ('configured' if engine.settings.configured else 'unconfigured'),
            'jobs_enabled':False}

    async def execute(request:Request, operation, contract, *, batch=False):
        try:
            parsed=strict_json(await request.body())
            value=contract.model_validate(parsed)
        except (ValueError,TypeError,UnicodeError):
            return error(request,'INVALID_REQUEST',422)
        if not engine.settings.configured: raise ModelFailure('MODEL_NOT_CONFIGURED',503)
        # Hash every field (including optional source metadata), preserving exact identity.
        import json
        identity=hashlib.sha256(json.dumps({'scope':'batch' if batch else 'single','operation':operation,'request':parsed},sort_keys=True,ensure_ascii=True,separators=(',',':')).encode()).hexdigest()
        key=value.id if batch or operation=='connect' else value.snapshot.id
        now=time.monotonic()
        for old_key in list(completed):
            if completed[old_key][0]<=now: del completed[old_key]
        if key in completed:
            _,previous,result=completed[key]
            if previous!=identity: raise ModelFailure('REQUEST_CONFLICT',409)
            completed.move_to_end(key)
            return result
        if key in inflight:
            raise ModelFailure('REQUEST_IN_PROGRESS' if inflight[key]==identity else 'REQUEST_CONFLICT',409)
        if len(inflight)>=8: raise ModelFailure('SERVER_BUSY',503)
        inflight[key]=identity
        try:
            result=await run_batch(engine,operation,value) if batch else await getattr(engine,operation)(value)
            completed[key]=(time.monotonic()+cache_ttl,identity,result)
            while len(completed)>cache_limit: completed.popitem(last=False)
            return result
        finally:
            inflight.pop(key,None)

    @api.post('/api/check')
    async def check(request:Request):
        return await execute(request,'check',CheckRequest)

    @api.post('/api/understand')
    async def understand(request:Request):
        return await execute(request,'understand',UnderstandRequest)

    @api.post('/api/create')
    async def create(request:Request):
        return await execute(request,'create',CreateRequest)

    @api.post('/api/connections')
    async def connections(request:Request):
        return await execute(request,'connect',ConnectionRequest)

    @api.post('/api/batch/check')
    async def batch_check(request:Request):
        return await execute(request,'check',BatchRequest,batch=True)

    @api.post('/api/batch/understand')
    async def batch_understand(request:Request):
        return await execute(request,'understand',BatchUnderstandRequest,batch=True)

    @api.post('/api/batch/create')
    async def batch_create(request:Request):
        return await execute(request,'create',BatchRequest,batch=True)

    @api.post('/api/jobs')
    async def unavailable_jobs():
        raise HTTPException(status_code=501,detail='Background task service is not enabled')

    return api

app=create_app()
