"""Run one bounded extraction from stdin; stdout contains only the result contract."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_text import MAX_BYTES, ImportFailure, extract_text

if __name__ == '__main__':
    try:
        result = extract_text(sys.stdin.buffer.read(MAX_BYTES + 1), sys.argv[1])
    except ImportFailure as error:
        result = {'error': error.code}
    except Exception:
        result = {'error': 'IMPORT_FAILED'}
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=True).encode('ascii'))
