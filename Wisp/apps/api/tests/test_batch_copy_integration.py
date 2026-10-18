"""PDF-03/04 copy provenance remains valid in PDF-05 batch operations."""
import copy
import json
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from app.config import Settings

with patch('app.config.load_settings', return_value=Settings()):
    from app.main import create_app

from test_batch import OPERATIONS, evidence_in, output, request as batch_request, wire
from test_material_copy import request as copy_request


def request(operation='check'):
    body = batch_request(operation)
    for index, kind in enumerate(('document_copy', 'selection_copy')):
        source = body['snapshots'][index]
        source['source'] = kind
        source['origin'] = copy_request(kind)['snapshot']['origin']
        source['origin']['copy']['materialId'] += '-' + str(index)
        units = len(source['text'].encode('utf-16-le')) // 2
        source['start'], source['end'] = 0, units
        source['origin']['copy']['end'] = source['origin']['copy']['start'] + units
    return body


class BatchCopyIntegrationTests(unittest.TestCase):
    def client(self, operation, calls):
        def handler(req):
            calls.append(req)
            payload = json.loads(req.content)
            expected = {
                'sources': [{'sourceIndex': i, 'text': s['text']}
                            for i, s in enumerate(request(operation)['snapshots'], 1)],
                'instruction': 'Review together',
            }
            if operation == 'understand':
                expected['summaryStyle'] = 'standard'
            self.assertEqual(json.loads(payload['input']), expected)
            self.assertNotIn('private', req.content.decode())
            return httpx.Response(200, json=wire(output(operation)))
        return TestClient(create_app(
            Settings(api_key='mock-key', model='mock-model'),
            transport=httpx.MockTransport(handler),
        ))

    def test_three_batch_routes_preserve_both_copy_origins_and_numbered_evidence(self):
        for operation in OPERATIONS:
            with self.subTest(operation=operation):
                body, calls = request(operation), []
                with self.client(operation, calls) as client:
                    response = client.post('/api/batch/' + operation, json=body)
                self.assertEqual(response.status_code, 200, response.text)
                result = response.json()
                self.assertEqual(result['snapshots'], body['snapshots'])
                self.assertEqual(evidence_in(result, operation), [
                    {'sourceIndex': 1, 'quote': 'aba', 'start': 4, 'end': 7},
                    {'sourceIndex': 2, 'quote': 'aba', 'start': 8, 'end': 11},
                ])
                self.assertEqual(len(calls), 1)

    def test_corrupt_copy_metadata_is_rejected_before_any_batch_model_call(self):
        for operation in OPERATIONS:
            cases = []
            for index in (0, 1):
                missing = request(operation)
                del missing['snapshots'][index]['origin']['copy']
                cases.append(missing)
                invalid = request(operation)
                invalid['snapshots'][index]['origin']['copy']['materialVersion'] = True
                cases.append(invalid)
                mismatched = request(operation)
                mismatched['snapshots'][index]['origin']['kind'] = 'pasted_text'
                cases.append(mismatched)
            invalid_range = request(operation)
            invalid_range['snapshots'][0]['origin']['copy']['start'] = 1
            cases.append(invalid_range)
            calls = []
            with self.client(operation, calls) as client:
                for body in cases:
                    with self.subTest(operation=operation, body=body):
                        response = client.post('/api/batch/' + operation, json=body)
                        self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(calls, [])

    def test_changed_original_copy_version_conflicts_with_confirmed_batch_identity(self):
        calls = []
        body = request()
        with self.client('check', calls) as client:
            self.assertEqual(client.post('/api/batch/check', json=body).status_code, 200)
            changed = copy.deepcopy(body)
            changed['snapshots'][1]['origin']['copy']['materialVersion'] += 1
            response = client.post('/api/batch/check', json=changed)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()['error']['code'], 'REQUEST_CONFLICT')
        self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()
