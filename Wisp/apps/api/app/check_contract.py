"""Strict request and generated-output validation; offsets are snapshot-local UTF-16."""
import re
from datetime import datetime
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, AfterValidator, model_validator


def utf16(text):
    return len(text.encode('utf-16-le'))//2


def bounded(limit, nonblank=True):
    def validate(value):
        if utf16(value)>limit or (nonblank and not value.strip()):
            raise ValueError('Invalid text length')
        return value
    return validate

def valid_date(value):
    bounded(200)(value)
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?)?', value):
        raise ValueError('Invalid date')
    datetime.fromisoformat(value)
    return value

DateText = Annotated[str, AfterValidator(valid_date)]
Short = Annotated[str, AfterValidator(bounded(200))]
Prose = Annotated[str, AfterValidator(bounded(4000))]
SafeInt = Annotated[int, Field(ge=0, le=9007199254740991)]

class Contract(BaseModel):
    model_config = ConfigDict(extra='forbid',strict=True)

    @model_validator(mode='before')
    @classmethod
    def no_explicit_null(cls, value):
        if isinstance(value,dict) and any(item is None for item in value.values()):
            raise ValueError('Explicit null is not supported')
        return value

class Origin(Contract):
    kind: Literal['new_text','pasted_text','txt_file','docx_file','pptx_file','xlsx_file','pdf_file']
    addedAt: DateText
    note: Annotated[str, AfterValidator(bounded(2000,False))] | None = None
    fileName: Annotated[str, AfterValidator(bounded(1000,False))] | None = None
    byteSize: SafeInt | None = None
    lastModified: SafeInt | None = None
    encoding: Literal['UTF-8'] | None = None

class Snapshot(Contract):
    id: Short
    materialId: Short
    materialVersion: Annotated[int,Field(ge=1,le=9007199254740991)]
    title: Annotated[str,AfterValidator(bounded(1000,False))]
    text: Annotated[str,AfterValidator(bounded(60000))]
    start: SafeInt
    end: SafeInt
    capturedAt: DateText
    source: Literal['virtual_document','new_text','pasted_text','txt_file','docx_file','pptx_file','xlsx_file','pdf_file'] | None = None
    origin: Origin | None = None

    @model_validator(mode='after')
    def ranges(self):
        if self.end-self.start != utf16(self.text): raise ValueError('Invalid range')
        return self

class CheckRequest(Contract):
    snapshot: Snapshot
    instruction: Annotated[str,AfterValidator(bounded(4000,False))]

class Quote(Contract):
    quote: Annotated[str,AfterValidator(bounded(2000))]
    occurrence: Annotated[int,Field(ge=1,le=60000)]

class Finding(Contract):
    title: Annotated[str,AfterValidator(bounded(300))]
    explanation: Prose
    suggestion: Prose
    evidence: Annotated[list[Quote],Field(min_length=1,max_length=8)]

class GeneratedCheck(Contract):
    findings: Annotated[list[Finding],Field(max_length=20)]
    missingInformation: Annotated[list[Prose],Field(max_length=20)]



def supplier_schema():
    """Portable inline shape only. GeneratedCheck remains the strict trust boundary."""
    return {
        'type': 'object',
        'properties': {
            'findings': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'title': {'type': 'string'},
                        'explanation': {'type': 'string'},
                        'suggestion': {'type': 'string'},
                        'evidence': {
                            'type': 'array',
                            'items': {
                                'type': 'object',
                                'properties': {'quote': {'type': 'string'}, 'occurrence': {'type': 'integer'}},
                                'required': ['quote', 'occurrence'],
                            },
                        },
                    },
                    'required': ['title', 'explanation', 'suggestion', 'evidence'],
                },
            },
            'missingInformation': {'type': 'array', 'items': {'type': 'string'}},
        },
        'required': ['findings', 'missingInformation'],
    }
def bind_findings(generated, text):
    findings=[]
    for finding in generated.findings:
        evidence=[]
        for item in finding.evidence:
            pos=-1
            for _ in range(item.occurrence):
                pos=text.find(item.quote,pos+1)
                if pos<0: raise ValueError('Evidence does not match')
            start=utf16(text[:pos])
            evidence.append({'start':start,'end':start+utf16(item.quote),'quote':item.quote})
        findings.append({'title':finding.title,'explanation':finding.explanation,
                         'suggestion':finding.suggestion,'evidence':evidence})
    return findings



