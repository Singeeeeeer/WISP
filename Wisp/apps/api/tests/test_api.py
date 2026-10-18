import unittest
from fastapi.testclient import TestClient
from app.main import app

class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app, raise_server_exceptions=False)

    def test_health_does_not_claim_ai(self):
        result = self.client.get('/api/health')
        self.assertEqual(result.status_code, 200)
        self.assertFalse(result.json()['model_connected'])
        self.assertFalse(result.json()['jobs_enabled'])

    def test_unimplemented_jobs_are_explicit(self):
        response = self.client.post('/api/jobs', json={'text': 'private'})
        self.assertEqual(response.status_code, 501)
        self.assertEqual(response.json()['error']['code'], 'NOT_IMPLEMENTED')
        self.assertNotIn('private', response.text)

    def test_unknown_route_uses_error_envelope(self):
        response = self.client.get('/api/missing')
        self.assertEqual(response.status_code, 404)
        self.assertIn('request_id', response.json()['error'])
