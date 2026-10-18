"""Server-only configuration: a small inert .env parser, never an executable shell."""
import math
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

KEYS = {'GEMINI_API_KEY','GOOGLE_API_KEY','GEMINI_MODEL','GEMINI_TIMEOUT_SECONDS','GEMINI_API_VERSION'}

@dataclass(frozen=True)
class Settings:
    api_key: str = field(default='', repr=False)
    model: str = ''
    timeout: float = 110
    api_version: str = 'v1beta'
    valid: bool = True

    @property
    def configured(self):
        return bool(self.valid and self.api_key.strip() and self.model.strip()
            and self.model == self.model.strip() and len(self.model) <= 200
            and re.fullmatch(r'[A-Za-z0-9._/-]+',self.model)
            and math.isfinite(self.timeout) and 0 < self.timeout <= 180
            and self.api_version in ('v1','v1beta'))


def load_settings(environ=None):
    env = os.environ if environ is None else environ
    path = Path(env.get('WISP_ENV_FILE') or Path(__file__).resolve().parents[3] / '.env')
    values = {}
    try:
        if path.exists():
            if path.stat().st_size > 65536:
                return Settings(valid=False)
            for line in path.read_text(encoding='utf-8-sig').splitlines():
                line=line.strip()
                if not line or line.startswith('#') or '=' not in line: continue
                key,value=line.split('=',1);key=key.strip();value=value.strip()
                if key not in KEYS: continue
                if len(value)>1 and value[0]==value[-1] and value[0] in ('"',"'"): value=value[1:-1]
                else: value=value.split(' #',1)[0].rstrip()
                values[key]=value
        values.update({key:env[key] for key in KEYS if key in env})
        # Either process key takes precedence over either file alias.
        key = (env.get('GEMINI_API_KEY') or env.get('GOOGLE_API_KEY')) if any(k in env for k in ('GEMINI_API_KEY','GOOGLE_API_KEY')) else (values.get('GEMINI_API_KEY') or values.get('GOOGLE_API_KEY'))
        return Settings(api_key=key or '',model=values.get('GEMINI_MODEL',''),
            timeout=float(values.get('GEMINI_TIMEOUT_SECONDS','110')),
            api_version=values.get('GEMINI_API_VERSION','v1beta'))
    except (OSError,UnicodeError,ValueError):
        return Settings(valid=False)
