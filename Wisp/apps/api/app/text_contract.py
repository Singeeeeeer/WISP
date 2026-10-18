"""Strict, independent Understand/Create contracts and exact quote binding."""
from typing import Annotated, Literal
from pydantic import AfterValidator, Field, model_validator
from .check_contract import Contract, CheckRequest, Quote, bounded, utf16

Text200 = Annotated[str, AfterValidator(bounded(200))]
Text1000 = Annotated[str, AfterValidator(bounded(1000))]
Text2000 = Annotated[str, AfterValidator(bounded(2000))]
Text4000 = Annotated[str, AfterValidator(bounded(4000))]
Evidence = Annotated[list[Quote], Field(min_length=1, max_length=4)]
Missing = Annotated[list[Text2000], Field(max_length=10)]

class UnderstandRequest(CheckRequest):
    summaryStyle: Literal['brief', 'standard']

class CreateRequest(CheckRequest):
    pass

def text_units(value):
    if isinstance(value, str): return utf16(value)
    if isinstance(value, list): return sum(text_units(item) for item in value)
    if isinstance(value, dict): return sum(text_units(item) for item in value.values())
    return 0

def validate_total(value):
    if text_units(value) > 60000: raise ValueError('Output text budget exceeded')

class TextOutput(Contract):
    @model_validator(mode='after')
    def total_budget(self):
        validate_total(self.model_dump())
        return self

class KeyPoint(Contract):
    title: Text200
    explanation: Text2000
    evidence: Evidence

class GeneratedUnderstand(TextOutput):
    summary: Annotated[str, AfterValidator(bounded(4000, False))]
    summaryEvidence: Annotated[list[Quote], Field(max_length=8)]
    keyPoints: Annotated[list[KeyPoint], Field(max_length=8)]
    missingInformation: Missing

    @model_validator(mode='after')
    def coherent(self):
        if self.summary:
            if not self.summary.strip() or not self.summaryEvidence: raise ValueError('Summary requires evidence')
        elif self.summaryEvidence or self.keyPoints or not self.missingInformation:
            raise ValueError('Empty summary requires missing information only')
        return self

class Alternative(Contract):
    title: Text200
    description: Text4000

class SourceFact(Contract):
    statement: Text1000
    evidence: Evidence

class GeneratedCreate(TextOutput):
    draft: Annotated[str, AfterValidator(bounded(12000, False))]
    alternatives: Annotated[list[Alternative], Field(max_length=2)]
    sourceFacts: Annotated[list[SourceFact], Field(max_length=12)]
    assumptions: Missing
    missingInformation: Missing

    @model_validator(mode='after')
    def coherent(self):
        if self.draft:
            if not self.draft.strip(): raise ValueError('Blank draft')
        elif self.alternatives or not self.missingInformation:
            raise ValueError('Empty draft requires missing information and no alternatives')
        return self

def bind_evidence(items, text):
    result=[]
    for item in items:
        pos=-1
        for _ in range(item.occurrence):
            pos=text.find(item.quote, pos+1)
            if pos < 0: raise ValueError('Evidence does not match')
        start=utf16(text[:pos])
        result.append({'start':start, 'end':start+utf16(item.quote), 'quote':item.quote})
    return result

def bind_understand(generated, text, style):
    if style == 'brief' and (utf16(generated.summary)>1200 or len(generated.keyPoints)>3):
        raise ValueError('Brief summary limit exceeded')
    result={'summary':generated.summary,
        'summaryEvidence':bind_evidence(generated.summaryEvidence,text),
        'keyPoints':[{'title':p.title,'explanation':p.explanation,'evidence':bind_evidence(p.evidence,text)} for p in generated.keyPoints],
        'missingInformation':generated.missingInformation}
    validate_total(result)
    return {**result,'outcome':'ready' if generated.summary else 'needs_information'}

def bind_create(generated, text):
    result={'draft':generated.draft,
        'alternatives':[item.model_dump() for item in generated.alternatives],
        'sourceFacts':[{'statement':p.statement,'evidence':bind_evidence(p.evidence,text)} for p in generated.sourceFacts],
        'assumptions':generated.assumptions,'missingInformation':generated.missingInformation}
    validate_total(result)
    return {**result,'outcome':'draft' if generated.draft else 'needs_information'}

def supplier_schema(operation):
    """Only inline basic schema keywords; strict local validation is authoritative."""
    def obj(properties): return {'type':'object','properties':properties,'required':list(properties)}
    def arr(items): return {'type':'array','items':items}
    string={'type':'string'}
    evidence=arr(obj({'quote':string,'occurrence':{'type':'integer'}}))
    if operation=='understand':
        return obj({'summary':string,'summaryEvidence':evidence,
            'keyPoints':arr(obj({'title':string,'explanation':string,'evidence':evidence})),
            'missingInformation':arr(string)})
    if operation=='create':
        return obj({'draft':string,'alternatives':arr(obj({'title':string,'description':string})),
            'sourceFacts':arr(obj({'statement':string,'evidence':evidence})),
            'assumptions':arr(string),'missingInformation':arr(string)})
    raise ValueError('Unknown operation')
