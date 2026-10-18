"""Bounded local text extraction. No model, URL fetching, or source-file writes."""
import asyncio
import io
import json
import sys
import zipfile
from pathlib import Path

MAX_BYTES = 20_000_000
MAX_TEXT = 60_000
TIMEOUT = 30
FORMATS = ('docx', 'pptx', 'xlsx', 'pdf')
ERRORS = {
    'IMPORT_FORMAT_UNSUPPORTED': (415, 'Only DOCX, PPTX, XLSX, and PDF text extraction are supported.'),
    'IMPORT_FILE_TOO_LARGE': (413, 'A single file must not exceed 20 MB. Split the file and try again.'),
    'IMPORT_TEXT_TOO_LARGE': (413, 'Extracted text exceeds 60,000 UTF-16 units. Split the file and try again.'),
    'IMPORT_FILE_INVALID': (422, 'The file is corrupted or its format does not match the extension. Export it again and try again.'),
    'IMPORT_ENCRYPTED': (422, 'Encrypted files are not supported yet. Use a decrypted copy.'),
    'IMPORT_NO_TEXT': (422, 'No extractable text found. Scanned or image-only files require OCR first.'),
    'IMPORT_LIMIT_EXCEEDED': (413, 'File contents or page count exceed the parsing limit. Split the file and try again.'),
    'IMPORT_TIMEOUT': (408, 'Reading timed out and was stopped. Split the file and try again.'),
    'IMPORT_BUSY': (503, 'A file is already being read. Try again later.'),
    'IMPORT_FAILED': (422, 'Failed to read the file. Export it again and try again.'),
}


class ImportFailure(Exception):
    def __init__(self, code):
        self.code = code
        self.status, self.message = ERRORS[code]
        super().__init__(self.message)


def units(text):
    return len(text.encode('utf-16-le')) // 2


class Text:
    def __init__(self):
        self.parts = []
        self.length = 0
        self.has_content = False

    def add(self, text, *, marker=False):
        text = text.replace('\r\n', '\n').replace('\r', '\n').replace('\v', '\n')
        if '\0' in text:
            raise ImportFailure('IMPORT_FILE_INVALID')
        self.length += units(text) + (1 if self.parts else 0)
        if self.length > MAX_TEXT:
            raise ImportFailure('IMPORT_TEXT_TOO_LARGE')
        self.parts.append(text)
        if not marker and text.strip():
            self.has_content = True

    def finish(self):
        if not self.has_content:
            raise ImportFailure('IMPORT_NO_TEXT')
        return '\n'.join(self.parts)


