"""Explicit multi-material requests and source-local evidence binding."""
from typing import Annotated, Literal
from pydantic import AfterValidator, Field, model_validator
from .check_contract import Contract, Finding, GeneratedCheck, Quote, Short, Snapshot, bounded, utf16
from .text_contract import GeneratedCreate, GeneratedUnderstand, KeyPoint, SourceFact, bind_evidence, validate_total


class BatchRequest(Contract):
    id: Short
    snapshots: Annotated[list[Snapshot], Field(min_length=2, max_length=12)]
    instruction: Annotated[str, AfterValidator(bounded(4000, False))]

    @model_validator(mode='after')
    def distinct_bounded_sources(self):
        for field in ('id', 'materialId'):
            if len({getattr(item, field) for item in self.snapshots}) != len(self.snapshots):
                raise ValueError('Distinct snapshots and materials are required')
        if sum(utf16(item.text) for item in self.snapshots) > 60000:
            raise ValueError('Combined text budget exceeded')
        return self


class BatchUnderstandRequest(BatchRequest):
    summaryStyle: Literal['brief', 'standard']


class BatchQuote(Quote):
    sourceIndex: Annotated[int, Field(ge=1, le=12)]


class BatchFinding(Finding):
    evidence: Annotated[list[BatchQuote], Field(min_length=1, max_length=8)]


class GeneratedBatchCheck(GeneratedCheck):
    findings: Annotated[list[BatchFinding], Field(max_length=20)]

    @model_validator(mode='after')
    def total_budget(self):
        validate_total(self.model_dump())
        return self


class BatchKeyPoint(KeyPoint):
    evidence: Annotated[list[BatchQuote], Field(min_length=1, max_length=4)]


class GeneratedBatchUnderstand(GeneratedUnderstand):
    summaryEvidence: Annotated[list[BatchQuote], Field(max_length=8)]
    keyPoints: Annotated[list[BatchKeyPoint], Field(max_length=8)]


class BatchSourceFact(SourceFact):
    evidence: Annotated[list[BatchQuote], Field(min_length=1, max_length=4)]


class GeneratedBatchCreate(GeneratedCreate):
    sourceFacts: Annotated[list[BatchSourceFact], Field(max_length=12)]


def bind_batch_evidence(items, snapshots):
    result=[]
    for item in items:
        if item.sourceIndex > len(snapshots):
            raise ValueError('Evidence source is not in this batch')
        bound=bind_evidence([item], snapshots[item.sourceIndex-1].text)[0]
        result.append({'sourceIndex':item.sourceIndex, **bound})
    return result


def bind_batch_output(generated, snapshots, operation, style=None):
    result=generated.model_dump()
    if operation == 'understand':
        if style == 'brief' and (utf16(generated.summary) > 1200 or len(generated.keyPoints) > 3):
            raise ValueError('Brief summary limit exceeded')
        result['summaryEvidence']=bind_batch_evidence(generated.summaryEvidence, snapshots)
        entries=generated.keyPoints
        field='keyPoints'
        outcome='ready' if generated.summary else 'needs_information'
    elif operation == 'check':
        entries=generated.findings
        field='findings'
        outcome='findings' if entries else ('needs_information' if generated.missingInformation else 'no_findings')
    else:
        entries=generated.sourceFacts
        field='sourceFacts'
        outcome='draft' if generated.draft else 'needs_information'
    result[field]=[{**item.model_dump(), 'evidence':bind_batch_evidence(item.evidence, snapshots)} for item in entries]
    validate_total(result)
    return {**result, 'outcome':outcome}


def supplier_schema(operation):
    """Portable inline schema; local models enforce all counts and source bounds."""
    def obj(properties): return {'type':'object', 'properties':properties, 'required':list(properties)}
    def arr(items): return {'type':'array', 'items':items}
    string={'type':'string'}
    evidence=arr(obj({'sourceIndex':{'type':'integer'}, 'quote':string, 'occurrence':{'type':'integer'}}))
    if operation == 'check':
        return obj({'findings':arr(obj({'title':string, 'explanation':string, 'suggestion':string, 'evidence':evidence})),
                    'missingInformation':arr(string)})
    if operation == 'understand':
        return obj({'summary':string, 'summaryEvidence':evidence,
                    'keyPoints':arr(obj({'title':string, 'explanation':string, 'evidence':evidence})),
                    'missingInformation':arr(string)})
    if operation == 'create':
        return obj({'draft':string, 'alternatives':arr(obj({'title':string, 'description':string})),
                    'sourceFacts':arr(obj({'statement':string, 'evidence':evidence})),
                    'assumptions':arr(string), 'missingInformation':arr(string)})
    raise ValueError('Unknown operation')
