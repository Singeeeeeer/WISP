"""Frozen-copy provenance stays local and round-trips through all capabilities."""
import copy
import json
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from app.config import Settings

with patch('app.config.load_settings', return_value=Settings()):
    from app.main import create_app


def request(kind='document_copy'):
    return {
        'snapshot': {
            'id': 'copy-snapshot', 'materialId': 'copy-id', 'materialVersion': 1,
            'title': 'private copied title', 'text': '😀正文', 'start': 0, 'end': 4,
            'capturedAt': '2026-10-18T00:00:00Z', 'source': kind,
            'origin': {
                'kind': kind, 'addedAt': '2026-10-18T00:00:00Z',
                'fileName': 'private.pdf', 'byteSize': 123, 'lastModified': 456,
                'note': 'Only text was extracted.',
                'copy': {
                    'materialId': 'private-original', 'materialVersion': 3,
                    'title': 'private original title',
                    'start': 0 if kind == 'document_copy' else 10,
                    'end': 4 if kind == 'document_copy' else 14,
                    'source': 'pdf_file',
                },
            },
        },
        'instruction': '处理材料',
    }


def output(operation):
    if operation == 'check':
        return {'findings': [], 'missingInformation': ['Need a date.']}
    if operation == 'understand':
        return {'summary': '', 'summaryEvidence': [], 'keyPoints': [], 'missingInformation': ['Need a date.']}
    return {'draft': '', 'alternatives': [], 'sourceFacts': [], 'assumptions': [], 'missingInformation': ['Need a date.']}


class MaterialCopyTests(unittest.TestCase):
    def client(self, operation):
        calls = []

        def handler(req):
            calls.append(req)
            self.assertNotIn('private', req.content.decode())
            return httpx.Response(200, json={
                'status': 'completed', 'model': 'mock-model',
                'outputs': [{'type': 'text', 'text': json.dumps(output(operation))}],
            })

        client = TestClient(create_app(
            Settings(api_key='mock-key', model='mock-model'),
            transport=httpx.MockTransport(handler),
        ))
        return client, calls

    def test_all_capabilities_preserve_copy_provenance_without_sending_it_to_model(self):
        for kind in ('document_copy', 'selection_copy'):
            for operation in ('understand', 'check', 'create'):
                with self.subTest(kind=kind, operation=operation):
                    req = request(kind)
                    if operation == 'understand': req['summaryStyle'] = 'brief'
                    with self.client(operation)[0] as client:
                        response = client.post('/api/' + operation, json=req)
                        self.assertEqual(response.status_code, 200, response.text)
                        self.assertEqual(response.json()['snapshot'], req['snapshot'])
                        self.assertEqual(response.json()['outcome'], 'needs_information')

    def test_invalid_copy_fields_and_bindings_fail_before_model_call(self):
        malformed = [None, {}, {'extra': True}, {'materialId': ''},
                     {'materialVersion': True}, {'materialVersion': 0},
                     {'start': -1}, {'start': 1}, {'end': 0}, {'end': 60001},
                     {'source': 'unsupported'}, {'title': 'x' * 1001}]
        for operation in ('understand', 'check', 'create'):
            client, calls = self.client(operation)
            with client:
                for fields in malformed:
                    req = request()
                    if operation == 'understand': req['summaryStyle'] = 'brief'
                    if fields is None:
                        req['snapshot']['origin']['copy'] = None
                    elif not fields:
                        del req['snapshot']['origin']['copy']
                    else:
                        req['snapshot']['origin']['copy'].update(fields)
                    response = client.post('/api/' + operation, json=req)
                    self.assertEqual(response.status_code, 422, response.text)
                for change in ({'origin': None}, {'source': 'selection_copy'}, {'source': 'pdf_file'}):
                    req = request()
                    if operation == 'understand': req['summaryStyle'] = 'brief'
                    req['snapshot'].update(change)
                    self.assertEqual(client.post('/api/' + operation, json=req).status_code, 422)
                self.assertEqual(calls, [])

    def test_copy_range_is_original_capture_and_survives_later_edits_and_recopies(self):
        req = request('selection_copy')
        req['snapshot']['origin']['copy'].update(source='document_copy', end=20)
        with self.client('check')[0] as client:
            response = client.post('/api/check', json=req)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['snapshot'], req['snapshot'])
            changed = copy.deepcopy(req)
            changed['snapshot']['origin']['copy']['materialVersion'] += 1
            self.assertEqual(client.post('/api/check', json=changed).status_code, 409)