def check_office(data, format):
    from defusedxml.ElementTree import fromstring
    required = {'docx': 'word/document.xml', 'pptx': 'ppt/presentation.xml', 'xlsx': 'xl/workbook.xml'}[format]
    content_type = {
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
    }[format]
    if data.startswith(b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'):
        # Office encrypted containers use OLE rather than an OOXML ZIP.
        if 'EncryptedPackage'.encode('utf-16-le') in data:
            raise ImportFailure('IMPORT_ENCRYPTED')
        raise ImportFailure('IMPORT_FILE_INVALID')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        names = [item.filename for item in entries]
        if len(entries) > 2000 or sum(item.file_size for item in entries) > 50_000_000:
            raise ImportFailure('IMPORT_LIMIT_EXCEEDED')
        if len(set(names)) != len(names) or required not in names or '[Content_Types].xml' not in names:
            raise ImportFailure('IMPORT_FILE_INVALID')
        for item in entries:
            if item.flag_bits & 1:
                raise ImportFailure('IMPORT_ENCRYPTED')
            if item.file_size > 12_000_000:
                raise ImportFailure('IMPORT_LIMIT_EXCEEDED')
            if 'vbaproject' in item.filename.lower():
                raise ImportFailure('IMPORT_FORMAT_UNSUPPORTED')
            if item.filename.lower().endswith(('.xml', '.rels')):
                # Reject DTDs/entities before any format-specific library parses XML.
                fromstring(archive.read(item), forbid_dtd=True)
        manifest = fromstring(archive.read('[Content_Types].xml'), forbid_dtd=True)
        if not any(node.attrib.get('PartName') == '/' + required and node.attrib.get('ContentType') == content_type for node in manifest):
            raise ImportFailure('IMPORT_FILE_INVALID')


def read_docx(data, output):
    from docx import Document
    from docx.table import Table

    def blocks(container, depth=0):
        if depth > 20:
            raise ImportFailure('IMPORT_LIMIT_EXCEEDED')
        for block in container.iter_inner_content():
            if isinstance(block, Table):
                seen = set()
                for row in block.rows:
                    cells = []
                    for cell in row.cells:
                        if cell._tc in seen:
                            cells.append('')
                        else:
                            seen.add(cell._tc)
                            cells.append('\n'.join(blocks(cell, depth + 1)))
                    yield '\t'.join(cells)
            else:
                yield block.text

    for text in blocks(Document(io.BytesIO(data))):
        output.add(text)
    return ['Text and tables were extracted. Images, headers, footers, comments, text boxes, and tracked changes were not included; review the preview.']


def read_pptx(data, output):
    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE
    presentation = Presentation(io.BytesIO(data))
    if len(presentation.slides) > 300:
        raise ImportFailure('IMPORT_LIMIT_EXCEEDED')
    count = 0

    def shapes(items, depth=0):
        nonlocal count
        if depth > 20:
            raise ImportFailure('IMPORT_LIMIT_EXCEEDED')
        for shape in items:
            count += 1
            if count > 10000:
                raise ImportFailure('IMPORT_LIMIT_EXCEEDED')
            if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
                shapes(shape.shapes, depth + 1)
            elif shape.has_table:
                for row in shape.table.rows:
                    output.add('\t'.join('' if cell.is_spanned else cell.text for cell in row.cells))
            elif shape.has_text_frame:
                output.add(shape.text)

    for number, slide in enumerate(presentation.slides, 1):
        output.add(f'[Slide {number}]', marker=True)
        shapes(slide.shapes)
    return ['Text and tables were extracted in slide and object order, including hidden slides; review the reading order.', 'Images, charts, SmartArt, speaker notes, and master text were not converted.']


def read_xlsx(data, output):
    from datetime import date, datetime, time as clock_time
    from openpyxl import load_workbook
    from openpyxl.utils import get_column_letter
    workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=False, keep_links=False)
    cells_read = 0
    try:
        if len(workbook.worksheets) > 100:
            raise ImportFailure('IMPORT_LIMIT_EXCEEDED')
        for sheet in workbook.worksheets:
            # Streaming writers may omit dimensions, and other producers may
            # declare stale bounds. Inspect bounded actual rows to avoid loss.
            sheet.reset_dimensions()
            rows = Text()
            columns = 1
            for row_number, row in enumerate(sheet.iter_rows(), 1):
                cells_read += len(row)
                if row_number > 10000 or len(row) > 200 or cells_read > 200000:
                    raise ImportFailure('IMPORT_LIMIT_EXCEEDED')
                columns = max(columns, len(row))
                values = []
                for cell in row:
                    value = cell.value
                    if value is None:
                        values.append('')
                    elif cell.data_type == 'f':
                        formula = value if isinstance(value, str) else getattr(value, 'text', '')
                        if not formula:
                            raise ImportFailure('IMPORT_FORMAT_UNSUPPORTED')
                        values.append('[Formula, not calculated] ' + formula)
                    elif isinstance(value, (datetime, date, clock_time)):
                        values.append(value.isoformat())
                    else:
                        values.append(str(value))
                if any(value.strip() for value in values):
                    rows.add(str(row_number) + '\t' + '\t'.join(values))
            suffix = ' (hidden)' if sheet.sheet_state != 'visible' else ''
            output.add(f'[Worksheet: {sheet.title}{suffix}]', marker=True)
            output.add('Row number\t' + '\t'.join(get_column_letter(n) for n in range(1, columns + 1)), marker=True)
            for row in rows.parts:
                output.add(row)
    finally:
        workbook.close()
    return ['Hidden worksheets and cells in hidden rows or columns are included; row numbers and column positions are preserved, and blank rows are omitted.', 'Formulas are shown as their original text and are not recalculated; number formats, images, charts, and comments are not preserved.']


