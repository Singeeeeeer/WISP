"""Two-note connection candidates; all evidence stays local to its source note."""
from typing import Annotated
from pydantic import AfterValidator, Field, model_validator
from .check_contract import Contract, Quote, Short, bounded, utf16
from .text_contract import bind_evidence


class ConnectionNote(Contract):
    id: Short
    version: Annotated[int, Field(ge=1, le=9007199254740991)]
    title: Annotated[str, AfterValidator(bounded(1000, False))]
    text: Annotated[str, AfterValidator(bounded(60000))]


class ConnectionRequest(Contract):
    id: Short
    notes: Annotated[list[ConnectionNote], Field(min_length=2, max_length=2)]

    @model_validator(mode='after')
    def distinct_bounded_notes(self):
        if self.notes[0].id == self.notes[1].id:
            raise ValueError('Two distinct notes are required')
        if sum(utf16(note.text) for note in self.notes) > 60000:
            raise ValueError('Combined text budget exceeded')
        return self


class ConnectionQuote(Quote):
    noteId: Short


class GeneratedConnection(Contract):
    title: Annotated[str, AfterValidator(bounded(300))]
    explanation: Annotated[str, AfterValidator(bounded(4000))]
    evidence: Annotated[list[ConnectionQuote], Field(min_length=2, max_length=8)]


class GeneratedConnections(Contract):
    connections: Annotated[list[GeneratedConnection], Field(max_length=1)]
    reason: Annotated[str, AfterValidator(bounded(4000, False))]

    @model_validator(mode='after')
    def explain_absence(self):
        if (not self.connections or self.reason) and not self.reason.strip():
            raise ValueError('No connection requires a nonblank reason')
        return self


def bind_connections(generated, notes):
    sources={note.id:note.text for note in notes}
    connections=[]
    for connection in generated.connections:
        if {item.noteId for item in connection.evidence} != set(sources):
            raise ValueError('Evidence must cover exactly both source notes')
        evidence=[]
        for item in connection.evidence:
            bound=bind_evidence([item],sources[item.noteId])[0]
            evidence.append({'noteId':item.noteId,**bound})
        connections.append({'title':connection.title,'explanation':connection.explanation,'evidence':evidence})
    return {'connections':connections,'reason':generated.reason}


def supplier_schema():
    """Portable inline shape; local contracts enforce bounds and source identity."""
    def obj(properties): return {'type':'object','properties':properties,'required':list(properties)}
    def arr(items): return {'type':'array','items':items}
    string={'type':'string'}
    evidence=arr(obj({'noteId':string,'quote':string,'occurrence':{'type':'integer'}}))
    return obj({'connections':arr(obj({'title':string,'explanation':string,'evidence':evidence})),
        'reason':string})