def read_pdf(data, output):
    from pypdf import PdfReader, apply_configuration
    from pypdf.errors import LimitReachedError
    if not data.lstrip().startswith(b'%PDF-'):
        raise ImportFailure('IMPORT_FILE_INVALID')
    empty = []
    try:
        with apply_configuration(maximum_declared_stream_length=8_000_000,
                array_based_stream_maximum_output_length=8_000_000,
                zlib_maximum_output_length=8_000_000, lzw_maximum_output_length=8_000_000,
                run_length_maximum_output_length=8_000_000,
                stream_decoding_work_maximum_length=24_000_000):
            reader = PdfReader(io.BytesIO(data), strict=True)
            if reader.is_encrypted:
                raise ImportFailure('IMPORT_ENCRYPTED')
            if len(reader.pages) > 300:
                raise ImportFailure('IMPORT_LIMIT_EXCEEDED')
            for number, page in enumerate(reader.pages, 1):
                contents = page.get_contents()
                if contents is not None and len(contents.get_data()) > 8_000_000:
                    raise ImportFailure('IMPORT_LIMIT_EXCEEDED')
                text = page.extract_text()
                output.add(f'[Page {number}]', marker=True)
                if text.strip():
                    output.add(text)
                else:
                    empty.append(number)
                    output.add('[No text extracted on this page]', marker=True)
    except LimitReachedError:
        raise ImportFailure('IMPORT_LIMIT_EXCEEDED') from None
    warnings = ['Only the existing text layer is extracted; OCR is not performed. Review complex columns, tables, and text order against the original.']
    if empty:
        listed = ', '.join(map(str, empty[:20]))
        warnings.append(f'Pages {listed}' + (f' and {len(empty) - 20} more' if len(empty) > 20 else '') + ' had no extracted text and may be blank or image-only.')
    return warnings


def extract_text(data, format):
    if format not in FORMATS:
        raise ImportFailure('IMPORT_FORMAT_UNSUPPORTED')
    if len(data) > MAX_BYTES:
        raise ImportFailure('IMPORT_FILE_TOO_LARGE')
    if not data:
        raise ImportFailure('IMPORT_FILE_INVALID')
    try:
        if format != 'pdf':
            check_office(data, format)
        output = Text()
        warnings = {'docx': read_docx, 'pptx': read_pptx, 'xlsx': read_xlsx, 'pdf': read_pdf}[format](data, output)
        return {'schemaVersion': 'import-text-1', 'format': format, 'text': output.finish(), 'warnings': warnings}
    except ImportFailure:
        raise
    except Exception:
        # Never send file contents, library exceptions, or local paths to the client.
        raise ImportFailure('IMPORT_FILE_INVALID') from None


async def parse_in_process(data, format, request):
    """One disposable child per import; kill/reap it on timeout or disconnect."""
    child = await asyncio.create_subprocess_exec(
        sys.executable, '-I', '-B', str(Path(__file__).with_name('import_worker.py')), format,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        **({'creationflags': 0x08000000} if sys.platform == 'win32' else {}))
    communication = asyncio.create_task(child.communicate(data))

    async def wait_for_disconnect():
        # The route has consumed the complete body before starting this task.
        # Await receive directly: is_disconnected's immediate CancelScope loses
        # disconnect messages behind Starlette's BaseHTTPMiddleware wrapper.
        while True:
            if (await request.receive())['type'] == 'http.disconnect':
                return

    disconnected = asyncio.create_task(wait_for_disconnect())
    try:
        completed, _ = await asyncio.wait(
            {communication, disconnected}, timeout=TIMEOUT,
            return_when=asyncio.FIRST_COMPLETED)
        if disconnected in completed:
            await disconnected
            raise asyncio.CancelledError()
        if communication not in completed:
            raise ImportFailure('IMPORT_TIMEOUT')
        stdout, _ = await communication
        if child.returncode != 0 or len(stdout) > 500_000:
            raise ImportFailure('IMPORT_FAILED')
        result = json.loads(stdout)
        if 'error' in result:
            raise ImportFailure(result['error'] if result['error'] in ERRORS else 'IMPORT_FAILED')
        return result
    finally:
        if child.returncode is None:
            try:
                child.kill()
            except ProcessLookupError:
                pass
        await child.wait()
        for task in (communication, disconnected):
            if not task.done():
                task.cancel()
        await asyncio.gather(communication, disconnected, return_exceptions=True)


def install_import_route(api):
    from fastapi import Request
    from fastapi.responses import JSONResponse
    active = 0

    @api.post('/api/import-text')
    async def import_text(request: Request):
        nonlocal active
        try:
            if active >= 2:
                raise ImportFailure('IMPORT_BUSY')
            format = request.query_params.get('format')
            if format not in FORMATS or request.headers.get('content-type', '').split(';')[0].lower() != 'application/octet-stream':
                raise ImportFailure('IMPORT_FORMAT_UNSUPPORTED')
            active += 1
            try:
                body = bytearray()
                async for chunk in request.stream():
                    if len(body) + len(chunk) > MAX_BYTES:
                        raise ImportFailure('IMPORT_FILE_TOO_LARGE')
                    body.extend(chunk)
                return await parse_in_process(bytes(body), format, request)
            finally:
                active -= 1
        except ImportFailure as failure:
            return JSONResponse(status_code=failure.status, content={'error': {
                'code': failure.code, 'message': failure.message,
                'request_id': getattr(request.state, 'request_id', 'unavailable')}})
